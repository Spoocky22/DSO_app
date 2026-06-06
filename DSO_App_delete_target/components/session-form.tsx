"use client"

import { useState } from "react"
import { FILTERS, FILTER_COLORS, formatDuration, type FilterType } from "@/lib/dso"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Plus, Loader2 } from "lucide-react"

interface Props {
  disabled?: boolean
  onSubmit: (data: {
    filter: FilterType
    subExposure: number
    subCount: number
  }) => Promise<void> | void
}

export function SessionForm({ disabled, onSubmit }: Props) {
  const [filter, setFilter] = useState<FilterType>("L")
  const [subExposure, setSubExposure] = useState("300")
  const [subCount, setSubCount] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const exp = Number(subExposure) || 0
  const count = Number(subCount) || 0
  const preview = exp * count

  const valid = exp > 0 && count > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSubmit({ filter, subExposure: exp, subCount: count })
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
            Temps de cette session :{" "}
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
