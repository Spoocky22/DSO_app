"use client"

import useSWR from "swr"
import { Card } from "@/components/ui/card"
import { ImageOff, Loader2, ExternalLink } from "lucide-react"

interface ImageData {
  image: string | null
  title?: string
  extract?: string
  pageUrl?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface Props {
  targetName: string | null
}

export function ObjectPreview({ targetName }: Props) {
  const { data, isLoading } = useSWR<ImageData>(
    targetName ? `/api/object-image?name=${encodeURIComponent(targetName)}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: false },
  )

  const short = targetName?.split(" - ")[0] ?? ""

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

        {/* Dégradé bas pour lisibilité du titre */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-card via-card/70 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight text-foreground">
              {short}
            </p>
            {targetName?.split(" - ")[1] && (
              <p className="truncate text-xs text-muted-foreground">
                {targetName.split(" - ")[1]}
              </p>
            )}
          </div>
          {data?.pageUrl && (
            <a
              href={data.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
            >
              Wikipédia
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}
