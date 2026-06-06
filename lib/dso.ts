export type FilterType = "L" | "R" | "G" | "B" | "H-alpha" | "OIII" | "SII"

export const FILTERS: FilterType[] = ["L", "R", "G", "B", "H-alpha", "OIII", "SII"]

// Couleurs d'affichage par filtre (alignées sur la sémantique astro)
export const FILTER_COLORS: Record<FilterType, string> = {
  L: "oklch(0.9 0.01 264)",
  R: "oklch(0.65 0.2 25)",
  G: "oklch(0.75 0.16 145)",
  B: "oklch(0.68 0.15 255)",
  "H-alpha": "oklch(0.7 0.19 20)",
  OIII: "oklch(0.78 0.13 195)",
  SII: "oklch(0.7 0.16 320)",
}

export interface Session {
  id: string
  targetId: string
  filter: FilterType
  subExposure: number // secondes par pose
  subCount: number // nombre de poses conservées
  createdAt: number // timestamp ms
}

export interface Target {
  id: string
  name: string
  createdAt: number
}

export interface AppState {
  targets: Target[]
  sessions: Session[]
}

// secondes -> "5h 15m" (ou "12m 30s" si < 1h)
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m"
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  if (h > 0) {
    return m > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${m}m`
  }
  return `${s}s`
}

export function sessionSeconds(session: Session): number {
  return session.subExposure * session.subCount
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} j`
}
