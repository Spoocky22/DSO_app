"use client"

import { useMemo, useState } from "react"
import {
  FILTERS,
  FILTER_COLORS,
  formatDuration,
  sessionSeconds,
  type FilterType,
  type Session,
  type Target,
} from "@/lib/dso"
import { Card } from "@/components/ui/card"
import { BarChart3, CalendarDays, Camera, ChevronDown, ChevronUp, Sigma } from "lucide-react"

type StatsMode = "week" | "month" | "year"

type PeriodStats = {
  key: string
  label: string
  start: Date
  seconds: number
  subs: number
  byFilter: Map<FilterType, { seconds: number; subs: number }>
  byTarget: Map<string, { seconds: number; subs: number }>
}

const MODE_LABELS: Record<StatsMode, string> = {
  week: "Semaine",
  month: "Mois",
  year: "Année",
}

const HISTORY_LENGTH: Record<StatsMode, number> = {
  week: 10,
  month: 12,
  year: 6,
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() || 7 // lundi=1 ... dimanche=7
  d.setDate(d.getDate() - day + 1)
  return d
}

function startOfPeriod(date: Date, mode: StatsMode): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  if (mode === "week") return startOfWeek(d)
  if (mode === "month") return new Date(d.getFullYear(), d.getMonth(), 1)
  return new Date(d.getFullYear(), 0, 1)
}

function addPeriods(date: Date, mode: StatsMode, delta: number): Date {
  const d = new Date(date)
  if (mode === "week") d.setDate(d.getDate() + 7 * delta)
  if (mode === "month") d.setMonth(d.getMonth() + delta)
  if (mode === "year") d.setFullYear(d.getFullYear() + delta)
  return startOfPeriod(d, mode)
}

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function keyFor(start: Date, mode: StatsMode): string {
  if (mode === "week") return `${start.getFullYear()}-W${pad2(isoWeekNumber(start))}`
  if (mode === "month") return `${start.getFullYear()}-${pad2(start.getMonth() + 1)}`
  return `${start.getFullYear()}`
}

function labelFor(start: Date, mode: StatsMode): string {
  if (mode === "week") return `S${pad2(isoWeekNumber(start))} ${start.getFullYear()}`
  if (mode === "month") {
    return start.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }).replace(".", "")
  }
  return String(start.getFullYear())
}

function emptyPeriod(start: Date, mode: StatsMode): PeriodStats {
  return {
    key: keyFor(start, mode),
    label: labelFor(start, mode),
    start,
    seconds: 0,
    subs: 0,
    byFilter: new Map(),
    byTarget: new Map(),
  }
}

function addToMap<K>(map: Map<K, { seconds: number; subs: number }>, key: K, seconds: number, subs: number) {
  const previous = map.get(key) ?? { seconds: 0, subs: 0 }
  map.set(key, { seconds: previous.seconds + seconds, subs: previous.subs + subs })
}

function filterRows(period: PeriodStats) {
  return FILTERS.map((filter) => {
    const value = period.byFilter.get(filter) ?? { seconds: 0, subs: 0 }
    return { filter, ...value }
  }).filter((row) => row.seconds > 0 || row.subs > 0)
}

function targetRows(period: PeriodStats) {
  return Array.from(period.byTarget.entries())
    .map(([target, value]) => ({ target, ...value }))
    .sort((a, b) => b.seconds - a.seconds)
}

function formatDelta(seconds: number): string {
  if (seconds === 0) return "stable"
  return `${seconds > 0 ? "+" : "−"}${formatDuration(Math.abs(seconds))}`
}

function PercentDelta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0 && current <= 0) return <span>—</span>
  if (previous <= 0) return <span className="text-primary">nouveau</span>
  const percent = ((current - previous) / previous) * 100
  const Icon = percent >= 0 ? ChevronUp : ChevronDown
  return (
    <span className={percent >= 0 ? "text-primary" : "text-muted-foreground"}>
      <Icon className="mr-0.5 inline size-3" />
      {Math.abs(percent).toFixed(0)}%
    </span>
  )
}

export function StatisticsDashboard({ sessions, targets }: { sessions: Session[]; targets: Target[] }) {
  const [mode, setMode] = useState<StatsMode>("month")

  const stats = useMemo(() => {
    const targetNames = new Map(targets.map((target) => [target.id, target.name]))
    const rawNinaSessions = sessions.filter((session) => session.status === "acquired" && session.source === "nina")
    const periods = new Map<string, PeriodStats>()

    for (const session of rawNinaSessions) {
      const timestamp = session.capturedAt ?? session.createdAt
      if (!timestamp) continue
      const date = new Date(timestamp)
      if (Number.isNaN(date.getTime())) continue
      const start = startOfPeriod(date, mode)
      const key = keyFor(start, mode)
      const period = periods.get(key) ?? emptyPeriod(start, mode)
      const seconds = sessionSeconds(session)
      const subs = session.subCount
      const targetName = targetNames.get(session.targetId) ?? "Cible supprimée"
      const targetLabel = session.panelIndex > 1 ? `${targetName} ${`P${session.panelIndex}`}` : targetName

      period.seconds += seconds
      period.subs += subs
      addToMap(period.byFilter, session.filter, seconds, subs)
      addToMap(period.byTarget, targetLabel, seconds, subs)
      periods.set(key, period)
    }

    const currentStart = startOfPeriod(new Date(), mode)
    const current = periods.get(keyFor(currentStart, mode)) ?? emptyPeriod(currentStart, mode)
    const previousStart = addPeriods(currentStart, mode, -1)
    const previous = periods.get(keyFor(previousStart, mode)) ?? emptyPeriod(previousStart, mode)

    const history = Array.from({ length: HISTORY_LENGTH[mode] }, (_, index) => {
      const start = addPeriods(currentStart, mode, -index)
      return periods.get(keyFor(start, mode)) ?? emptyPeriod(start, mode)
    })

    const allSeconds = rawNinaSessions.reduce((acc, session) => acc + sessionSeconds(session), 0)
    const allSubs = rawNinaSessions.reduce((acc, session) => acc + session.subCount, 0)

    return { current, previous, history, allSeconds, allSubs, rawNinaSessions }
  }, [mode, sessions, targets])

  const currentFilterRows = filterRows(stats.current)
  const previousFilterRows = filterRows(stats.previous)
  const maxFilterSeconds = Math.max(
    ...FILTERS.map((filter) => Math.max(stats.current.byFilter.get(filter)?.seconds ?? 0, stats.previous.byFilter.get(filter)?.seconds ?? 0)),
    0,
  )

  const currentTopTargets = targetRows(stats.current).slice(0, 5)
  const maxHistorySeconds = Math.max(...stats.history.map((period) => period.seconds), 0)

  return (
    <div className="space-y-4">
      <Card className="gap-0 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground">
              STATISTIQUES NINA BRUT
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Toutes les images sauvegardées par NINA, avant tri/processing.
            </p>
          </div>
          <BarChart3 className="size-4 text-primary" />
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-secondary p-1">
          {(["week", "month", "year"] as StatsMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                mode === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {MODE_LABELS[item]}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-background/40 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">période courante</p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.current.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(stats.current.seconds)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.current.subs} poses</p>
          </div>
          <div className="rounded-2xl border border-border bg-background/40 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">période précédente</p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.previous.label}</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(stats.previous.seconds)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stats.previous.subs} poses</p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-border bg-background/40 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Comparaison brute</span>
            <span className="font-mono tabular-nums text-foreground">
              {formatDelta(stats.current.seconds - stats.previous.seconds)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Variation vs période précédente</span>
            <PercentDelta current={stats.current.seconds} previous={stats.previous.seconds} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            La période courante est comparée telle quelle. Une semaine/mois/année en cours est donc naturellement incomplète.
          </p>
        </div>
      </Card>

      <Card className="gap-0 p-4">
        <div className="mb-4 flex items-center gap-2">
          <Sigma className="size-4 text-primary" />
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground">TOTAL HISTORIQUE NINA</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-background/40 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">temps total</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(stats.allSeconds)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/40 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">poses NINA</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
              {stats.allSubs}
            </p>
          </div>
        </div>
      </Card>

      <Card className="gap-0 p-4">
        <div className="mb-4 flex items-center gap-2">
          <Camera className="size-4 text-primary" />
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground">FILTRES · PÉRIODE COURANTE VS PRÉCÉDENTE</h2>
        </div>
        {currentFilterRows.length === 0 && previousFilterRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Aucune pose NINA sur ces périodes.</p>
        ) : (
          <div className="space-y-4">
            {FILTERS.map((filter) => {
              const current = stats.current.byFilter.get(filter) ?? { seconds: 0, subs: 0 }
              const previous = stats.previous.byFilter.get(filter) ?? { seconds: 0, subs: 0 }
              if (current.seconds === 0 && previous.seconds === 0) return null
              return (
                <div key={filter} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: FILTER_COLORS[filter] }} />
                      {filter}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDuration(current.seconds)} / {formatDuration(previous.seconds)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-2 overflow-hidden rounded-full bg-secondary" title="période courante">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${maxFilterSeconds ? (current.seconds / maxFilterSeconds) * 100 : 0}%`,
                          backgroundColor: FILTER_COLORS[filter],
                        }}
                      />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary" title="période précédente">
                      <div
                        className="h-full rounded-full opacity-45 transition-all"
                        style={{
                          width: `${maxFilterSeconds ? (previous.seconds / maxFilterSeconds) * 100 : 0}%`,
                          backgroundColor: FILTER_COLORS[filter],
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="gap-0 p-4">
        <div className="mb-4 flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground">HISTORIQUE PAR {MODE_LABELS[mode].toUpperCase()}</h2>
        </div>
        <div className="space-y-3">
          {stats.history.map((period) => {
            const rows = filterRows(period)
            return (
              <div key={period.key} className="rounded-2xl border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{period.label}</p>
                    <p className="text-xs text-muted-foreground">{period.subs} poses</p>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {formatDuration(period.seconds)}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${maxHistorySeconds ? (period.seconds / maxHistorySeconds) * 100 : 0}%` }}
                  />
                </div>
                {rows.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {rows.map(({ filter, seconds }) => (
                      <span
                        key={filter}
                        className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        <span className="mr-1 inline-block size-2 rounded-full" style={{ backgroundColor: FILTER_COLORS[filter] }} />
                        {filter} {formatDuration(seconds)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="gap-0 p-4">
        <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">TOP CIBLES · PÉRIODE COURANTE</h2>
        {currentTopTargets.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Aucune cible NINA sur la période courante.</p>
        ) : (
          <div className="space-y-3">
            {currentTopTargets.map((row) => (
              <div key={row.target} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/40 p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{row.target}</p>
                  <p className="text-xs text-muted-foreground">{row.subs} poses</p>
                </div>
                <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{formatDuration(row.seconds)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
