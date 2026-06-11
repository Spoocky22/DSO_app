import { NextRequest, NextResponse } from "next/server"
import { asc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { sessions, targets } from "@/lib/db/schema"
import { formatDuration, normalizeFilterName, sessionSeconds, type FilterType, type SessionStatus } from "@/lib/dso"

export const runtime = "nodejs"

type IngestPayload = {
  targetName?: unknown
  filter?: unknown
  exposureTime?: unknown
  subExposure?: unknown
  subCount?: unknown
  panelIndex?: unknown
  filename?: unknown
  capturedAt?: unknown
  sourceId?: unknown
  imageStatistics?: Record<string, unknown>
  Response?: {
    Event?: unknown
    ImageStatistics?: Record<string, unknown>
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function readToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim()
  return req.headers.get("x-nina-ingest-token")?.trim() ?? null
}

function assertAuthorized(req: NextRequest) {
  const expected = process.env.NINA_INGEST_TOKEN?.trim()
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "NINA_INGEST_TOKEN is not configured on the server" },
      { status: 500 },
    )
  }

  const token = readToken(req)
  if (!token || token !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  return null
}

function asPositiveInteger(value: unknown, fallback: number | null = null): number | null {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function asPositiveNumber(value: unknown, fallback: number | null = null): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n
}

function asTrimmedString(value: unknown): string {
  return String(value ?? "").trim()
}

function parseDate(value: unknown): Date | null {
  const s = asTrimmedString(value)
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function extractStats(payload: IngestPayload): Record<string, unknown> {
  return payload.Response?.ImageStatistics ?? payload.imageStatistics ?? payload
}


function normalizeTargetLookupName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}


function stripPanelMarker(name: string): string {
  return name
    .replace(/(?:^|[\s_\-[(])(?:panel|panneau|pane|tile|mosaic|mosaique|p|pan)\s*[:#]?\s*\d{1,2}(?:[\s_\-)\]]*)$/i, "")
    .replace(/[\s_\-[(]+(?:panel|panneau|pane|tile|mosaic|mosaique)\s*[:#]?\s*\d{1,2}(?:[\s_\-)\]]*)$/i, "")
    .trim()
}

function detectPanelIndexFromText(...values: string[]): number | null {
  const combined = values.filter(Boolean).join(" ")
  const patterns = [
    /(?:^|[\s_\-[(])(?:panel|panneau|pane|tile|mosaic|mosaique|pan)\s*[:#]?\s*(\d{1,2})(?=$|[\s_\-)\].])/i,
    /(?:^|[\s_\-[(])p\s*[:#]?\s*(\d{1,2})(?=$|[\s_\-)\].])/i,
  ]

  for (const pattern of patterns) {
    const match = combined.match(pattern)
    if (match) {
      const n = Number(match[1])
      if (Number.isInteger(n) && n >= 1 && n <= 20) return n
    }
  }
  return null
}

function detectPanelIndex(payload: IngestPayload, stats: Record<string, unknown>, targetName: string, filename: string): number {
  const explicit =
    asPositiveInteger(payload.panelIndex, null) ??
    asPositiveInteger(stats.PanelIndex, null) ??
    asPositiveInteger(stats.PanelNumber, null) ??
    asPositiveInteger(stats.Panel, null) ??
    asPositiveInteger(stats.TileIndex, null) ??
    asPositiveInteger(stats.TileNumber, null)

  if (explicit && explicit >= 1 && explicit <= 20) return explicit

  return detectPanelIndexFromText(targetName, filename) ?? 1
}

function catalogueTokens(name: string): string[] {
  const normalized = normalizeTargetLookupName(name)
  const tokens = new Set<string>()

  for (const match of normalized.matchAll(/\bm\s*(\d{1,3})\b/g)) {
    tokens.add(`M${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bmessier\s*(\d{1,3})\b/g)) {
    tokens.add(`M${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bngc\s*(\d{1,5})\b/g)) {
    tokens.add(`NGC${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bic\s*(\d{1,5})\b/g)) {
    tokens.add(`IC${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bsh2\s*(\d{1,4})\b/g)) {
    tokens.add(`SH2-${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bsharpless\s*(\d{1,4})\b/g)) {
    tokens.add(`SH2-${Number(match[1])}`)
  }

  return Array.from(tokens)
}

function sameCatalogueObject(a: string, b: string): boolean {
  const aTokens = new Set(catalogueTokens(a))
  if (aTokens.size === 0) return false
  return catalogueTokens(b).some((token) => aTokens.has(token))
}

function isLikelyCalibrationFrame(targetName: string, filterName: string, filename: string): boolean {
  const combined = `${targetName} ${filterName} ${filename}`.toLowerCase()
  return ["bias", "dark", "flat", "darkflat", "dark-flat", "calibration"].some((word) => combined.includes(word))
}

async function findOrCreateTarget(targetName: string, panelIndex = 1) {
  const allTargets = await db.select().from(targets).orderBy(asc(targets.createdAt))
  const incoming = targetName.trim()
  const cleanedIncoming = stripPanelMarker(incoming) || incoming
  const incomingNormalized = normalizeTargetLookupName(incoming)
  const cleanedIncomingNormalized = normalizeTargetLookupName(cleanedIncoming)

  // 1) Match exact mais insensible à la casse, accents et ponctuation.
  // On essaie aussi la version sans suffixe panneau : "M31 P2" -> "M31".
  const exact = allTargets.find((t) => {
    const existing = normalizeTargetLookupName(t.name)
    return existing === incomingNormalized || existing === cleanedIncomingNormalized
  })
  if (exact) return { target: exact, created: false }

  // 2) Match sûr par identifiant catalogue.
  // Exemples : "M51 P2" -> "M51", "Messier 51" -> "M51", "NGC7000" -> "NGC 7000".
  const catalogueMatch = allTargets.find((t) => sameCatalogueObject(t.name, incoming) || sameCatalogueObject(t.name, cleanedIncoming))
  if (catalogueMatch) return { target: catalogueMatch, created: false }

  const target = {
    id: "t-" + uid(),
    name: cleanedIncoming,
    panelCount: Math.max(1, Math.min(20, panelIndex || 1)),
  }
  await db.insert(targets).values(target)
  const [created] = await db.select().from(targets).where(eq(targets.id, target.id)).limit(1)
  if (!created) throw new Error("Target creation failed")
  return { target: created, created: true }
}

async function computeTotals(targetId: string, filter: FilterType) {
  const rows = await db.select().from(sessions).where(eq(sessions.targetId, targetId))
  const toSession = (s: typeof rows[number]) => ({
    id: s.id,
    targetId: s.targetId,
    panelIndex: s.panelIndex ?? 1,
    filter: s.filter as FilterType,
    subExposure: s.subExposure,
    subCount: s.subCount,
    status: (s.status ?? "validated") as SessionStatus,
    source: s.source ?? "manual",
    externalId: s.externalId ?? null,
    filename: s.filename ?? null,
    capturedAt: s.capturedAt ? s.capturedAt.getTime() : null,
    importedAt: s.importedAt ? s.importedAt.getTime() : null,
    createdAt: s.createdAt.getTime(),
  })
  const sessionRows = rows.map(toSession)

  const rawTotalSeconds = sessionRows
    .filter((s) => s.status === "acquired")
    .reduce((acc, s) => acc + sessionSeconds(s), 0)

  const validatedTotalSeconds = sessionRows
    .filter((s) => s.status === "validated")
    .reduce((acc, s) => acc + sessionSeconds(s), 0)

  const rawFilterSeconds = sessionRows
    .filter((s) => s.status === "acquired" && s.filter === filter)
    .reduce((acc, s) => acc + sessionSeconds(s), 0)

  const validatedFilterSeconds = sessionRows
    .filter((s) => s.status === "validated" && s.filter === filter)
    .reduce((acc, s) => acc + sessionSeconds(s), 0)

  return { rawTotalSeconds, validatedTotalSeconds, rawFilterSeconds, validatedFilterSeconds }
}

export async function GET(req: NextRequest) {
  const authError = assertAuthorized(req)
  if (authError) return authError
  return NextResponse.json({ ok: true, message: "NINA ingest endpoint ready" })
}

export async function POST(req: NextRequest) {
  const authError = assertAuthorized(req)
  if (authError) return authError

  let payload: IngestPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 })
  }

  const stats = extractStats(payload)
  const targetName = asTrimmedString(stats.TargetName ?? payload.targetName)
  const rawFilter = stats.Filter ?? payload.filter
  const filename = asTrimmedString(stats.Filename ?? payload.filename)

  if (!targetName) {
    return NextResponse.json({ ok: false, ignored: true, reason: "No TargetName in NINA event" }, { status: 200 })
  }

  if (isLikelyCalibrationFrame(targetName, asTrimmedString(rawFilter), filename)) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Calibration frame ignored" })
  }

  const filter = normalizeFilterName(rawFilter)
  if (!filter) {
    return NextResponse.json(
      { ok: false, ignored: true, reason: `Unsupported filter: ${asTrimmedString(rawFilter) || "empty"}` },
      { status: 200 },
    )
  }

  const exposureSeconds = asPositiveNumber(stats.ExposureTime ?? payload.exposureTime ?? payload.subExposure)
  if (!exposureSeconds) {
    return NextResponse.json({ ok: false, error: "ExposureTime is missing or invalid" }, { status: 400 })
  }

  const roundedExposureSeconds = Math.round(exposureSeconds)
  const subCount = asPositiveInteger(payload.subCount, 1) ?? 1
  const capturedAt = parseDate(stats.Date ?? payload.capturedAt) ?? new Date()
  const panelIndex = detectPanelIndex(payload, stats, targetName, filename)
  const externalId = asTrimmedString(payload.sourceId) || filename || `${targetName}|${filter}|P${panelIndex}|${capturedAt.toISOString()}|${roundedExposureSeconds}`

  const existingRows = await db.select().from(sessions).where(eq(sessions.externalId, externalId)).limit(1)
  if (existingRows.length > 0) {
    const { target } = await findOrCreateTarget(targetName, panelIndex)
    const totals = await computeTotals(target.id, filter)
    return NextResponse.json({
      ok: true,
      duplicate: true,
      ignored: true,
      targetName: target.name,
      filter,
      externalId,
      ...totals,
      rawFilter: formatDuration(totals.rawFilterSeconds),
      validatedFilter: formatDuration(totals.validatedFilterSeconds),
    })
  }

  const { target, created } = await findOrCreateTarget(targetName, panelIndex)
  const targetPanelCount = Math.max(1, target.panelCount ?? 1)
  const safePanelIndex = Math.max(1, Math.min(20, panelIndex))

  if (safePanelIndex > targetPanelCount) {
    await db.update(targets).set({ panelCount: safePanelIndex }).where(eq(targets.id, target.id))
  }

  await db.insert(sessions).values({
    id: uid(),
    targetId: target.id,
    panelIndex: safePanelIndex,
    filter,
    subExposure: roundedExposureSeconds,
    subCount,
    status: "acquired",
    source: "nina",
    externalId,
    filename: filename || null,
    capturedAt,
    importedAt: new Date(),
    createdAt: capturedAt,
  })

  const totals = await computeTotals(target.id, filter)
  const addedSeconds = roundedExposureSeconds * subCount

  return NextResponse.json({
    ok: true,
    inserted: true,
    createdTarget: created,
    targetId: target.id,
    targetName: target.name,
    panelIndex: safePanelIndex,
    filter,
    subExposure: roundedExposureSeconds,
    subCount,
    addedSeconds,
    added: formatDuration(addedSeconds),
    externalId,
    filename: filename || null,
    capturedAt: capturedAt.toISOString(),
    ...totals,
    rawTotal: formatDuration(totals.rawTotalSeconds),
    validatedTotal: formatDuration(totals.validatedTotalSeconds),
    rawFilter: formatDuration(totals.rawFilterSeconds),
    validatedFilter: formatDuration(totals.validatedFilterSeconds),
  })
}
