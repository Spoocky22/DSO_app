"use client"

import {
  FILTER_COLORS,
  FILTERS,
  formatDuration,
  panelLabel,
  sessionSeconds,
  type FilterType,
  type Session,
} from "@/lib/dso"
import { Card } from "@/components/ui/card"
import { Clock, Layers, Camera, Grid2X2 } from "lucide-react"

interface Props {
  sessions: Session[]
  targetName: string | null
  panelCount: number
}

function aggregateByFilter(sessions: Session[]) {
  const byFilter = new Map<FilterType, number>()
  for (const s of sessions) {
    byFilter.set(s.filter, (byFilter.get(s.filter) ?? 0) + sessionSeconds(s))
  }
  return Array.from(byFilter.entries()).sort((a, b) => b[1] - a[1])
}

export function Dashboard({ sessions, targetName, panelCount }: Props) {
  const safePanelCount = Math.max(1, panelCount || 1)
  const totalSeconds = sessions.reduce((acc, s) => acc + sessionSeconds(s), 0)
  const totalSubs = sessions.reduce((acc, s) => acc + s.subCount, 0)

  // Agrégation par filtre, tous panneaux confondus
  const filterRows = aggregateByFilter(sessions)
  const maxSeconds = filterRows.length ? filterRows[0][1] : 0

  const panelRows = Array.from({ length: safePanelCount }, (_, i) => {
    const panelIndex = i + 1
    const panelSessions = sessions.filter((s) => (s.panelIndex ?? 1) === panelIndex)
    const seconds = panelSessions.reduce((acc, s) => acc + sessionSeconds(s), 0)
    const subs = panelSessions.reduce((acc, s) => acc + s.subCount, 0)
    const filters = aggregateByFilter(panelSessions)
    return { panelIndex, sessions: panelSessions, seconds, subs, filters }
  })

  const maxPanelSeconds = Math.max(...panelRows.map((p) => p.seconds), 0)

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
            {safePanelCount > 1 ? ` · ${safePanelCount} panneaux` : ""}
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
                {filterRows.length}
              </span>{" "}
              <span className="text-muted-foreground">filtres</span>
            </span>
          </div>
        </div>
      </Card>

      {/* Récap par panneau pour les mosaïques */}
      {safePanelCount > 1 && (
        <Card className="gap-0 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Grid2X2 className="size-4 text-primary" />
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground">
              TEMPS PAR PANNEAU
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {panelRows.map((panel) => (
              <div
                key={panel.panelIndex}
                className="rounded-2xl border border-border bg-background/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-primary">
                    {panelLabel(panel.panelIndex)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {panel.subs} poses
                  </span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold tabular-nums text-foreground">
                  {formatDuration(panel.seconds)}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${maxPanelSeconds ? (panel.seconds / maxPanelSeconds) * 100 : 0}%`,
                    }}
                  />
                </div>

                {panel.filters.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {panel.filters.map(([filter, seconds]) => (
                      <div key={filter} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: FILTER_COLORS[filter] }}
                          />
                          {filter}
                        </span>
                        <span className="font-mono tabular-nums text-foreground">
                          {formatDuration(seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Aucun signal saisi.
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Le total ci-dessus additionne tous les panneaux. Pour équilibrer une mosaïque,
            c&apos;est plutôt ce tableau qu&apos;il faut regarder.
          </p>
        </Card>
      )}

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
