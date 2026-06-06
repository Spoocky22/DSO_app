"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  type AppState,
  type FilterType,
} from "@/lib/dso"
import {
  getState,
  addTarget as addTargetAction,
  addSession as addSessionAction,
  deleteSession as deleteSessionAction,
  deleteTarget as deleteTargetAction,
} from "@/app/actions/tracker"
import { TargetSelector } from "@/components/target-selector"
import { ObjectPreview } from "@/components/object-preview"
import { SessionForm } from "@/components/session-form"
import { Dashboard } from "@/components/dashboard"
import { ContributionList } from "@/components/contribution-list"
import { Card } from "@/components/ui/card"
import { Sparkles, Wifi, AlertTriangle } from "lucide-react"

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Erreur inconnue"
}

export function Tracker() {
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: state, mutate, isLoading, error } = useSWR<AppState>(
    "tracker-state",
    () => getState(),
    {
      refreshInterval: 5000, // synchro temps réel pour toute l'équipe
      revalidateOnFocus: true,
    },
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Sélection par défaut sur la première cible une fois chargé
  const effectiveSelectedId =
    selectedId ?? state?.targets[0]?.id ?? null

  const selectedTarget = useMemo(
    () => state?.targets.find((t) => t.id === effectiveSelectedId) ?? null,
    [state, effectiveSelectedId],
  )

  const targetSessions = useMemo(
    () => state?.sessions.filter((s) => s.targetId === effectiveSelectedId) ?? [],
    [state, effectiveSelectedId],
  )

  async function handleAddTarget(name: string) {
    setActionError(null)
    try {
      const id = await addTargetAction(name)
      setSelectedId(id)
      await mutate()
    } catch (err) {
      setActionError(readableError(err))
      throw err
    }
  }

  async function handleAddSession(data: {
    filter: FilterType
    subExposure: number
    subCount: number
  }) {
    if (!effectiveSelectedId) return
    setActionError(null)
    try {
      await addSessionAction({ targetId: effectiveSelectedId, ...data })
      await mutate()
    } catch (err) {
      setActionError(readableError(err))
      throw err
    }
  }

  async function handleDeleteSession(id: string) {
    setActionError(null)
    try {
      await deleteSessionAction(id)
      await mutate()
    } catch (err) {
      setActionError(readableError(err))
    }
  }

  async function handleDeleteTarget(id: string) {
    setActionError(null)
    try {
      await deleteTargetAction(id)
      if (id === effectiveSelectedId) {
        const nextTarget = state?.targets.find((t) => t.id !== id) ?? null
        setSelectedId(nextTarget?.id ?? null)
      }
      await mutate()
    } catch (err) {
      setActionError(readableError(err))
    }
  }

  if (isLoading && !state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    )
  }

  if (error && !state) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
        <Card className="gap-3 p-5">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            <h1 className="font-semibold">Impossible de charger l'application</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            La connexion à la base de données a probablement échoué.
          </p>
          <pre className="overflow-auto rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
            {readableError(error)}
          </pre>
          <p className="text-xs text-muted-foreground">
            Vérifie que <code>.env.local</code> existe et que PostgreSQL tourne avec <code>docker compose up -d db</code>.
          </p>
        </Card>
      </main>
    )
  }

  if (!state) return null

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 pb-12 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15">
            <Sparkles className="size-5 text-primary" />
          </span>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              DSO Exposure Tracker
            </h1>
            <p className="text-xs text-muted-foreground">
              Suivi d&apos;équipe partagé en temps réel
            </p>
          </div>
        </div>
        <span
          className="flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground"
          title="Synchronisé avec la base de données partagée"
        >
          <Wifi className="size-3 text-primary" />
          Live
        </span>
      </header>

      {actionError && (
        <Card className="mb-4 gap-2 border-destructive/40 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="size-4" />
            Action impossible
          </div>
          <p className="text-xs text-muted-foreground">{actionError}</p>
        </Card>
      )}

      <div className="space-y-6">
        <TargetSelector
          targets={state.targets}
          selectedId={effectiveSelectedId}
          onSelect={setSelectedId}
          onAdd={handleAddTarget}
          onDelete={handleDeleteTarget}
        />

        <ObjectPreview targetName={selectedTarget?.name ?? null} />

        <Dashboard
          sessions={targetSessions}
          targetName={selectedTarget?.name ?? null}
        />

        <SessionForm disabled={!effectiveSelectedId} onSubmit={handleAddSession} />

        <ContributionList sessions={targetSessions} onDelete={handleDeleteSession} />
      </div>
    </main>
  )
}
