import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getEntryWithGame } from '@/lib/library'
import { StatusBadge } from '@/components/StatusBadge'
import { RatingBadge } from '@/components/RatingBadge'
import { EntryDetail } from '@/components/EntryDetail'
import { formatPeriods } from '@/lib/periods'

export const dynamic = 'force-dynamic'

export default async function FicheJeuPage({
  params,
}: {
  params: Promise<{ entryId: string }>
}) {
  const { entryId } = await params
  const entry = await getEntryWithGame(entryId)
  if (!entry) notFound()

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="shrink-0">
        {entry.game.coverUrl ? (
          <Image src={entry.game.coverUrl} alt={entry.game.title} width={264} height={374} className="rounded" />
        ) : (
          <div className="flex h-[374px] w-[264px] items-center justify-center rounded bg-zinc-800 p-4 text-center">
            {entry.game.title}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">
            {entry.game.title}
            {entry.game.releaseYear && (
              <span className="ml-3 text-lg font-normal text-zinc-500">{entry.game.releaseYear}</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {entry.game.genres.join(', ')}
            {entry.game.igdbRating != null && ` · Note IGDB : ${Math.round(entry.game.igdbRating)}/100`}
          </p>
        </div>
        {entry.game.summary && <p className="text-sm text-zinc-300">{entry.game.summary}</p>}
        <hr className="border-zinc-800" />
        <div className="space-y-3">
          <h2 className="font-semibold">Mon vécu</h2>
          <div className="flex items-center gap-4">
            {entry.rating != null ? (
              <RatingBadge rating={entry.rating} size="lg" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xs text-zinc-500">
                Pas noté
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={entry.status} />
              {entry.mastered && (
                <span className="rounded bg-amber-900 px-2 py-0.5 text-xs font-medium text-amber-300">
                  🏆 Platiné / 100 %
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
            {entry.platformsPlayed.length > 0 && <span>Joué sur : {entry.platformsPlayed.join(', ')}</span>}
            {entry.periods.length > 0 && <span>Période(s) : {formatPeriods(entry.periods)}</span>}
            {entry.estimatedHours != null && <span>≈ {entry.estimatedHours} h</span>}
            {entry.steamPlaytimeMinutes != null && (
              <span title="Temps de jeu réel enregistré par Steam">
                Steam :{' '}
                {entry.steamPlaytimeMinutes >= 60
                  ? `${Math.round(entry.steamPlaytimeMinutes / 60)} h`
                  : `${entry.steamPlaytimeMinutes} min`}
              </span>
            )}
          </div>
          {entry.review && (
            <blockquote className="rounded border-l-2 border-emerald-700 bg-zinc-900 p-3 text-sm">
              {entry.review}
            </blockquote>
          )}
          <EntryDetail
            entryId={entry.id}
            initial={{
              status: entry.status,
              rating: entry.rating?.toString() ?? '',
              mastered: entry.mastered,
              review: entry.review ?? '',
              platformsPlayed: entry.platformsPlayed,
              periods: entry.periods.map((p) => ({
                startYear: String(p.startYear),
                endYear: p.endYear != null ? String(p.endYear) : '',
              })),
              estimatedHours: entry.estimatedHours?.toString() ?? '',
            }}
          />
        </div>
      </div>
    </div>
  )
}
