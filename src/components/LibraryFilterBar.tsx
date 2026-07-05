import { STATUS_OPTIONS } from '@/lib/status'
import { PLATFORMS } from '@/lib/platforms'
import type { LibraryFilters } from '@/lib/filters'

const DECADES = [1980, 1990, 2000, 2010, 2020]

export function LibraryFilterBar({
  filters,
  view,
}: {
  filters: LibraryFilters
  view: 'list' | 'grid'
}) {
  return (
    <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
      <input type="hidden" name="view" value={view} />
      <label className="flex flex-col gap-1">
        Recherche
        <input
          name="q"
          defaultValue={filters.search ?? ''}
          placeholder="Titre…"
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Statut
        <select name="status" defaultValue={filters.status ?? ''} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
          <option value="">Tous</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Plateforme jouée
        <select name="platform" defaultValue={filters.platform ?? ''} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
          <option value="">Toutes</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Genre
        <input name="genre" defaultValue={filters.genre ?? ''} placeholder="RPG…" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Décennie
        <select name="decade" defaultValue={filters.decade ?? ''} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
          <option value="">Toutes</option>
          {DECADES.map((d) => (
            <option key={d} value={d}>{d}s</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Note min. (/20)
        <input name="minRating" type="number" min={0} max={20} defaultValue={filters.minRating ?? ''} className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Tri
        <select name="sort" defaultValue={filters.sort} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
          <option value="recent">Ajout récent</option>
          <option value="title">Titre</option>
          <option value="rating">Note</option>
          <option value="releaseYear">Année de sortie</option>
        </select>
      </label>
      <button type="submit" className="rounded bg-emerald-700 px-3 py-1.5 font-medium hover:bg-emerald-600">
        Filtrer
      </button>
    </form>
  )
}
