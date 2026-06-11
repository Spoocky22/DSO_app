"use server"

import { db } from "@/lib/db"
import { sessions, targets } from "@/lib/db/schema"
import { asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import type { AppState, FilterType, SessionStatus, SessionSource } from "@/lib/dso"
import { MAX_PANEL_COUNT } from "@/lib/dso"

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}


function normalizeRedshiftOverride(redshift: number | null): number | null {
  if (redshift === null) return null
  const n = Number(redshift)
  if (!Number.isFinite(n) || n <= -0.1 || n >= 20) {
    throw new Error("Le redshift manuel doit être un nombre compris entre -0.1 et 20")
  }
  return n
}

function normalizePanelCount(panelCount: number): number {
  const n = Math.trunc(Number(panelCount))
  if (!Number.isFinite(n) || n < 1 || n > MAX_PANEL_COUNT) {
    throw new Error(`Le nombre de panneaux doit être compris entre 1 et ${MAX_PANEL_COUNT}`)
  }
  return n
}

export async function getState(): Promise<AppState> {
  const [targetRows, sessionRows] = await Promise.all([
    db.select().from(targets).orderBy(asc(targets.createdAt)),
    db.select().from(sessions).orderBy(asc(sessions.createdAt)),
  ])

  return {
    targets: targetRows.map((t) => ({
      id: t.id,
      name: t.name,
      panelCount: t.panelCount ?? 1,
      redshiftOverride: t.redshiftOverride ?? null,
      createdAt: t.createdAt.getTime(),
    })),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      targetId: s.targetId,
      panelIndex: s.panelIndex ?? 1,
      filter: s.filter as FilterType,
      subExposure: s.subExposure,
      subCount: s.subCount,
      status: (s.status ?? "validated") as SessionStatus,
      source: (s.source ?? "manual") as SessionSource,
      externalId: s.externalId ?? null,
      filename: s.filename ?? null,
      capturedAt: s.capturedAt ? s.capturedAt.getTime() : null,
      importedAt: s.importedAt ? s.importedAt.getTime() : null,
      createdAt: s.createdAt.getTime(),
    })),
  }
}

export async function addTarget(name: string, panelCount = 1): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Nom de cible requis")
  const normalizedPanelCount = normalizePanelCount(panelCount)
  const id = "t-" + uid()
  await db.insert(targets).values({ id, name: trimmed, panelCount: normalizedPanelCount })
  revalidatePath("/")
  return id
}

export async function addSession(data: {
  targetId: string
  panelIndex: number
  filter: FilterType
  subExposure: number
  subCount: number
}): Promise<void> {
  if (!data.targetId) throw new Error("Cible requise")
  if (data.subExposure <= 0 || data.subCount <= 0) throw new Error("Valeurs invalides")

  const [target] = await db.select().from(targets).where(eq(targets.id, data.targetId)).limit(1)
  if (!target) throw new Error("Cible introuvable")

  const panelIndex = Math.trunc(Number(data.panelIndex))
  const panelCount = target.panelCount ?? 1
  if (!Number.isFinite(panelIndex) || panelIndex < 1 || panelIndex > panelCount) {
    throw new Error(`Panneau invalide pour cette cible. Choisis un panneau entre 1 et ${panelCount}.`)
  }

  await db.insert(sessions).values({
    id: uid(),
    targetId: data.targetId,
    panelIndex,
    filter: data.filter,
    subExposure: data.subExposure,
    subCount: data.subCount,
    status: "validated",
    source: "manual",
  })
  revalidatePath("/")
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, id))
  revalidatePath("/")
}

export async function deleteTarget(id: string): Promise<void> {
  if (!id) throw new Error("Cible requise")
  await db.delete(targets).where(eq(targets.id, id))
  revalidatePath("/")
}

export async function updateTargetRedshiftOverride(id: string, redshift: number | null): Promise<void> {
  if (!id) throw new Error("Cible requise")
  const normalized = normalizeRedshiftOverride(redshift)

  await db
    .update(targets)
    .set({ redshiftOverride: normalized })
    .where(eq(targets.id, id))

  revalidatePath("/")
}
