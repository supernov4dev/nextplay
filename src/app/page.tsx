import Link from 'next/link'
import { getDashboard } from '@/lib/dashboard'
import { DEFAULT_USER_ID } from '@/lib/user'
import { STATUS_LABELS, STATUS_OPTIONS } from '@/lib/status'
import { GameRow } from '@/components/GameRow'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const d = await getDashboard(DEFAULT_USER_ID)

  if (d.total === 0) {
    return (
      <div className="py-16 text-center text-zinc-400">
        <p className="text-lg">Bienvenue sur NextPlay 👋</p>
        <p className="mt-2">
          Ta bibliothèque est vide.{' '}
          <Link href="/ajouter" className="text-emerald-400 hover:underline">Ajoute ton premier jeu</Link>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-4">
        <div className="rounded border border-zinc-800 px-4 py-2">
          <p className="text-2xl font-bold">{d.total}</p>
          <p className="text-xs text-zinc-400">jeux au total</p>
        </div>
        {STATUS_OPTIONS.filter(([status]) => d.byStatus[status]).map(([status]) => (
          <Link
            key={status}
            href={`/jeux?status=${status}`}
            className="rounded border border-zinc-800 px-4 py-2 hover:border-zinc-600"
          >
            <p className="text-2xl font-bold">{d.byStatus[status]}</p>
            <p className="text-xs text-zinc-400">{STATUS_LABELS[status]}</p>
          </Link>
        ))}
      </div>
      <GameRow title="En cours" entries={d.playing} />
      <GameRow title="À trier" entries={d.toSort} />
      <GameRow title="Les mieux notés" entries={d.topRated} />
      <GameRow title="Ajoutés récemment" entries={d.recent} />
    </div>
  )
}
