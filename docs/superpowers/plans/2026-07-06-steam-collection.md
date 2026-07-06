# Statut « Collection » + temps Steam dans la liste — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les jeux Steam jamais lancés arrivent en statut « Collection » (hors des jeux joués, promus « À trier » s'ils sont lancés plus tard), et la liste « Tous les jeux » affiche/trie le temps Steam réel quand il n'y a pas d'heures estimées.

**Architecture:** Nouveau membre `OWNED` de l'enum `EntryStatus` (libellé « Collection »), backfill une-fois des entrées Steam « À trier » à 0 min, règle de promotion 0 → positif dans `attachSteamEntry`, et heures effectives (`estimatedHours` sinon temps Steam) calculées côté JS pour l'affichage, le tri et le filtre.

**Tech Stack:** Next.js 16, TypeScript, Prisma 6 + PostgreSQL 16, Vitest 4.

**Spec :** `docs/superpowers/specs/2026-07-05-nextplay-design.md` §4 (statut), §5.1 (colonne heures), §5.4 (règles d'import) — révisions du 2026-07-06.

## Global Constraints

- **Next.js 16 ≠ ta connaissance** : suis les patterns des fichiers existants ; en cas de doute lis `node_modules/next/dist/docs/`.
- **UI, messages et commentaires en français**, ton sobre expliquant le « pourquoi ».
- **Anti-duplication / fusion** : une fusion ne touche jamais statut/note/avis — à l'unique exception près de la promotion « Collection » → « À trier » sur transition 0 → positif du temps Steam.
- **Postgres/Prisma** : `ALTER TYPE ... ADD VALUE` ne peut pas être utilisé dans la même transaction que un `UPDATE` employant la nouvelle valeur → **deux dossiers de migration séparés** (chaque migration = une transaction). `prisma migrate dev` échoue en non-interactif : écrire les migrations à la main puis `npx prisma migrate deploy` (non-interactif) + `npx prisma generate`.
- **Tests** : Postgres lancé (`npm run db:up`), `npm run db:push:test` après l'évolution du schéma. Suite actuelle : 108 tests — doit rester verte.
- **Piège connu** : purger `.next` après migration Prisma.
- Fin de commit : `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (préfixes `feat:`/`fix:`, français).

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` (modif) | `OWNED` dans l'enum `EntryStatus` |
| `prisma/migrations/*_owned_status/` + `*_owned_backfill/` (créés) | Ajout de la valeur d'enum, puis reclassement une-fois |
| `src/lib/status.ts` (modif) | Libellé « Collection » |
| `src/components/StatusBadge.tsx` (modif) | Couleur du badge |
| `src/lib/import-steam.ts` (modif) | Statut à la création selon le temps ; promotion 0 → positif |
| `src/lib/library.ts` (modif) | `effectiveHours` + tri/filtre heures combinés |
| `src/app/jeux/page.tsx` (modif) | Colonne heures avec repli temps Steam |
| `test/import-steam.test.ts`, `test/library-list.test.ts`, `test/validate.test.ts` | Tests |

---

### Task 1 : Statut OWNED « Collection » (enum, libellé, badge, backfill)

**Files:**
- Modify: `prisma/schema.prisma` (enum `EntryStatus`)
- Create: `prisma/migrations/<timestamp>_owned_status/migration.sql`
- Create: `prisma/migrations/<timestamp+1s>_owned_backfill/migration.sql`
- Modify: `src/lib/status.ts:3-10`, `src/components/StatusBadge.tsx:4-11`
- Test: `test/validate.test.ts` (un test ajouté)

**Interfaces:**
- Produces: `EntryStatus.OWNED` utilisable partout (Prisma + `isEntryStatus` + `STATUS_LABELS.OWNED === 'Collection'` + badge). Les Tasks 2-3 en dépendent.

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `test/validate.test.ts`, ajouter dans le describe existant de `validatePersonal` :

```ts
  it('accepte le statut Collection (OWNED)', () => {
    const result = validatePersonal({ status: 'OWNED' })
    expect(result.ok).toBe(true)
  })
```

Run: `npx vitest run test/validate.test.ts` → FAIL (`Statut invalide.` → `result.ok` vaut `false`) tant que l'enum Prisma ne connaît pas `OWNED`.

- [ ] **Step 2 : Schéma + migrations à la main**

Dans `prisma/schema.prisma`, enum `EntryStatus`, ajouter entre `WISHLIST` et `TO_SORT` :

```prisma
  OWNED    // Collection : possédé mais ne compte pas dans les jeux joués
```

Créer `prisma/migrations/<timestamp>_owned_status/migration.sql` (timestamp au format des dossiers existants, ex. `20260706150000`) :

```sql
-- Statut « Collection » : possédé mais ne compte pas dans les jeux joués
-- (jeux Steam jamais lancés, non-jeux type bêta/démo requalifiés à la main).
ALTER TYPE "EntryStatus" ADD VALUE 'OWNED';
```

Créer `prisma/migrations/<timestamp+1s>_owned_backfill/migration.sql` (dossier SÉPARÉ : la nouvelle valeur d'enum n'est utilisable que dans une transaction ultérieure) :

```sql
-- Reclassement une-fois : les jeux importés de Steam encore « À trier »
-- avec 0 min de jeu sont des possessions jamais lancées → « Collection ».
-- Ce que l'utilisateur a déjà qualifié n'est pas touché.
UPDATE "LibraryEntry"
SET "status" = 'OWNED'
WHERE "source" = 'STEAM'
  AND "status" = 'TO_SORT'
  AND "steamPlaytimeMinutes" = 0;
```

Appliquer :

```bash
npx prisma migrate deploy
npx prisma generate
npm run db:push:test
rm -rf .next
```

Expected : les deux migrations s'appliquent ; `migrate status` propre.

- [ ] **Step 3 : Libellé et badge**

Dans `src/lib/status.ts`, ajouter entre `WISHLIST` et `TO_SORT` :

```ts
  OWNED: 'Collection',
```

Dans `src/components/StatusBadge.tsx`, ajouter au même endroit dans `COLORS` :

```ts
  OWNED: 'bg-indigo-950 text-indigo-300',
```

- [ ] **Step 4 : Vérifier**

Run: `npx vitest run test/validate.test.ts` → PASS, puis `npm test` → 109 tests PASS, puis `npx tsc --noEmit` → propre (les `Record<EntryStatus, ...>` de status.ts et StatusBadge exigent la nouvelle clé — c'est le filet de sécurité).

Contrôle du backfill sur la base de dev (données réelles de l'import d'aujourd'hui) :

```bash
docker exec nextplay-db-1 psql -U nextplay -d nextplay -c "SELECT status, COUNT(*) FROM \"LibraryEntry\" WHERE source = 'STEAM' GROUP BY status;"
```

Expected : des lignes `OWNED` sont apparues (les jeux 0 min), plus aucune entrée `TO_SORT` à 0 min.

- [ ] **Step 5 : Commit**

```bash
git add prisma/ src/lib/status.ts src/components/StatusBadge.tsx test/validate.test.ts
git commit -m "feat: statut Collection (OWNED) + reclassement des imports Steam jamais lancés

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : Import — Collection à 0 min, promotion 0 → positif

**Files:**
- Modify: `src/lib/import-steam.ts` (`attachSteamEntry`)
- Test: `test/import-steam.test.ts`

**Interfaces:**
- Consumes: `EntryStatus.OWNED` (Task 1) ; `attachSteamEntry` existant (création + fusion Math.max).
- Produces: comportement d'import — création : `status = playtimeMinutes > 0 ? 'TO_SORT' : 'OWNED'` ; fusion : promotion `OWNED → TO_SORT` uniquement si `(existing.steamPlaytimeMinutes ?? 0) === 0` ET `owned.playtimeMinutes > 0`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `test/import-steam.test.ts`, describe `runSteamImport`, ajouter :

```ts
  it('jeu possédé jamais lancé (0 min) → statut Collection', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 620, name: 'Portal 2', playtimeMinutes: 0 },
    ])
    vi.mocked(getGamesBySteamAppIds).mockResolvedValueOnce(new Map())
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({
      where: { game: { steamAppId: 620 } },
    })
    expect(entry?.status).toBe('OWNED')
  })

  it('relance : une entrée Collection qui gagne du temps de jeu est promue À trier', async () => {
    await configure()
    const owned = [{ appId: 620, name: 'Portal 2', playtimeMinutes: 0 }]
    vi.mocked(getOwnedGames).mockResolvedValue(owned)
    await runSteamImport(USER) // arrive en Collection (0 min)

    vi.mocked(getOwnedGames).mockResolvedValue([{ ...owned[0], playtimeMinutes: 90 }])
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({
      where: { game: { steamAppId: 620 } },
    })
    expect(entry?.status).toBe('TO_SORT')
    expect(entry?.steamPlaytimeMinutes).toBe(90)
  })

  it("une entrée requalifiée Collection À LA MAIN avec du temps n'est jamais re-promue", async () => {
    await configure()
    // Bêta jouée (500 min) puis rangée en Collection par l'utilisateur
    const game = await prisma.game.create({
      data: { title: 'Bêta quelconque', steamAppId: 777, platforms: [] },
    })
    await prisma.libraryEntry.create({
      data: {
        userId: USER,
        gameId: game.id,
        status: 'OWNED',
        source: 'STEAM',
        platformsPlayed: ['PC'],
        steamPlaytimeMinutes: 500,
      },
    })
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 777, name: 'Bêta quelconque', playtimeMinutes: 520 },
    ])
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({ where: { gameId: game.id } })
    expect(entry?.status).toBe('OWNED') // transition 0 → positif absente : intouché
    expect(entry?.steamPlaytimeMinutes).toBe(520)
  })

  it('une entrée déjà qualifiée (ex. FINISHED) reste intouchée par la promotion', async () => {
    await configure()
    const game = await prisma.game.create({
      data: { title: 'Hades', steamAppId: 1145360, platforms: [] },
    })
    await prisma.libraryEntry.create({
      data: {
        userId: USER,
        gameId: game.id,
        status: 'FINISHED',
        rating: 18,
        source: 'MANUAL',
        platformsPlayed: ['Switch'],
        steamPlaytimeMinutes: 0,
      },
    })
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
    ])
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({ where: { gameId: game.id } })
    expect(entry?.status).toBe('FINISHED') // seule OWNED est promue
    expect(entry?.rating).toBe(18)
  })
```

Run: `npx vitest run test/import-steam.test.ts` → les 4 nouveaux FAIL (statuts `TO_SORT`/inchangés), les 13 existants PASS.

- [ ] **Step 2 : Implémenter dans `attachSteamEntry`**

Dans `src/lib/import-steam.ts`, remplacer le corps de `attachSteamEntry` :

```ts
async function attachSteamEntry(
  userId: string,
  gameId: string,
  owned: OwnedGame,
): Promise<{ created: boolean }> {
  const existing = await prisma.libraryEntry.findUnique({
    where: { userId_gameId: { userId, gameId } },
  })
  if (existing) {
    // Promotion Collection → À trier : uniquement sur la transition 0 → positif
    // (le jeu a été lancé depuis l'import). Une entrée rangée en Collection
    // À LA MAIN avec du temps de jeu ne re-bascule jamais.
    const promote =
      existing.status === 'OWNED' &&
      (existing.steamPlaytimeMinutes ?? 0) === 0 &&
      owned.playtimeMinutes > 0
    await prisma.libraryEntry.update({
      where: { id: existing.id },
      data: {
        platformsPlayed: [...new Set([...existing.platformsPlayed, STEAM_PLATFORM])],
        // Le temps Steam ne diminue jamais (playtime_forever est monotone)
        steamPlaytimeMinutes: Math.max(
          existing.steamPlaytimeMinutes ?? 0,
          owned.playtimeMinutes,
        ),
        ...(promote && { status: 'TO_SORT' as const }),
      },
    })
    return { created: false }
  }
  await prisma.libraryEntry.create({
    data: {
      userId,
      gameId,
      // Jamais lancé (0 min) = possession → Collection ; sinon file « À trier »
      status: owned.playtimeMinutes > 0 ? 'TO_SORT' : 'OWNED',
      source: 'STEAM',
      platformsPlayed: [STEAM_PLATFORM],
      steamPlaytimeMinutes: owned.playtimeMinutes,
    },
  })
  return { created: true }
}
```

- [ ] **Step 3 : Vérifier**

Run: `npx vitest run test/import-steam.test.ts` → 17 PASS. Puis `npm test` (tout vert) et `npx tsc --noEmit`.

Attention : le test existant « import initial » attend `status: 'TO_SORT'` pour Hades (600 min) et le non-matché « Jeu Obscur » (30 min) — les deux ont du temps de jeu, ils restent « À trier » : aucun test existant à modifier.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/import-steam.ts test/import-steam.test.ts
git commit -m "feat: import Steam — 0 min → Collection, promotion À trier au premier lancement

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : Temps Steam dans « Tous les jeux » (affichage, tri, filtre)

**Files:**
- Modify: `src/lib/library.ts` (`listLibrary` + nouvel export `effectiveHours`)
- Modify: `src/app/jeux/page.tsx:83-85` (cellule heures)
- Test: `test/library-list.test.ts`

**Interfaces:**
- Consumes: `LibraryEntry.steamPlaytimeMinutes`, `listLibrary(userId, filters)` existant.
- Produces: `effectiveHours(entry: { estimatedHours: number | null; steamPlaytimeMinutes: number | null }): number | null` — heures estimées, sinon temps Steam arrondi en heures (`Math.round(m / 60)`), sinon `null`. Le tri `sort === 'hours'` et le filtre `minHours` utilisent cette valeur.

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `test/library-list.test.ts`, ajouter un describe (réutiliser les helpers de création du fichier — adapter les noms aux helpers existants si besoin, en conservant exactement les assertions) :

```ts
describe('heures effectives (estimées sinon Steam)', () => {
  it('trie par heures en combinant estimées et temps Steam', async () => {
    // A : 10 h estimées ; B : 20 h de Steam (1200 min) ; C : rien
    await createEntry({ title: 'A', estimatedHours: 10 })
    await createEntry({ title: 'B', steamPlaytimeMinutes: 1200 })
    await createEntry({ title: 'C' })
    const entries = await listLibrary(USER, { sort: 'hours' })
    expect(entries.map((e) => e.game.title)).toEqual(['B', 'A', 'C'])
  })

  it('filtre minHours en tenant compte du temps Steam', async () => {
    await createEntry({ title: 'A', estimatedHours: 10 })
    await createEntry({ title: 'B', steamPlaytimeMinutes: 1200 })
    await createEntry({ title: 'C', steamPlaytimeMinutes: 30 })
    const entries = await listLibrary(USER, { sort: 'recent', minHours: 5 })
    expect(entries.map((e) => e.game.title).sort()).toEqual(['A', 'B'])
  })
})
```

(Si le fichier n'a pas de helper `createEntry`, en écrire un local au describe qui crée `Game` + `LibraryEntry` minimales via `prisma`, statut `FINISHED`.)

Run: `npx vitest run test/library-list.test.ts` → les 2 nouveaux FAIL.

- [ ] **Step 2 : Implémenter dans `src/lib/library.ts`**

Ajouter l'export :

```ts
// Heures « effectives » d'une entrée : les heures estimées saisies à la main
// font foi ; à défaut, le temps Steam réel arrondi en heures.
export function effectiveHours(entry: {
  estimatedHours: number | null
  steamPlaytimeMinutes: number | null
}): number | null {
  if (entry.estimatedHours != null) return entry.estimatedHours
  if (entry.steamPlaytimeMinutes != null) return Math.round(entry.steamPlaytimeMinutes / 60)
  return null
}
```

Dans `listLibrary` :
1. Retirer la clause Prisma `minHours` (`estimatedHours: { gte: ... }`) et le `orderBy` du cas `hours` (garder `createdAt desc` comme orderBy Prisma pour ce cas — Prisma ne sait pas trier sur un coalesce de deux colonnes).
2. Après le `findMany`, appliquer en JS :

```ts
  let results = entries
  if (filters.minHours !== undefined)
    results = results.filter((e) => (effectiveHours(e) ?? -1) >= filters.minHours!)
  if (filters.sort === 'hours')
    results = [...results].sort(
      (a, b) => (effectiveHours(b) ?? -1) - (effectiveHours(a) ?? -1),
    )
  return results
```

(Adapter à la structure réelle de la fonction : la construction du `where` et de l'`orderBy` existants ne change pas pour les autres cas.)

- [ ] **Step 3 : Affichage dans `src/app/jeux/page.tsx`**

Remplacer la cellule heures (lignes 83-85) :

```tsx
                  <td className="p-2 text-zinc-400">
                    {entry.estimatedHours != null ? (
                      `≈ ${entry.estimatedHours} h`
                    ) : entry.steamPlaytimeMinutes != null ? (
                      <span title="Temps de jeu réel enregistré par Steam">
                        {entry.steamPlaytimeMinutes >= 60
                          ? `${Math.round(entry.steamPlaytimeMinutes / 60)} h`
                          : `${entry.steamPlaytimeMinutes} min`}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
```

- [ ] **Step 4 : Vérifier**

Run: `npx vitest run test/library-list.test.ts` → PASS ; `npm test` → tout vert ; `npx tsc --noEmit` ; `npm run lint && npm run build` → propres.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/library.ts src/app/jeux/page.tsx test/library-list.test.ts
git commit -m "feat: temps Steam dans la liste des jeux (affichage, tri et filtre heures combinés)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
