import { NextResponse } from "next/server"

export const runtime = "nodejs"

const HALPHA_REST_NM = 656.28
const HALPHA_FILTER_CENTER_NM = 656.3
const COMMON_HALPHA_FILTER_WIDTHS_NM = [3, 5, 7, 12]

type HalphaStatus = "ok" | "borderline" | "outside"

interface WikipediaSummary {
  image: string | null
  title?: string
  extract?: string
  pageUrl?: string
  wikidataId?: string
  lang?: string
}

interface HalphaFilterCheck {
  widthNm: number
  halfWidthNm: number
  offsetNm: number
  status: HalphaStatus
  label: string
}

function numberFromWikidataQuantity(value: unknown): number | null {
  if (!value || typeof value !== "object") return null
  const amount = (value as { amount?: unknown }).amount
  if (typeof amount !== "string" && typeof amount !== "number") return null
  const parsed = Number(amount)
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

async function fetchSummary(lang: string, title: string): Promise<WikipediaSummary | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title,
  )}?redirect=true`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "DSO-Exposure-Tracker/1.0 (shared astro planning tool)" },
      // Les images/résumés d'objets astronomiques changent peu : cache côté Next pendant 24 h.
      next: { revalidate: 86400 },
    })
  } catch {
    return null
  }

  if (!res.ok) return null

  const data = await res.json()
  if (data.type === "disambiguation") return null

  const image: string | null = data.originalimage?.source ?? data.thumbnail?.source ?? null
  const wikidataId: string | undefined = data.wikibase_item
  const pageUrl: string | undefined = data.content_urls?.desktop?.page

  // On accepte aussi un résultat sans image s'il fournit un identifiant Wikidata.
  if (!image && !wikidataId && !pageUrl) return null

  return {
    image,
    title: data.title as string | undefined,
    extract: (data.extract as string | undefined) ?? "",
    pageUrl,
    wikidataId,
    lang,
  }
}

async function fetchRedshiftFromWikidata(wikidataId: string): Promise<number | null> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(
    wikidataId,
  )}.json`

  let res: Response
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "DSO-Exposure-Tracker/1.0 (shared astro planning tool)" },
      next: { revalidate: 7 * 86400 },
    })
  } catch {
    return null
  }

  if (!res.ok) return null

  const data = await res.json()
  const entity = data.entities?.[wikidataId]
  const claims = entity?.claims
  if (!claims) return null

  // P1090 = redshift. On prend la première valeur numérique exploitable.
  const redshiftClaims = claims.P1090 ?? []
  for (const claim of redshiftClaims) {
    const value = claim?.mainsnak?.datavalue?.value
    const redshift = numberFromWikidataQuantity(value)
    if (redshift !== null) return redshift
  }

  return null
}


function catalogueSearchCandidates(name: string): string[] {
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const candidates = new Set<string>()

  for (const match of normalized.matchAll(/\bm\s*(\d{1,3})\b/g)) {
    candidates.add(`M${Number(match[1])}`)
    candidates.add(`Messier ${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bmessier\s*(\d{1,3})\b/g)) {
    candidates.add(`M${Number(match[1])}`)
    candidates.add(`Messier ${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bngc\s*(\d{1,5})\b/g)) {
    candidates.add(`NGC ${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bic\s*(\d{1,5})\b/g)) {
    candidates.add(`IC ${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bsh2\s*(\d{1,4})\b/g)) {
    candidates.add(`Sh2-${Number(match[1])}`)
    candidates.add(`Sharpless ${Number(match[1])}`)
  }
  for (const match of normalized.matchAll(/\bsharpless\s*(\d{1,4})\b/g)) {
    candidates.add(`Sh2-${Number(match[1])}`)
    candidates.add(`Sharpless ${Number(match[1])}`)
  }

  return Array.from(candidates)
}

function buildCandidates(name: string): string[] {
  const candidates = new Set<string>()
  const full = name.trim()
  if (!full) return []

  candidates.add(full)

  // Si le nom vient de NINA avec un suffixe, par exemple "M51 test NINA",
  // on extrait quand même les candidats catalogue sûrs pour retrouver Wikipedia/Wikidata.
  for (const candidate of catalogueSearchCandidates(full)) candidates.add(candidate)

  // Partie avant " - " : souvent le code catalogue, par exemple "M31" ou "NGC 7000".
  const code = full.split(" - ")[0].trim()
  if (code) candidates.add(code)

  // Partie après " - " : souvent le nom commun.
  const common = full.split(" - ")[1]?.trim()
  if (common) candidates.add(common)

  // Messier : "M31" -> "Messier 31".
  const m = code.match(/^M\s?(\d+)$/i)
  if (m) {
    candidates.add(`Messier ${m[1]}`)
    candidates.add(`M ${m[1]}`)
  }

  // NGC/IC : "NGC7000" -> "NGC 7000".
  const ngc = code.match(/^(NGC|IC)\s?(\d+)$/i)
  if (ngc) candidates.add(`${ngc[1].toUpperCase()} ${ngc[2]}`)

  // Quelques noms saisis en anglais/français sans suffixe.
  candidates.add(full.replace(/galaxie/gi, "galaxy"))
  candidates.add(full.replace(/galaxy/gi, "galaxie"))

  return Array.from(candidates)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get("name")
  if (!name) {
    return NextResponse.json({ error: "Paramètre 'name' requis" }, { status: 400 })
  }

  const candidates = buildCandidates(name)
  let summary: WikipediaSummary | null = null

  for (const lang of ["fr", "en"]) {
    for (const candidate of candidates) {
      const result = await fetchSummary(lang, candidate)
      if (result) {
        summary = result
        break
      }
    }
    if (summary) break
  }

  if (!summary) {
    return NextResponse.json({ image: null, redshift: null }, { status: 200 })
  }

  const redshift = summary.wikidataId
    ? await fetchRedshiftFromWikidata(summary.wikidataId)
    : null

  const halphaObservedNm = redshift !== null ? HALPHA_REST_NM * (1 + redshift) : null
  const halphaShiftNm = halphaObservedNm !== null ? halphaObservedNm - HALPHA_FILTER_CENTER_NM : null

  return NextResponse.json(
    {
      ...summary,
      redshift,
      halphaRestNm: HALPHA_REST_NM,
      halphaFilterCenterNm: HALPHA_FILTER_CENTER_NM,
      halphaObservedNm,
      halphaShiftNm,
      halphaChecks: halphaObservedNm !== null ? buildHalphaChecks(halphaObservedNm) : [],
      wikidataUrl: summary.wikidataId
        ? `https://www.wikidata.org/wiki/${summary.wikidataId}`
        : null,
    },
    { status: 200 },
  )
}
