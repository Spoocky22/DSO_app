"use server"

import { db } from "@/lib/db"
import { sessions, targets } from "@/lib/db/schema"
import { asc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import type { AppState, FilterType } from "@/lib/dso"

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
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
      createdAt: t.createdAt.getTime(),
    })),
    sessions: sessionRows.map((s) => ({
      id: s.id,
      targetId: s.targetId,
      filter: s.filter as FilterType,
      subExposure: s.subExposure,
      subCount: s.subCount,
      createdAt: s.createdAt.getTime(),
    })),
  }
}

export async function addTarget(name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Nom de cible requis")
  const id = "t-" + uid()
  await db.insert(targets).values({ id, name: trimmed })
  revalidatePath("/")
  return id
}

export async function addSession(data: {
  targetId: string
  filter: FilterType
  subExposure: number
  subCount: number
}): Promise<void> {
  if (!data.targetId) throw new Error("Cible requise")
  if (data.subExposure <= 0 || data.subCount <= 0) throw new Error("Valeurs invalides")
  await db.insert(sessions).values({
    id: uid(),
    targetId: data.targetId,
    filter: data.filter,
    subExposure: data.subExposure,
    subCount: data.subCount,
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
