"use client"

import {
  FILTER_COLORS,
  formatDuration,
  sessionSeconds,
  timeAgo,
  type Session,
} from "@/lib/dso"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Trash2, History } from "lucide-react"

interface Props {
  sessions: Session[]
  onDelete: (id: string) => void
}

export function ContributionList({ sessions, onDelete }: Props) {
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <Card className="gap-0 p-4">
      <div className="mb-4 flex items-center gap-2">
        <History className="size-4 text-primary" />
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground">
          DERNIÈRES SESSIONS
        </h2>
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucune session enregistrée. Ajoutez la première au-dessus.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((s) => (
            <li
              key={s.id}
              className="group flex items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5"
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-background"
                style={{ backgroundColor: FILTER_COLORS[s.filter] }}
              >
                {s.filter === "H-alpha" ? "Hα" : s.filter}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {s.subCount} × {s.subExposure}s
                </p>
                <p className="text-xs text-muted-foreground">
                  {timeAgo(s.createdAt)}
                </p>
              </div>

              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                {formatDuration(sessionSeconds(s))}
              </span>

              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() => onDelete(s.id)}
                aria-label="Supprimer la session"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
