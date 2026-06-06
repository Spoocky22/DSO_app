"use client"

import { useState } from "react"
import type { Target } from "@/lib/dso"
import { MAX_PANEL_COUNT } from "@/lib/dso"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Telescope, Check, X, Trash2, Grid2X2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  targets: Target[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (name: string, panelCount: number) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
}

export function TargetSelector({ targets, selectedId, onSelect, onAdd, onDelete }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [panelCount, setPanelCount] = useState("1")

  const parsedPanelCount = Number(panelCount) || 0
  const validPanelCount = parsedPanelCount >= 1 && parsedPanelCount <= MAX_PANEL_COUNT

  function resetForm() {
    setAdding(false)
    setName("")
    setPanelCount("1")
  }

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed || !validPanelCount) return
    try {
      await onAdd(trimmed, parsedPanelCount)
      resetForm()
    } catch {
      // L'erreur est affichée par le composant parent.
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Telescope className="size-4 text-primary" />
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground">
            CIBLE
          </h2>
        </div>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-primary hover:text-primary"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-3.5" />
            Nouvelle cible
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
          <div className="space-y-1.5">
            <Label htmlFor="target-name">Nom de la cible</Label>
            <Input
              id="target-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit()
                if (e.key === "Escape") resetForm()
              }}
              placeholder="Ex : IC 1396 - Nébuleuse de la Trompe"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="panel-count">Nombre de panneaux / pano</Label>
            <div className="flex items-center gap-2">
              <Input
                id="panel-count"
                inputMode="numeric"
                value={panelCount}
                onChange={(e) => setPanelCount(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit()
                  if (e.key === "Escape") resetForm()
                }}
                placeholder="1"
                className="h-10 w-28"
              />
              <p className="text-xs text-muted-foreground">
                1 pour une cible simple, 2+ pour une mosaïque.
              </p>
            </div>
            {!validPanelCount && panelCount !== "" && (
              <p className="text-xs text-destructive">
                Choisis une valeur entre 1 et {MAX_PANEL_COUNT}.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button className="h-10 flex-1 gap-2" onClick={submit} disabled={!name.trim() || !validPanelCount}>
              <Check className="size-4" />
              Créer
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-10 shrink-0"
              onClick={resetForm}
              aria-label="Annuler"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {targets.map((t) => {
          const active = t.id === selectedId
          const short = t.name.split(" - ")[0]
          const long = t.name.split(" - ")[1]
          const panelCount = t.panelCount ?? 1
          return (
            <div
              key={t.id}
              className={cn(
                "group flex items-stretch overflow-hidden rounded-xl border transition-colors",
                active
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className="min-w-0 px-3.5 py-2 text-left"
              >
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  {short}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {long && (
                    <span className="block text-[11px] text-muted-foreground">
                      {long}
                    </span>
                  )}
                  {panelCount > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <Grid2X2 className="size-3" />
                      {panelCount} panneaux
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                title={`Supprimer ${t.name}`}
                aria-label={`Supprimer ${t.name}`}
                onClick={async (e) => {
                  e.stopPropagation()
                  const ok = window.confirm(
                    `Supprimer la cible "${t.name}" et toutes ses sessions ?`,
                  )
                  if (!ok) return
                  await onDelete(t.id)
                }}
                className="flex w-8 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
