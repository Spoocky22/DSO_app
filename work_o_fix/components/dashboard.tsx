"use client"

import type { ReactNode } from "react"
import {
  FILTERS,
  FILTER_COLORS,
  formatDuration,
  panelLabel,
  sessionSeconds,
  type FilterType,
  type Session,
} from "@/lib/dso"
import { Card } from "@/components/ui/card"
import { Clock, Layers, Camera, Grid2X2, RadioTower } from "lucide-react"

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

function SummaryCard({
  title,
  subtitle,
  seconds,
  subs,
  filterCount,
  icon,
}: {
  title: string
  subtitle: string
  seconds: number
  subs: number
  filterCount: number
  icon: ReactNode
}) {
  return (
    <Card className="relative gap-0 overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-20 blur-2xl"
        style={{ backgroundColor: "var(--primary)" }}
      />
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium tracking-wide">{title}</span>
      </div>
      <p className="mt-2 font-mono text-4xl font-bold tabular-nums text-foreground">
        {formatDuration(seconds)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-4 flex gap-5 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-semibold text-foreground">{subs}</span>{" "}
            <span className="text-muted-foreground">poses</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-semibold text-foreground">{filterCount}</span>{" "}
            <span className="text-muted-foreground">filtres</span>
          </span>
        </div>
      </div>
    </Card>
  )
}

function FilterRecap({ title, sessions, emptyText }: { title: string; sessions: Session[]; emptyText: string }) {
  const filterRows = aggregateByFilter(sessions)
  const maxSeconds = filterRows.length ? filterRows[0][1] : 0

  return (
    <Card className="gap-0 p-4">
      <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">
        {title}
      </h2>
      {filterRows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {emptyText}
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
  )
}


export function GlobalDashboard({ sessions, targetCount }: { sessions: Session[]; targetCount: number }) {
  const validatedSessions = sessions.filter((s) => s.status === "validated")
  const rawSessions = sessions.filter((s) => s.status === "acquired")

  const validatedSeconds = validatedSessions.reduce((acc, s) => acc + sessionSeconds(s), 0)
  const rawSeconds = rawSessions.reduce((acc, s) => acc + sessionSeconds(s), 0)
  const validatedSubs = validatedSessions.reduce((acc, s) => acc + s.subCount, 0)
  const rawSubs = rawSessions.reduce((acc, s) => acc + s.subCount, 0)

  const rows = FILTERS.map((filter) => {
    const validated = validatedSessions
      .filter((s) => s.filter === filter)
      .reduce((acc, s) => acc + sessionSeconds(s), 0)
    const raw = rawSessions
      .filter((s) => s.filter === filter)
      .reduce((acc, s) => acc + sessionSeconds(s), 0)
    return { filter, validated, raw }
  }).filter((row) => row.validated > 0 || row.raw > 0)

  const maxSeconds = Math.max(...rows.map((row) => Math.max(row.validated, row.raw)), 0)

  return (
    <Card className="gap-0 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground">
            VUE GLOBALE TOUTES CIBLES
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {targetCount} cible{targetCount > 1 ? "s" : ""} · temps validé et acquis brut séparés
          </p>
        </div>
        <RadioTower className="size-4 text-primary" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-background/40 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">validé / processing</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
            {formatDuration(validatedSeconds)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{validatedSubs} poses conservées</p>
        </div>
        <div className="rounded-2xl border border-border bg-background/40 p-3">
          <p className="text-[10px] uppercase text-muted-foreground">acquis NINA brut</p>
          <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
            {formatDuration(rawSeconds)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{rawSubs} poses sauvegardées</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 py-3 text-center text-sm text-muted-foreground">
          Aucun temps enregistré pour le moment.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map(({ filter, validated, raw }) => (
            <div key={filter} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: FILTER_COLORS[filter] }}
                  />
                  {filter}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  validé {formatDuration(validated)} · NINA {formatDuration(raw)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-2 overflow-hidden rounded-full bg-secondary" title="Validé / processing">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${maxSeconds ? (validated / maxSeconds) * 100 : 0}%`,
                      backgroundColor: FILTER_COLORS[filter],
                    }}
                  />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary" title="Acquis NINA brut">
                  <div
                    className="h-full rounded-full opacity-60 transition-all"
                    style={{
                      width: `${maxSeconds ? (raw / maxSeconds) * 100 : 0}%`,
                      backgroundColor: FILTER_COLORS[filter],
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function Dashboard({ sessions, targetName, panelCount }: Props) {
  const safePanelCount = Math.max(1, panelCount || 1)

  const validatedSessions = sessions.filter((s) => s.status === "validated")
  const rawSessions = sessions.filter((s) => s.status === "acquired")

  const validatedSeconds = validatedSessions.reduce((acc, s) => acc + sessionSeconds(s), 0)
  const validatedSubs = validatedSessions.reduce((acc, s) => acc + s.subCount, 0)
  const validatedFilterRows = aggregateByFilter(validatedSessions)

  const rawSeconds = rawSessions.reduce((acc, s) => acc + sessionSeconds(s), 0)
  const rawSubs = rawSessions.reduce((acc, s) => acc + s.subCount, 0)
  const rawFilterRows = aggregateByFilter(rawSessions)

  const targetSubtitle = targetName
    ? `sur ${targetName.split(" - ")[0]}${safePanelCount > 1 ? ` · ${safePanelCount} panneaux` : ""}`
    : "aucune cible sélectionnée"

  const panelRows = Array.from({ length: safePanelCount }, (_, i) => {
    const panelIndex = i + 1
    const panelValidated = validatedSessions.filter((s) => (s.panelIndex ?? 1) === panelIndex)
    const panelRaw = rawSessions.filter((s) => (s.panelIndex ?? 1) === panelIndex)
    const validated = panelValidated.reduce((acc, s) => acc + sessionSeconds(s), 0)
    const raw = panelRaw.reduce((acc, s) => acc + sessionSeconds(s), 0)
    const subs = panelValidated.reduce((acc, s) => acc + s.subCount, 0)
    const rawSubs = panelRaw.reduce((acc, s) => acc + s.subCount, 0)
    const filters = aggregateByFilter(panelValidated)
    const rawFilters = aggregateByFilter(panelRaw)
    return { panelIndex, validated, raw, subs, rawSubs, filters, rawFilters }
  })

  const maxPanelSeconds = Math.max(...panelRows.map((p) => Math.max(p.validated, p.raw)), 0)

  return (
    <div className="space-y-4">
      <SummaryCard
        title="TEMPS VALIDÉ / PROCESSING"
        subtitle={targetSubtitle}
        seconds={validatedSeconds}
        subs={validatedSubs}
        filterCount={validatedFilterRows.length}
        icon={<Clock className="size-4 text-primary" />}
      />

      <SummaryCard
        title="ACQUIS NINA BRUT"
        subtitle="images sauvegardées par NINA, pas encore triées"
        seconds={rawSeconds}
        subs={rawSubs}
        filterCount={rawFilterRows.length}
        icon={<RadioTower className="size-4 text-primary" />}
      />

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
                    {panel.subs} validées · {panel.rawSubs} brutes
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">validé</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-foreground">
                      {formatDuration(panel.validated)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">NINA</p>
                    <p className="font-mono text-lg font-bold tabular-nums text-foreground">
                      {formatDuration(panel.raw)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${maxPanelSeconds ? (Math.max(panel.validated, panel.raw) / maxPanelSeconds) * 100 : 0}%`,
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
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Les temps NINA sont bruts. Les temps validés restent ceux saisis après tri/prétraitement.
          </p>
        </Card>
      )}

      <FilterRecap
        title="RÉCAPITULATIF VALIDÉ PAR FILTRE"
        sessions={validatedSessions}
        emptyText="Aucune donnée validée pour le moment."
      />

      <FilterRecap
        title="RÉCAPITULATIF NINA BRUT PAR FILTRE"
        sessions={rawSessions}
        emptyText="Aucune acquisition NINA importée pour le moment."
      />
    </div>
  )
}
