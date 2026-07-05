import Link from 'next/link'
import Image from 'next/image'
import { listLibrary } from '@/lib/library'
import { parseFilters } from '@/lib/filters'
import { DEFAULT_USER_ID } from '@/lib/user'
import { StatusBadge } from '@/components/StatusBadge'
import { LibraryFilterBar } from '@/components/LibraryFilterBar'

export const dynamic = 'force-dynamic'

export default async function JeuxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const filters = parseFilters(params)
  const view = params.view === 'grid' ? 'grid' : 'list'
  const entries = await listLibrary(DEFAULT_USER_ID, filters)

  const toggleParams = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  )
  toggleParams.set('view', view === 'list' ? 'grid' : 'list')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tous les jeux ({entries.length})</h1>
        <Link href={`/jeux?${toggleParams}`} className="text-sm text-emerald-400 hover:underline">
          {view === 'list' ? 'Vue grille' : 'Vue liste'}
        </Link>
      </div>
      <LibraryFilterBar filters={filters} view={view} />
      {entries.length === 0 && (
        <p className="text-zinc-400">
          Aucun jeu. <Link href="/ajouter" className="text-emerald-400 hover:underline">Ajouter un jeu</Link>
        </p>
      )}
      {view === 'list' ? (
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-400">
            <tr>
              <th className="p-2"></th>
              <th className="p-2">Titre</th>
              <th className="p-2">Note</th>
              <th className="p-2">Statut</th>
              <th className="p-2">Plateformes jouées</th>
              <th className="p-2">Période</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                <td className="p-2">
                  {entry.game.coverUrl && (
                    <Image src={entry.game.coverUrl} alt="" width={32} height={43} className="rounded" />
                  )}
                </td>
                <td className="p-2">
                  <Link href={`/jeux/${entry.id}`} className="font-medium hover:text-emerald-400">
                    {entry.game.title}
                  </Link>
                  {entry.game.releaseYear && (
                    <span className="ml-2 text-zinc-500">{entry.game.releaseYear}</span>
                  )}
                </td>
                <td className="p-2">{entry.rating != null ? `${entry.rating}/10` : '—'}</td>
                <td className="p-2"><StatusBadge status={entry.status} /></td>
                <td className="p-2 text-zinc-400">{entry.platformsPlayed.join(', ') || '—'}</td>
                <td className="p-2 text-zinc-400">{entry.playPeriod ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {entries.map((entry) => (
            <Link key={entry.id} href={`/jeux/${entry.id}`} className="group">
              {entry.game.coverUrl ? (
                <Image
                  src={entry.game.coverUrl}
                  alt={entry.game.title}
                  width={264}
                  height={374}
                  className="rounded group-hover:opacity-80"
                />
              ) : (
                <div className="flex aspect-[264/374] items-center justify-center rounded bg-zinc-800 p-2 text-center text-xs">
                  {entry.game.title}
                </div>
              )}
              <p className="mt-1 truncate text-xs text-zinc-300">{entry.game.title}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
