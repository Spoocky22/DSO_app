export type FilterType = "L" | "R" | "G" | "B" | "H-alpha" | "OIII" | "SII"
export type SessionStatus = "validated" | "acquired" | "rejected"
export type SessionSource = "manual" | "nina" | "import"

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

export const MAX_PANEL_COUNT = 20

export interface Session {
  id: string
  targetId: string
  panelIndex: number // panneau / pano de mosaïque, 1 si cible simple
  filter: FilterType
  subExposure: number // secondes par pose
  subCount: number // nombre de poses
  status: SessionStatus // validated = conservé, acquired = brut NINA, rejected = jeté après tri
  source: SessionSource // manual, nina, import
  externalId: string | null // id externe pour éviter les doublons NINA/import
  filename: string | null
  capturedAt: number | null // timestamp ms de l'acquisition réelle si connue
  importedAt: number | null // timestamp ms d'import dans l'app
  createdAt: number // timestamp ms utilisé pour l'affichage historique
}

export interface Target {
  id: string
  name: string
  panelCount: number // nombre de panneaux / pano de la cible
  redshiftOverride: number | null // correction manuelle éventuelle du redshift Wikidata
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

export function panelLabel(panelIndex: number): string {
  return `P${panelIndex}`
}

export function isValidFilter(filter: string): filter is FilterType {
  return (FILTERS as readonly string[]).includes(filter)
}

export function normalizeFilterName(raw: unknown): FilterType | null {
  const value = String(raw ?? "").trim()
  const compact = value.toLowerCase().replace(/[\s_\-]+/g, "")

  if (["l", "lum", "luminance", "clear"].includes(compact)) return "L"
  if (["r", "red", "rouge"].includes(compact)) return "R"
  if (["g", "green", "vert", "verte"].includes(compact)) return "G"
  if (["b", "blue", "bleu", "bleue"].includes(compact)) return "B"
  if (["ha", "halpha", "hα", "hydrogenalpha", "hydrogen-alpha"].includes(compact)) return "H-alpha"
  if (["oiii", "o3", "oxygeniii", "oxygen3"].includes(compact)) return "OIII"
  if (["sii", "s2", "sulfurii", "sulphurii", "soufreii"].includes(compact)) return "SII"

  if (isValidFilter(value)) return value
  return null
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
