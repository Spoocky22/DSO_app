"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  ImageOff,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react"

const HALPHA_REST_NM = 656.28
const HALPHA_FILTER_CENTER_NM = 656.3
const COMMON_HALPHA_FILTER_WIDTHS_NM = [3, 5, 7, 12]

type HalphaStatus = "ok" | "borderline" | "outside"

interface HalphaFilterCheck {
  widthNm: number
  halfWidthNm: number
  offsetNm: number
  status: HalphaStatus
  label: string
}

interface ImageData {
  image: string | null
  title?: string
  extract?: string
  pageUrl?: string
  wikidataId?: string
  wikidataUrl?: string | null
  redshift?: number | null
  halphaRestNm?: number
  halphaFilterCenterNm?: number
  halphaObservedNm?: number | null
  halphaShiftNm?: number | null
  halphaChecks?: HalphaFilterCheck[]
}

const fetcher = async (url: string): Promise<ImageData> => {
  const response = await fetch(url)
  if (!response.ok) return { image: null }
  return response.json()
}

interface Props {
  targetName: string | null
  redshiftOverride?: number | null
  onRedshiftOverrideChange?: (redshift: number | null) => Promise<void> | void
}

function formatSignedNm(value: number): string {
  const sign = value > 0 ? "+" : ""
  return `${sign}${value.toFixed(2)} nm`
}

function formatRedshift(value: number): string {
  const abs = Math.abs(value)
  if (abs < 0.001 && value !== 0) return value.toExponential(3)
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
}

function parseRedshiftInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".")
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function classifyHalphaFilter(offsetNm: number, widthNm: number): HalphaStatus {
  const halfWidthNm = widthNm / 2
  const comfortableLimitNm = halfWidthNm * 0.6

  if (offsetNm <= comfortableLimitNm) return "ok"
  if (offsetNm <= halfWidthNm) return "borderline"
  return "outside"
}

function labelForStatus(status: HalphaStatus): string {
  if (status === "ok") return "OK"
  if (status === "borderline") return "limite"
  return "hors bande"
}

function buildHalphaChecks(observedNm: number): HalphaFilterCheck[] {
  const offsetNm = Math.abs(observedNm - HALPHA_FILTER_CENTER_NM)

  return COMMON_HALPHA_FILTER_WIDTHS_NM.map((widthNm) => {
    const status = classifyHalphaFilter(offsetNm, widthNm)
    return {
      widthNm,
      halfWidthNm: widthNm / 2,
      offsetNm,
      status,
      label: labelForStatus(status),
    }
  })
}

function checkClass(status: HalphaFilterCheck["status"]): string {
  if (status === "ok") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
  }
  if (status === "borderline") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300"
  }
  return "border-destructive/40 bg-destructive/10 text-destructive"
}

function statusIcon(status: HalphaFilterCheck["status"]) {
  if (status === "ok") return <CheckCircle2 className="size-3" />
  if (status === "borderline") return <Info className="size-3" />
  return <AlertTriangle className="size-3" />
}

export function ObjectPreview({
  targetName,
  redshiftOverride = null,
  onRedshiftOverrideChange,
}: Props) {
  const [editingRedshift, setEditingRedshift] = useState(false)
  const [redshiftInput, setRedshiftInput] = useState("")
  const [redshiftError, setRedshiftError] = useState<string | null>(null)
  const [savingRedshift, setSavingRedshift] = useState(false)

  const { data, isLoading } = useSWR<ImageData>(
    targetName ? `/api/object-image?name=${encodeURIComponent(targetName)}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: false },
  )

  const short = targetName?.split(" - ")[0] ?? ""
  const commonName = targetName?.split(" - ")[1]
  const wikidataRedshift = typeof data?.redshift === "number" ? data.redshift : null
  const manualRedshift = typeof redshiftOverride === "number" ? redshiftOverride : null
  const effectiveRedshift = manualRedshift ?? wikidataRedshift
  const redshiftSource = manualRedshift !== null ? "manuel" : wikidataRedshift !== null ? "Wikidata" : null

  const halpha = useMemo(() => {
    if (effectiveRedshift === null) return null
    const observedNm = HALPHA_REST_NM * (1 + effectiveRedshift)
    const shiftNm = observedNm - HALPHA_FILTER_CENTER_NM
    return {
      observedNm,
      shiftNm,
      checks: buildHalphaChecks(observedNm),
    }
  }, [effectiveRedshift])

  const hasHalpha = effectiveRedshift !== null && halpha !== null

  useEffect(() => {
    setEditingRedshift(false)
    setRedshiftError(null)
    setRedshiftInput(effectiveRedshift !== null ? formatRedshift(effectiveRedshift) : "")
  }, [targetName, effectiveRedshift])

  function beginEditRedshift() {
    setRedshiftInput(effectiveRedshift !== null ? formatRedshift(effectiveRedshift) : "")
    setRedshiftError(null)
    setEditingRedshift(true)
  }

  async function saveRedshiftOverride() {
    if (!onRedshiftOverrideChange) return
    const parsed = parseRedshiftInput(redshiftInput)
    if (parsed === null) {
      setRedshiftError("Entre un redshift numérique, par exemple 0.00347 ou -0.001")
      return
    }
    if (parsed <= -0.1 || parsed >= 20) {
      setRedshiftError("Valeur peu crédible : le redshift doit rester entre -0.1 et 20")
      return
    }

    setSavingRedshift(true)
    setRedshiftError(null)
    try {
      await onRedshiftOverrideChange(parsed)
      setEditingRedshift(false)
    } catch (err) {
      setRedshiftError(err instanceof Error ? err.message : "Impossible d'enregistrer le redshift")
    } finally {
      setSavingRedshift(false)
    }
  }

  async function clearRedshiftOverride() {
    if (!onRedshiftOverrideChange) return
    setSavingRedshift(true)
    setRedshiftError(null)
    try {
      await onRedshiftOverrideChange(null)
      setEditingRedshift(false)
    } catch (err) {
      setRedshiftError(err instanceof Error ? err.message : "Impossible d'effacer la correction")
    } finally {
      setSavingRedshift(false)
    }
  }

  return (
    <Card className="relative gap-0 overflow-hidden p-0">
      <div className="relative aspect-[16/10] w-full bg-secondary">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : data?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.image || "/placeholder.svg"}
            alt={`Image de ${data.title ?? short}`}
            className="size-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageOff className="size-7" />
            <span className="text-xs">Aucune image trouvée</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-card via-card/70 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight text-foreground">
              {short}
            </p>
            {commonName && (
              <p className="truncate text-xs text-muted-foreground">
                {commonName}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasHalpha && (
              <Badge variant="secondary" className="bg-background/70 backdrop-blur">
                <Activity className="size-3 text-primary" />
                Hα {formatSignedNm(halpha.shiftNm)}
                {manualRedshift !== null && <span className="ml-1 opacity-70">manuel</span>}
              </Badge>
            )}
            {data?.pageUrl && (
              <a
                href={data.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
              >
                Wikipédia
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {!isLoading && targetName && (
        <div className="space-y-3 border-t border-border bg-card/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity className="size-4 text-primary" />
                Vérification Hα galaxie
              </div>
              {hasHalpha ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  z = {formatRedshift(effectiveRedshift ?? 0)} <span className="text-foreground/80">({redshiftSource})</span> · Hα observée ={" "}
                  <span className="font-mono text-foreground">
                    {halpha.observedNm.toFixed(2)} nm
                  </span>{" "}
                  · Δ depuis 656.3 nm ={" "}
                  <span className="font-mono text-foreground">
                    {formatSignedNm(halpha.shiftNm)}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Aucun redshift trouvé automatiquement. Pour une galaxie, tu peux entrer z manuellement.
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {data?.wikidataUrl && (
                <a
                  href={data.wikidataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 text-[10px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Wikidata
                </a>
              )}
              {!editingRedshift && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[10px]"
                  onClick={beginEditRedshift}
                >
                  <Pencil className="size-3" />
                  Corriger z
                </Button>
              )}
            </div>
          </div>

          {editingRedshift && (
            <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={redshiftInput}
                  onChange={(e) => setRedshiftInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRedshiftOverride()
                    if (e.key === "Escape") setEditingRedshift(false)
                  }}
                  placeholder="Ex : 0.00347"
                  className="h-9 flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="icon"
                  className="size-9 shrink-0"
                  disabled={savingRedshift}
                  onClick={saveRedshiftOverride}
                  aria-label="Enregistrer le redshift manuel"
                >
                  {savingRedshift ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-9 shrink-0"
                  disabled={savingRedshift}
                  onClick={() => setEditingRedshift(false)}
                  aria-label="Annuler"
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  La valeur manuelle remplace Wikidata pour cette cible uniquement.
                </p>
                {manualRedshift !== null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 px-2 text-[10px] text-muted-foreground"
                    disabled={savingRedshift}
                    onClick={clearRedshiftOverride}
                  >
                    <RotateCcw className="size-3" />
                    Revenir auto
                  </Button>
                )}
              </div>
              {redshiftError && (
                <p className="text-xs text-destructive">{redshiftError}</p>
              )}
            </div>
          )}

          {hasHalpha && (
            <div className="grid grid-cols-2 gap-2">
              {halpha.checks.map((check) => (
                <div
                  key={check.widthNm}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs",
                    checkClass(check.status),
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {statusIcon(check.status)}
                    Hα {check.widthNm} nm
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Test simplifié : comparaison du décalage de Hα avec des filtres centrés à
            656.3 nm. Ça ne remplace pas la courbe de transmission réelle du filtre,
            mais ça signale vite les galaxies problématiques avec un filtre étroit.
          </p>
        </div>
      )}
    </Card>
  )
}
