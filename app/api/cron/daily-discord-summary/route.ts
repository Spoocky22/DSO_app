import { NextRequest, NextResponse } from "next/server"
import { asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { sessions, targets } from "@/lib/db/schema"
import { FILTERS, formatDuration, normalizeFilterName, type FilterType } from "@/lib/dso"

export const runtime = "nodejs"

type SessionLike = {
  targetId: string
  panelIndex: number
  filter: FilterType
  subExposure: number
  subCount: number
  capturedAt: Date | null
  importedAt: Date | null
  createdAt: Date
}

type Bucket = {
  seconds: number
  subs: number
}

function exposureSeconds(session: SessionLike): number {
  return session.subExposure * session.subCount
}

function addToBucket(map: Map<string, Bucket>, key: string, seconds: number, subs: number) {
  const previous = map.get(key) ?? { seconds: 0, subs: 0 }
  map.set(key, { seconds: previous.seconds + seconds, subs: previous.subs + subs })
}

function formatSignedDuration(seconds: number): string {
  if (seconds <= 0) return "+0m"
  return `+${formatDuration(seconds)}`
}

function formatDateTime(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleString("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function panelTargetName(targetName: string, panelIndex: number): string {
  return panelIndex > 1 ? `${targetName} / P${panelIndex}` : targetName
}

async function postDiscord(content: string) {
  const webhookUrl = process.env.DISCORD_DAILY_WEBHOOK_URL?.trim() || process.env.DISCORD_WEBHOOK_URL?.trim()
  if (!webhookUrl) {
    return { ok: false, status: 500, error: "DISCORD_DAILY_WEBHOOK_URL is not configured" }
  }

  const username = process.env.DISCORD_DAILY_USERNAME?.trim() || "DSO Daily Stats"
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, content }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    return { ok: false, status: response.status, error: text || response.statusText }
  }

  return { ok: true, status: response.status }
}

function buildMessage(params: {
  allSessions: SessionLike[]
  recentSessions: SessionLike[]
  targetNames: Map<string, string>
  since: Date
}) {
  const { allSessions, recentSessions, targetNames, since } = params
  const allSeconds = allSessions.reduce((acc, session) => acc + exposureSeconds(session), 0)
  const allSubs = allSessions.reduce((acc, session) => acc + session.subCount, 0)
  const recentSeconds = recentSessions.reduce((acc, session) => acc + exposureSeconds(session), 0)
  const recentSubs = recentSessions.reduce((acc, session) => acc + session.subCount, 0)

  const totalByFilter = new Map<string, Bucket>()
  const deltaByFilter = new Map<string, Bucket>()
  const deltaByTarget = new Map<string, Bucket>()

  for (const session of allSessions) {
    addToBucket(totalByFilter, session.filter, exposureSeconds(session), session.subCount)
  }

  for (const session of recentSessions) {
    const seconds = exposureSeconds(session)
    addToBucket(deltaByFilter, session.filter, seconds, session.subCount)
    const baseTargetName = targetNames.get(session.targetId) ?? "Cible supprimée"
    addToBucket(deltaByTarget, `${panelTargetName(baseTargetName, session.panelIndex)} / ${session.filter}`, seconds, session.subCount)
  }

  const lastCapture = allSessions.reduce<Date | null>((latest, session) => {
    const date = session.capturedAt ?? session.createdAt
    if (!latest || date.getTime() > latest.getTime()) return date
    return latest
  }, null)

  const filterLines = FILTERS.map((filter) => {
    const total = totalByFilter.get(filter) ?? { seconds: 0, subs: 0 }
    const delta = deltaByFilter.get(filter) ?? { seconds: 0, subs: 0 }
    if (total.seconds <= 0 && delta.seconds <= 0) return null
    const deltaText = delta.seconds > 0 ? ` (${formatSignedDuration(delta.seconds)}, ${delta.subs} poses)` : ""
    return `- ${filter}: ${formatDuration(total.seconds)} · ${total.subs} poses${deltaText}`
  }).filter((line): line is string => Boolean(line))

  const targetLines = Array.from(deltaByTarget.entries())
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8)
    .map((row) => `- ${row.label}: ${formatSignedDuration(row.seconds)} · ${row.subs} poses`)

  const lines = [
    "**DSO — bilan quotidien NINA**",
    `Depuis ${formatDateTime(since)}: ${formatSignedDuration(recentSeconds)} · ${recentSubs} poses`,
    `Total global NINA brut: ${formatDuration(allSeconds)} · ${allSubs} poses`,
    `Dernière pose connue: ${formatDateTime(lastCapture)}`,
    "",
    "**Par filtre — total global (delta 24h)**",
    ...(filterLines.length > 0 ? filterLines : ["- aucun filtre comptabilisé"]),
  ]

  if (targetLines.length > 0) {
    lines.push("", "**Top évolutions 24h**", ...targetLines)
  }

  const message = lines.join("\n")
  return message.length <= 1900 ? message : `${message.slice(0, 1870)}\n… message tronqué`
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim()
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 500 })
  }

  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [targetRows, sessionRows] = await Promise.all([
    db.select().from(targets).orderBy(asc(targets.createdAt)),
    db.select().from(sessions).orderBy(asc(sessions.createdAt)),
  ])

  const targetNames = new Map(targetRows.map((target) => [target.id, target.name]))
  const liveTargetIds = new Set(targetRows.map((target) => target.id))
  const allNinaSessions: SessionLike[] = sessionRows
    .filter((session) => liveTargetIds.has(session.targetId))
    .filter((session) => (session.source ?? "manual") === "nina" && (session.status ?? "validated") === "acquired")
    .map((session) => ({
      targetId: session.targetId,
      panelIndex: session.panelIndex ?? 1,
      filter: normalizeFilterName(session.filter) ?? "L",
      subExposure: session.subExposure,
      subCount: session.subCount,
      capturedAt: session.capturedAt ?? null,
      importedAt: session.importedAt ?? null,
      createdAt: session.createdAt,
    }))

  const recentSessions = allNinaSessions.filter((session) => {
    const changedAt = session.importedAt ?? session.createdAt
    return changedAt.getTime() >= since.getTime()
  })

  const recentSeconds = recentSessions.reduce((acc, session) => acc + exposureSeconds(session), 0)
  if (recentSeconds <= 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "No new NINA exposure in the last 24h" })
  }

  const content = buildMessage({ allSessions: allNinaSessions, recentSessions, targetNames, since })
  const discord = await postDiscord(content)
  if (!discord.ok) {
    return NextResponse.json({ ok: false, error: discord.error, status: discord.status }, { status: 502 })
  }

  return NextResponse.json({ ok: true, posted: true, recentSeconds, recentSessions: recentSessions.length })
}
