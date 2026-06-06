import { NextResponse } from "next/server"

export const runtime = "nodejs"

// Récupère l'image principale d'un objet du ciel profond depuis Wikipédia.
// Stratégie : on tente plusieurs variantes de titre (FR puis EN), via l'API
// REST summary qui renvoie une vignette + image originale.

async function fetchSummary(lang: string, title: string) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title,
  )}?redirect=true`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "DSO-Exposure-Tracker/1.0 (astro team tool)" },
      // cache côté Next pendant 24h, les images d'objets ne changent pas
      next: { revalidate: 86400 },
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const data = await res.json()
  if (data.type === "disambiguation") return null
  const image: string | undefined =
    data.originalimage?.source ?? data.thumbnail?.source
  if (!image) return null
  return {
    image,
    title: data.title as string,
    extract: (data.extract as string) ?? "",
    pageUrl: data.content_urls?.desktop?.page as string | undefined,
  }
}

// Génère des candidats de titres à partir du nom de la cible saisi.
function buildCandidates(name: string): string[] {
  const candidates = new Set<string>()
  const full = name.trim()
  candidates.add(full)

  // Partie avant " - " (souvent le code catalogue : "M31", "NGC 7000")
  const code = full.split(" - ")[0].trim()
  candidates.add(code)

  // Partie après " - " (nom commun : "Galaxie d'Andromède")
  const common = full.split(" - ")[1]?.trim()
  if (common) candidates.add(common)

  // Messier : "M31" -> "Messier 31"
  const m = code.match(/^M\s?(\d+)$/i)
  if (m) candidates.add(`Messier ${m[1]}`)

  // Normalise les espaces dans NGC/IC : "NGC7000" -> "NGC 7000"
  const ngc = code.match(/^(NGC|IC)\s?(\d+)$/i)
  if (ngc) candidates.add(`${ngc[1].toUpperCase()} ${ngc[2]}`)

  return Array.from(candidates).filter(Boolean)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get("name")
  if (!name) {
    return NextResponse.json({ error: "Paramètre 'name' requis" }, { status: 400 })
  }

  const candidates = buildCandidates(name)

  for (const lang of ["fr", "en"]) {
    for (const candidate of candidates) {
      const result = await fetchSummary(lang, candidate)
      if (result) {
        return NextResponse.json(result)
      }
    }
  }

  return NextResponse.json({ image: null }, { status: 200 })
}
