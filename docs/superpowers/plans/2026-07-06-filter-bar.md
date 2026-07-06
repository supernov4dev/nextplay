# Barre de filtres repensée + vue « Qualifiés » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filtrage instantané dans « Tous les jeux » (chips de statut, recherche, filtres avancés repliés) et une vue « Qualifiés seulement » qui masque « À trier » et « Collection ».

**Architecture:** Nouveau filtre booléen `qualified` (URL `?qualified=1`) exclu côté Prisma (`status notIn [TO_SORT, OWNED]`, ignoré si un statut explicite est présent). `LibraryFilterBar` devient un client component : les chips sont des liens construits depuis les filtres courants, les champs texte/nombre vivent dans un formulaire soumis à Entrée, les selects re-soumettent le formulaire à chaque changement, le tout aboutissant à un `router.push` vers `/jeux?…`.

**Tech Stack:** Next.js 16 (App Router, client component + `useRouter`), TypeScript, Tailwind 4, Vitest 4.

**Spec :** `docs/superpowers/specs/2026-07-05-nextplay-design.md` §5.1 « Barre de filtres » (révision du 2026-07-06).

## Global Constraints

- **Next.js 16 ≠ ta connaissance** : suis les patterns des fichiers existants ; en cas de doute lis `node_modules/next/dist/docs/`.
- **UI et commentaires en français**, style sobre existant : bordures fines `border-zinc-700/800`, fonds transparents ou `bg-zinc-900`, **émeraude réservée à l'état actif/action principale**.
- La sémantique des filtres existants ne change pas ; `qualified` est ignoré quand `status` est présent.
- **Tests** : Postgres lancé (`npm run db:up`) ; suite actuelle : 116 tests — doit rester verte.
- Fin de commit : `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (préfixes `feat:`, français).

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/filters.ts` (modif) | `qualified?: boolean` + parsing `qualified=1` |
| `src/lib/library.ts` (modif) | Exclusion `TO_SORT`/`OWNED` quand `qualified` sans `status` |
| `src/components/LibraryFilterBar.tsx` (réécrit) | Client component : chips, recherche, tri, section repliée |
| `test/filters.test.ts`, `test/library-list.test.ts` | Tests |

---

### Task 1 : Filtre « qualifiés » (parsing + requête)

**Files:**
- Modify: `src/lib/filters.ts`
- Modify: `src/lib/library.ts` (`listLibrary`, construction du `where`)
- Test: `test/filters.test.ts`, `test/library-list.test.ts`

**Interfaces:**
- Produces: `LibraryFilters.qualified?: boolean` ; URL `?qualified=1` → `filters.qualified = true` (toute autre valeur ignorée) ; `listLibrary` exclut les statuts `TO_SORT` et `OWNED` quand `qualified` est vrai ET qu'aucun `status` n'est présent. La Task 2 consomme `filters.qualified` pour l'état de la chip.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `test/filters.test.ts`, ajouter au describe existant de `parseFilters` :

```ts
  it('qualified=1 → filtre qualifiés ; autre valeur → ignoré', () => {
    expect(parseFilters({ qualified: '1' }).qualified).toBe(true)
    expect(parseFilters({ qualified: '0' }).qualified).toBeUndefined()
    expect(parseFilters({}).qualified).toBeUndefined()
  })
```

Dans `test/library-list.test.ts`, ajouter un describe (réutiliser/adapter les helpers du fichier — le describe « heures effectives » a déjà un helper local `createEntry` et un `beforeEach` de nettoyage, suivre le même modèle) :

```ts
describe('filtre qualifiés (masque À trier et Collection)', () => {
  it('exclut TO_SORT et OWNED quand qualified est actif', async () => {
    await createEntry({ title: 'A', status: 'FINISHED' })
    await createEntry({ title: 'B', status: 'TO_SORT' })
    await createEntry({ title: 'C', status: 'OWNED' })
    await createEntry({ title: 'D', status: 'PLAYING' })
    const entries = await listLibrary(USER, { sort: 'title', qualified: true })
    expect(entries.map((e) => e.game.title)).toEqual(['A', 'D'])
  })

  it('sans effet quand un statut explicite est sélectionné', async () => {
    await createEntry({ title: 'A', status: 'FINISHED' })
    await createEntry({ title: 'B', status: 'TO_SORT' })
    const entries = await listLibrary(USER, {
      sort: 'title',
      qualified: true,
      status: 'TO_SORT',
    })
    expect(entries.map((e) => e.game.title)).toEqual(['B'])
  })
})
```

Run: `npx vitest run test/filters.test.ts test/library-list.test.ts` → les 3 nouveaux FAIL (type + comportement).

- [ ] **Step 2 : Implémenter**

Dans `src/lib/filters.ts` :

1. Dans le type `LibraryFilters`, ajouter après `status?: EntryStatus` :

```ts
  qualified?: boolean // masque À trier et Collection (ignoré si status est présent)
```

2. Dans `parseFilters`, ajouter après la ligne `if (isEntryStatus(params.status)) ...` :

```ts
  if (params.qualified === '1') filters.qualified = true
```

Dans `src/lib/library.ts`, `listLibrary`, dans l'objet `where` du `findMany`, remplacer la ligne `...(filters.status && { status: filters.status }),` par :

```ts
      ...(filters.status
        ? { status: filters.status }
        : filters.qualified
          ? // « Qualifiés seulement » : masque la file de triage et la Collection
            { status: { notIn: ['TO_SORT', 'OWNED'] } }
          : {}),
```

- [ ] **Step 3 : Vérifier**

Run: `npx vitest run test/filters.test.ts test/library-list.test.ts` → PASS ; puis `npm test` (119 attendus) et `npx tsc --noEmit`.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/filters.ts src/lib/library.ts test/filters.test.ts test/library-list.test.ts
git commit -m "feat: filtre « qualifiés seulement » (masque À trier et Collection)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : Refonte de la barre de filtres

**Files:**
- Rewrite: `src/components/LibraryFilterBar.tsx`

**Interfaces:**
- Consumes: `LibraryFilters` (avec `qualified`, Task 1), `STATUS_OPTIONS`, `PLATFORMS`. Props inchangées : `{ filters, view }` — `src/app/jeux/page.tsx` n'a pas besoin de changer.
- Produces: navigation par `router.push('/jeux?…')` ; les paramètres d'URL restent exactement ceux que `parseFilters` connaît (`q`, `status`, `qualified`, `platform`, `genre`, `decade`, `minRating`, `minHours`, `sort`, plus `view`).

Pas de test de composant (convention du repo) : vérification lint + build + parcours navigateur.

- [ ] **Step 1 : Réécrire le composant**

Remplacer intégralement `src/components/LibraryFilterBar.tsx` :

```tsx
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
```

- [ ] **Step 2 : Lint, typecheck, build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected : propres. Puis `npm test` — la suite complète reste verte (le composant n'est pas testé, mais rien d'autre ne doit casser).

- [ ] **Step 3 : Vérification navigateur (smoke)**

Le dev server tourne peut-être déjà (`http://localhost:3000`) ; sinon `npm run dev` en arrière-plan, puis :

```bash
curl -s "http://localhost:3000/jeux" | grep -o "Qualifiés seulement" | head -1
curl -s "http://localhost:3000/jeux?qualified=1" | grep -c "À trier"
```

Expected : « Qualifiés seulement » présent ; la page `qualified=1` répond 200 (le grep de contrôle peut varier selon les données). Vérifier aussi qu'aucune erreur n'apparaît dans la sortie du serveur. Arrêter le serveur si vous l'avez lancé.

- [ ] **Step 4 : Commit**

```bash
git add src/components/LibraryFilterBar.tsx
git commit -m "feat: barre de filtres repensée (chips de statut, vue qualifiés, filtres avancés repliés)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
