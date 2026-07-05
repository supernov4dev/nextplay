// Note /20 en badge coloré (échelle type Metacritic).
const SCALE: [number, string][] = [
  [17, 'bg-emerald-600'],
  [14, 'bg-lime-600'],
  [12, 'bg-yellow-600'],
  [8, 'bg-orange-600'],
  [0, 'bg-red-600'],
]

export function ratingColorClass(rating: number): string {
  return SCALE.find(([min]) => rating >= min)?.[1] ?? 'bg-zinc-700'
}

export function RatingBadge({
  rating,
  size = 'sm',
}: {
  rating: number
  size?: 'sm' | 'lg'
}) {
  if (size === 'lg') {
    return (
      <div
        className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl text-white ${ratingColorClass(rating)}`}
      >
        <span className="text-2xl font-bold leading-none">{rating}</span>
        <span className="text-[10px] opacity-80">/20</span>
      </div>
    )
  }
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold text-white ${ratingColorClass(rating)}`}
    >
      {rating}
    </span>
  )
}
