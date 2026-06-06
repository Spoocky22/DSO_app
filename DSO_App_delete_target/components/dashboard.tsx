"use client"

import {
  FILTER_COLORS,
  formatDuration,
  sessionSeconds,
  type FilterType,
  type Session,
} from "@/lib/dso"
import { Card } from "@/components/ui/card"
import { Clock, Layers, Camera } from "lucide-react"

interface Props {
  sessions: Session[]
  targetName: string | null
}

export function Dashboard({ sessions, targetName }: Props) {
  const totalSeconds = sessions.reduce((acc, s) => acc + sessionSeconds(s), 0)
  const totalSubs = sessions.reduce((acc, s) => acc + s.subCount, 0)

  // Agrégation par filtre
  const byFilter = new Map<FilterType, number>()
  for (const s of sessions) {
    byFilter.set(s.filter, (byFilter.get(s.filter) ?? 0) + sessionSeconds(s))
  }
  const filterRows = Array.from(byFilter.entries()).sort((a, b) => b[1] - a[1])
  const maxSeconds = filterRows.length ? filterRows[0][1] : 0

  return (
    <div className="space-y-4">
      {/* Total cumulé */}
      <Card className="relative gap-0 overflow-hidden p-5">
        <div
          className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-20 blur-2xl"
          style={{ backgroundColor: "var(--primary)" }}
        />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="size-4 text-primary" />
          <span className="text-xs font-medium tracking-wide">
            TEMPS TOTAL CUMULÉ
          </span>
        </div>
        <p className="mt-2 font-mono text-4xl font-bold tabular-nums text-foreground">
          {formatDuration(totalSeconds)}
        </p>
        {targetName && (
          <p className="mt-1 text-sm text-muted-foreground">
            sur {targetName.split(" - ")[0]}
          </p>
        )}
        <div className="mt-4 flex gap-5 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Camera className="size-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-semibold text-foreground">{totalSubs}</span>{" "}
              <span className="text-muted-foreground">poses</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <span className="text-sm">
              <span className="font-semibold text-foreground">
                {byFilter.size}
              </span>{" "}
              <span className="text-muted-foreground">filtres</span>
            </span>
          </div>
        </div>
      </Card>

      {/* Récap par filtre */}
      <Card className="gap-0 p-4">
        <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">
          RÉCAPITULATIF PAR FILTRE
        </h2>
        {filterRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Aucune donnée pour le moment.
          </p>
        ) : (
          <div className="space-y-3">
            {filterRows.map(([filter, seconds]) => (
              <div key={filter} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: FILTER_COLORS[filter] }}
                    />
                    {filter}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatDuration(seconds)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${maxSeconds ? (seconds / maxSeconds) * 100 : 0}%`,
                      backgroundColor: FILTER_COLORS[filter],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
