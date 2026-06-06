"use client"

import { useState } from "react"
import type { Target } from "@/lib/dso"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Telescope, Check, X, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  targets: Target[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd: (name: string) => Promise<void> | void
  onDelete: (id: string) => Promise<void> | void
}

export function TargetSelector({ targets, selectedId, onSelect, onAdd, onDelete }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      await onAdd(trimmed)
      setName("")
      setAdding(false)
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
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit()
              if (e.key === "Escape") {
                setAdding(false)
                setName("")
              }
            }}
            placeholder="Ex : IC 1396 - Nébuleuse de la Trompe"
            className="h-10"
          />
          <Button size="icon" className="size-10 shrink-0" onClick={submit}>
            <Check className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="size-10 shrink-0"
            onClick={() => {
              setAdding(false)
              setName("")
            }}
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {targets.map((t) => {
          const active = t.id === selectedId
          const short = t.name.split(" - ")[0]
          const long = t.name.split(" - ")[1]
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
                {long && (
                  <span className="block text-[11px] text-muted-foreground">
                    {long}
                  </span>
                )}
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
