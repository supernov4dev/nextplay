import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getEntryWithGame } from '@/lib/library'
import { StatusBadge } from '@/components/StatusBadge'
import { EntryDetail } from '@/components/EntryDetail'

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
        <div className="space-y-2">
          <h2 className="font-semibold">Mon vécu</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={entry.status} />
            <span>{entry.rating != null ? `Ma note : ${entry.rating}/10` : 'Pas encore noté'}</span>
            {entry.platformsPlayed.length > 0 && <span>Joué sur : {entry.platformsPlayed.join(', ')}</span>}
            {entry.playPeriod && <span>Période : {entry.playPeriod}</span>}
            {entry.estimatedHours != null && <span>≈ {entry.estimatedHours} h</span>}
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
              review: entry.review ?? '',
              platformsPlayed: entry.platformsPlayed.join(', '),
              playPeriod: entry.playPeriod ?? '',
              estimatedHours: entry.estimatedHours?.toString() ?? '',
            }}
          />
        </div>
      </div>
    </div>
  )
}
