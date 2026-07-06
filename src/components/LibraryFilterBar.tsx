'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { STATUS_OPTIONS } from '@/lib/status'
import { PLATFORMS } from '@/lib/platforms'
import type { LibraryFilters } from '@/lib/filters'

const DECADES = [1980, 1990, 2000, 2010, 2020]

// Reconstruit la query string de /jeux depuis les filtres courants, avec
// surcharges (null = retirer le paramètre). Les valeurs par défaut (tri
// récent, vue liste) ne polluent pas l'URL.
function buildQuery(
  filters: LibraryFilters,
  view: 'list' | 'grid',
  overrides: Record<string, string | null> = {},
): string {
  const params = new URLSearchParams()
  const base: Record<string, string | undefined> = {
    q: filters.search,
    status: filters.status,
    qualified: filters.qualified ? '1' : undefined,
    platform: filters.platform,
    genre: filters.genre,
    decade: filters.decade?.toString(),
    minRating: filters.minRating?.toString(),
    minHours: filters.minHours?.toString(),
    sort: filters.sort !== 'recent' ? filters.sort : undefined,
    view: view !== 'list' ? view : undefined,
  }
  for (const [key, value] of Object.entries(base)) if (value) params.set(key, value)
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === '') params.delete(key)
    else params.set(key, value)
  }
  return params.toString()
}

const CHIP = 'rounded-full border px-3 py-1 text-xs transition-colors'
const CHIP_OFF = `${CHIP} border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200`
const CHIP_ON = `${CHIP} border-emerald-600 bg-emerald-950 text-emerald-300`
const FIELD =
  'rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm placeholder:text-zinc-600'

export function LibraryFilterBar({
  filters,
  view,
}: {
  filters: LibraryFilters
  view: 'list' | 'grid'
}) {
  const router = useRouter()

  // Section avancée dépliée uniquement quand l'un de ses filtres est actif
  const advancedActive =
    filters.platform !== undefined ||
    filters.genre !== undefined ||
    filters.decade !== undefined ||
    filters.minRating !== undefined ||
    filters.minHours !== undefined

  const hasActiveFilters =
    advancedActive ||
    filters.search !== undefined ||
    filters.status !== undefined ||
    filters.qualified === true ||
    filters.sort !== 'recent'

  // Un seul chemin de soumission : Entrée dans un champ, ou changement d'un
  // select (qui re-soumet le formulaire). Les chips sont de simples liens.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const overrides: Record<string, string | null> = {}
    for (const key of ['q', 'platform', 'genre', 'decade', 'minRating', 'minHours']) {
      const value = String(data.get(key) ?? '').trim()
      overrides[key] = value || null
    }
    const sort = String(data.get('sort') ?? 'recent')
    overrides.sort = sort === 'recent' ? null : sort
    router.push(`/jeux?${buildQuery(filters, view, overrides)}`)
  }

  const autoSubmit = (event: React.ChangeEvent<HTMLSelectElement>) =>
    event.currentTarget.form?.requestSubmit()

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm">
      {/* Ligne 1 : recherche + tri */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          name="q"
          type="search"
          aria-label="Rechercher un titre"
          defaultValue={filters.search ?? ''}
          placeholder="Rechercher un titre… (Entrée pour appliquer)"
          className={`${FIELD} min-w-48 flex-1`}
        />
        <label className="flex items-center gap-2 text-zinc-400">
          Tri
          <select
            name="sort"
            defaultValue={filters.sort}
            onChange={autoSubmit}
            className={FIELD}
          >
            <option value="recent">Ajout récent</option>
            <option value="title">Titre</option>
            <option value="rating">Note</option>
            <option value="releaseYear">Année de sortie</option>
            <option value="hours">Temps de jeu</option>
          </select>
        </label>
      </div>

      {/* Ligne 2 : statuts en chips + vue qualifiés + réinitialisation */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/jeux?${buildQuery(filters, view, { status: null, qualified: null })}`}
          className={!filters.status && !filters.qualified ? CHIP_ON : CHIP_OFF}
        >
          Tous
        </Link>
        {STATUS_OPTIONS.map(([value, label]) => (
          <Link
            key={value}
            href={`/jeux?${buildQuery(filters, view, {
              status: filters.status === value ? null : value,
              qualified: null,
            })}`}
            className={filters.status === value ? CHIP_ON : CHIP_OFF}
          >
            {label}
          </Link>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-zinc-800" />
        <Link
          href={`/jeux?${buildQuery(filters, view, {
            qualified: filters.qualified ? null : '1',
            status: null,
          })}`}
          title="Masque « À trier » et « Collection » : ne restent que les jeux que vous avez qualifiés"
          className={filters.qualified ? CHIP_ON : CHIP_OFF}
        >
          Qualifiés seulement
        </Link>
        {hasActiveFilters && (
          <Link
            href={view === 'grid' ? '/jeux?view=grid' : '/jeux'}
            className="ml-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            Réinitialiser
          </Link>
        )}
      </div>

      {/* Ligne 3 : filtres avancés, repliés par défaut */}
      <details open={advancedActive} className="group">
        <summary className="cursor-pointer select-none text-xs text-zinc-500 hover:text-zinc-300">
          Plus de filtres{advancedActive && ' (actifs)'}
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Plateforme jouée
            <select
              name="platform"
              defaultValue={filters.platform ?? ''}
              onChange={autoSubmit}
              className={FIELD}
            >
              <option value="">Toutes</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Genre
            <input
              name="genre"
              defaultValue={filters.genre ?? ''}
              placeholder="RPG…"
              className={`${FIELD} w-28`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Décennie
            <select
              name="decade"
              defaultValue={filters.decade ?? ''}
              onChange={autoSubmit}
              className={FIELD}
            >
              <option value="">Toutes</option>
              {DECADES.map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Note min. (/20)
            <input
              name="minRating"
              type="number"
              min={0}
              max={20}
              defaultValue={filters.minRating ?? ''}
              className={`${FIELD} w-16`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Heures min.
            <input
              name="minHours"
              type="number"
              min={0}
              defaultValue={filters.minHours ?? ''}
              className={`${FIELD} w-16`}
            />
          </label>
          <button
            type="submit"
            className="rounded border border-zinc-700 px-3 py-1 text-xs hover:border-zinc-500"
          >
            Appliquer
          </button>
        </div>
      </details>
    </form>
  )
}
