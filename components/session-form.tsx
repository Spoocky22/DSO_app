"use client"

import { useEffect, useState } from "react"
import { FILTERS, FILTER_COLORS, formatDuration, panelLabel, type FilterType } from "@/lib/dso"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Plus, Loader2, Grid2X2 } from "lucide-react"

interface Props {
  disabled?: boolean
  panelCount: number
  onSubmit: (data: {
    panelIndex: number
    filter: FilterType
    subExposure: number
    subCount: number
  }) => Promise<void> | void
}

export function SessionForm({ disabled, panelCount, onSubmit }: Props) {
  const [panelIndex, setPanelIndex] = useState(1)
  const [filter, setFilter] = useState<FilterType>("L")
  const [subExposure, setSubExposure] = useState("300")
  const [subCount, setSubCount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const safePanelCount = Math.max(1, panelCount || 1)

  useEffect(() => {
    if (panelIndex > safePanelCount) setPanelIndex(1)
  }, [panelIndex, safePanelCount])

  const exp = Number(subExposure) || 0
  const count = Number(subCount) || 0
  const preview = exp * count

  const valid = exp > 0 && count > 0 && panelIndex >= 1 && panelIndex <= safePanelCount

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({ panelIndex, filter, subExposure: exp, subCount: count })
      setSubCount("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="gap-0 p-4">
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">
        AJOUTER UNE SESSION
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {safePanelCount > 1 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              <Grid2X2 className="size-3.5 text-primary" />
              Panneau / pano
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: safePanelCount }, (_, i) => i + 1).map((p) => {
                const active = p === panelIndex
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPanelIndex(p)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {panelLabel(p)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Filtre</Label>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = f === filter
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-foreground/30 bg-secondary text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: FILTER_COLORS[f] }}
                  />
                  {f}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="exp">Pose unitaire (s)</Label>
            <Input
              id="exp"
              inputMode="numeric"
              value={subExposure}
              onChange={(e) => setSubExposure(e.target.value.replace(/\D/g, ""))}
              placeholder="300"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="count">Poses conservées</Label>
            <Input
              id="count"
              inputMode="numeric"
              value={subCount}
              onChange={(e) => setSubCount(e.target.value.replace(/\D/g, ""))}
              placeholder="45"
              className="h-11"
            />
          </div>
        </div>

        {preview > 0 && (
          <p className="text-xs text-muted-foreground">
            Temps de cette session{safePanelCount > 1 ? ` sur ${panelLabel(panelIndex)}` : ""} :{" "}
            <span className="font-semibold text-primary">
              {formatDuration(preview)}
            </span>
          </p>
        )}

        <Button
          type="submit"
          disabled={!valid || disabled || submitting}
          className="h-11 w-full gap-2"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Enregistrer la session
        </Button>
      </form>
    </Card>
  )
}
