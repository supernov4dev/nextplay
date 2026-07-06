import type { EntryStatus } from '@prisma/client'
import { STATUS_LABELS } from '@/lib/status'

const COLORS: Record<EntryStatus, string> = {
  FINISHED: 'bg-emerald-900 text-emerald-300',
  PLAYING: 'bg-sky-900 text-sky-300',
  DROPPED: 'bg-red-900 text-red-300',
  PAUSED: 'bg-amber-900 text-amber-300',
  WISHLIST: 'bg-purple-900 text-purple-300',
  OWNED: 'bg-indigo-950 text-indigo-300',
  TO_SORT: 'bg-zinc-800 text-zinc-300',
}

export function StatusBadge({ status }: { status: EntryStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
