import Link from 'next/link'
import Image from 'next/image'
import type { EntryWithGame } from '@/lib/dashboard'

export function GameRow({ title, entries, emptyText }: {
  title: string
  entries: EntryWithGame[]
  emptyText?: string
}) {
  if (entries.length === 0 && !emptyText) return null
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {entries.map((entry) => (
            <Link key={entry.id} href={`/jeux/${entry.id}`} className="w-24 shrink-0 group">
              {entry.game.coverUrl ? (
                <Image src={entry.game.coverUrl} alt={entry.game.title} width={96} height={136} className="rounded group-hover:opacity-80" />
              ) : (
                <div className="flex h-[136px] w-24 items-center justify-center rounded bg-zinc-800 p-1 text-center text-[10px]">
                  {entry.game.title}
                </div>
              )}
              <p className="mt-1 truncate text-xs text-zinc-300">{entry.game.title}</p>
              {entry.rating != null && <p className="text-xs text-emerald-400">{entry.rating}/10</p>}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
