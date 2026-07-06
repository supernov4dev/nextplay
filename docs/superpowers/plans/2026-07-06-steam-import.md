# Import Steam + page Réglages — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importer la bibliothèque Steam de l'utilisateur (jeux possédés + temps de jeu réels) de façon idempotente et relançable, configurée depuis une nouvelle page Réglages.

**Architecture:** Un client Steam Web API minimal (`GetOwnedGames`), un matching Steam → IGDB par lots via l'endpoint `external_games`, une orchestration d'import qui s'appuie sur la règle anti-duplication existante (fusion des plateformes, vécu intact), et une page Réglages « Sources d'import » extensible. Les identifiants Steam (clé + SteamID64) vivent en base dans le nouveau modèle `ImportSource` — décision validée le 2026-07-06.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Prisma 6 + PostgreSQL 16, Tailwind 4, Vitest 4.

**Spec :** `docs/superpowers/specs/2026-07-05-nextplay-design.md` §5.4 (+ §4 modèle `ImportSource`).

## Global Constraints

- **Next.js 16 ≠ ta connaissance** : conventions possiblement différentes ; suis les patterns des fichiers existants du repo, et en cas de doute lis `node_modules/next/dist/docs/` (consigne AGENTS.md).
- **UI et messages d'erreur en français** ; commentaires de code en français, même ton que l'existant (sobres, expliquent le « pourquoi »).
- **Zéro dépense API** : Steam Web API et IGDB sont gratuits ; ne jamais introduire d'appel payant.
- **Anti-duplication** (règle centrale du spec) : jamais deux `Game` pour un même jeu, jamais deux `LibraryEntry` par utilisateur et par jeu ; une fusion ne touche jamais statut/note/avis existants.
- **Limite IGDB 4 req/s** : espacer les lots de requêtes.
- **Tests** : Postgres de test lancé via `npm run db:up` ; après toute évolution du schéma, `npm run db:push:test`. La suite existante (74 tests) doit rester verte à chaque tâche.
- **Piège connu** : après une migration Prisma, purger `.next` avant de relancer le dev server (cache Turbopack — cf. README).
- Mono-utilisateur v1 : toujours `DEFAULT_USER_ID` de `src/lib/user.ts`.
- Fin de message de commit : `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (convention des commits existants : préfixes `feat:`/`fix:`/`docs:`, description en français).

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma` (modif) | Modèle `ImportSource`, `Game.steamAppId`, `LibraryEntry.steamPlaytimeMinutes` |
| `src/lib/steam.ts` (créé) | Client Steam Web API : `getOwnedGames` + erreurs typées |
| `src/lib/igdb.ts` (modif) | `getGamesBySteamAppIds` (matching par lots via `external_games`) |
| `src/lib/import-steam.ts` (créé) | Config Steam (lecture/écriture) + orchestration `runSteamImport` + `testSteamConnection` + mapping d'erreurs HTTP |
| `src/app/api/settings/steam/route.ts` (créé) | GET (config sans la clé) / PUT (enregistrer) |
| `src/app/api/import/steam/route.ts` (créé) | POST : lance l'import, renvoie le rapport |
| `src/app/api/import/steam/test/route.ts` (créé) | POST : teste la connexion (nombre de jeux) |
| `src/app/reglages/page.tsx` (créé) | Page Réglages, section « Sources d'import » |
| `src/components/SteamImportCard.tsx` (créé) | Carte Steam : formulaire, tester, importer, rapport |
| `src/app/layout.tsx` (modif) | Entrée « Réglages » dans la navigation |
| `src/app/jeux/[entryId]/page.tsx` (modif) | Affichage du temps de jeu Steam sur la fiche |
| `test/steam.test.ts`, `test/igdb.test.ts`, `test/import-steam.test.ts`, `test/api-import-steam.test.ts` | Tests |

---

### Task 1 : Schéma Prisma (ImportSource + ancres Steam)

**Files:**
- Modify: `prisma/schema.prisma`
- Test: aucun nouveau (le schéma est exercé par les tâches suivantes) — la suite existante doit rester verte.

**Interfaces:**
- Produces: modèle `ImportSource` (`userId`, `provider: ImportProvider` [`STEAM`], `apiKey: String`, `accountId: String`, `lastImportAt: DateTime?`, unique `[userId, provider]`), `Game.steamAppId: Int? @unique`, `LibraryEntry.steamPlaytimeMinutes: Int?`. Accès Prisma : `prisma.importSource.findUnique({ where: { userId_provider: { userId, provider } } })`.

- [ ] **Step 1 : Ajouter les champs et le modèle au schéma**

Dans `prisma/schema.prisma` :

1. Dans `model User`, ajouter la relation après `entries` :

```prisma
  importSources ImportSource[]
```

2. Dans `model Game`, ajouter après `igdbId` :

```prisma
  steamAppId  Int?           @unique // ancre d'idempotence de l'import Steam
```

3. Dans `model LibraryEntry`, ajouter après `estimatedHours` :

```prisma
  steamPlaytimeMinutes Int? // temps de jeu Steam réel — jamais saisi à la main, jamais fusionné avec estimatedHours
```

4. En fin de fichier, ajouter :

```prisma
enum ImportProvider {
  STEAM
}

// Configuration d'une source d'import, saisie dans la page Réglages.
// App solo auto-hébergée : les identifiants vivent en base (Postgres privé),
// pas en variable d'environnement (décision spec du 2026-07-06).
model ImportSource {
  id           String         @id @default(cuid())
  userId       String
  provider     ImportProvider
  apiKey       String
  accountId    String // SteamID64 pour Steam
  lastImportAt DateTime?
  user         User           @relation(fields: [userId], references: [id])

  @@unique([userId, provider])
}
```

- [ ] **Step 2 : Migrer la base de dev et la base de test**

```bash
npm run db:up
npx prisma migrate dev --name steam_import
npm run db:push:test
```

Expected: migration créée dans `prisma/migrations/*_steam_import/`, client Prisma régénéré sans erreur.

- [ ] **Step 3 : Vérifier que la suite existante reste verte**

Run: `npm test`
Expected: 74 tests PASS (aucune régression — les champs ajoutés sont optionnels).

- [ ] **Step 4 : Purger le cache Turbopack (piège connu du repo)**

```bash
rm -rf .next
```

- [ ] **Step 5 : Commit**

```bash
git add prisma/
git commit -m "feat: modèle ImportSource + ancres Steam (steamAppId, steamPlaytimeMinutes)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2 : Client Steam Web API (`src/lib/steam.ts`)

**Files:**
- Create: `src/lib/steam.ts`
- Test: `test/steam.test.ts`

**Interfaces:**
- Produces:
  - `type OwnedGame = { appId: number; name: string; playtimeMinutes: number }`
  - `getOwnedGames(apiKey: string, steamId64: string): Promise<OwnedGame[]>`
  - `class SteamAuthError extends Error` (clé refusée)
  - `class SteamPrivateProfileError extends Error` (profil privé / SteamID inconnu)

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `test/steam.test.ts` :

```ts
import { describe, it, expect, vi } from 'vitest'
import {
  getOwnedGames,
  SteamAuthError,
  SteamPrivateProfileError,
} from '@/lib/steam'

const OWNED_RESPONSE = {
  response: {
    game_count: 2,
    games: [
      { appid: 1091500, name: 'Cyberpunk 2077', playtime_forever: 3120 },
      { appid: 620, name: 'Portal 2', playtime_forever: 0 },
    ],
  },
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('getOwnedGames', () => {
  it('mappe la réponse Steam vers OwnedGame[]', async () => {
    const fetchMock = mockFetch(OWNED_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)
    const games = await getOwnedGames('cle-api', '76561198000000000')
    expect(games).toEqual([
      { appId: 1091500, name: 'Cyberpunk 2077', playtimeMinutes: 3120 },
      { appId: 620, name: 'Portal 2', playtimeMinutes: 0 },
    ])
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('GetOwnedGames')
    expect(url).toContain('key=cle-api')
    expect(url).toContain('steamid=76561198000000000')
    expect(url).toContain('include_appinfo=1')
  })

  it('tolère un nom absent (nom de repli avec appid)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ response: { game_count: 1, games: [{ appid: 42, playtime_forever: 5 }] } }),
    )
    const [game] = await getOwnedGames('k', 's')
    expect(game.name).toBe('App Steam 42')
  })

  it('bibliothèque vide → tableau vide (pas une erreur)', async () => {
    vi.stubGlobal('fetch', mockFetch({ response: { game_count: 0, games: [] } }))
    expect(await getOwnedGames('k', 's')).toEqual([])
  })

  it('réponse sans liste de jeux → SteamPrivateProfileError (profil privé)', async () => {
    // Steam renvoie {"response":{}} pour un profil privé — sans erreur HTTP.
    vi.stubGlobal('fetch', mockFetch({ response: {} }))
    await expect(getOwnedGames('k', 's')).rejects.toThrow(SteamPrivateProfileError)
  })

  it('HTTP 403 → SteamAuthError', async () => {
    vi.stubGlobal('fetch', mockFetch('Forbidden', 403))
    await expect(getOwnedGames('mauvaise-cle', 's')).rejects.toThrow(SteamAuthError)
  })

  it('HTTP 500 → erreur générique', async () => {
    vi.stubGlobal('fetch', mockFetch('oops', 500))
    await expect(getOwnedGames('k', 's')).rejects.toThrow(/HTTP 500/)
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `npx vitest run test/steam.test.ts`
Expected: FAIL — `Cannot find module '@/lib/steam'` (ou équivalent).

- [ ] **Step 3 : Implémenter le client**

Créer `src/lib/steam.ts` :

```ts
// Client Steam Web API — uniquement GetOwnedGames (import de la bibliothèque).
// API officielle et gratuite : https://steamcommunity.com/dev/apikey

export type OwnedGame = {
  appId: number
  name: string
  playtimeMinutes: number
}

// Clé refusée par Steam (HTTP 401/403) — message actionnable côté UI.
export class SteamAuthError extends Error {
  constructor() {
    super('Clé Steam Web API refusée — vérifiez-la sur steamcommunity.com/dev/apikey.')
  }
}

// Un profil privé (ou un SteamID inconnu) ne provoque PAS d'erreur HTTP :
// Steam renvoie simplement une réponse sans liste de jeux. On le signale
// clairement plutôt que d'annoncer « 0 jeu importé ».
export class SteamPrivateProfileError extends Error {
  constructor() {
    super(
      "Steam n'a renvoyé aucun jeu : profil privé ou SteamID64 incorrect. " +
        "Mettez votre profil en public (Confidentialité → Détails de jeu) le temps de l'import.",
    )
  }
}

const OWNED_GAMES_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/'

type RawOwnedGames = {
  response?: {
    game_count?: number
    games?: { appid: number; name?: string; playtime_forever?: number }[]
  }
}

export async function getOwnedGames(
  apiKey: string,
  steamId64: string,
): Promise<OwnedGame[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId64,
    include_appinfo: '1',
    include_played_free_games: '1',
    format: 'json',
  })
  const res = await fetch(`${OWNED_GAMES_URL}?${params}`)
  if (res.status === 401 || res.status === 403) throw new SteamAuthError()
  if (!res.ok) throw new Error(`Steam a répondu HTTP ${res.status}`)
  const data = (await res.json()) as RawOwnedGames
  const games = data.response?.games
  if (!games) throw new SteamPrivateProfileError()
  return games.map((g) => ({
    appId: g.appid,
    name: g.name ?? `App Steam ${g.appid}`,
    playtimeMinutes: g.playtime_forever ?? 0,
  }))
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `npx vitest run test/steam.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/steam.ts test/steam.test.ts
git commit -m "feat: client Steam Web API (GetOwnedGames, erreurs clé/profil privé typées)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3 : Matching Steam → IGDB (`getGamesBySteamAppIds`)

**Files:**
- Modify: `src/lib/igdb.ts`
- Test: `test/igdb.test.ts` (nouveau bloc `describe` en fin de fichier)

**Interfaces:**
- Consumes: `igdbQuery`, `toIgdbGame`, `GAME_FIELDS`, `getAccessToken` existants dans `src/lib/igdb.ts`.
- Produces: `getGamesBySteamAppIds(appIds: number[]): Promise<Map<number, IgdbGame>>` — clé = appid Steam ; les appids non référencés par IGDB sont simplement absents de la Map.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter en fin de `test/igdb.test.ts` (après le bloc `getGameById`) :

```ts
describe('getGamesBySteamAppIds', () => {
  function mockMatchFetch(links: unknown[], games: unknown[]) {
    return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      void init
      const u = String(url)
      if (u.includes('id.twitch.tv'))
        return new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 })
      if (u.includes('/external_games'))
        return new Response(JSON.stringify(links), { status: 200 })
      return new Response(JSON.stringify(games), { status: 200 })
    })
  }

  it('mappe appid Steam → jeu IGDB via external_games', async () => {
    const fetchMock = mockMatchFetch(
      [{ id: 555, uid: '1091500', game: 1942 }],
      [RAW_GAME],
    )
    vi.stubGlobal('fetch', fetchMock)
    const { getGamesBySteamAppIds } = await import('@/lib/igdb')
    const result = await getGamesBySteamAppIds([1091500, 999])
    expect(result.get(1091500)?.title).toBe('The Witcher 3: Wild Hunt')
    expect(result.has(999)).toBe(false) // non référencé par IGDB → absent
    const extBody = String(
      fetchMock.mock.calls.find(([u]) => String(u).includes('/external_games'))?.[1]?.body,
    )
    expect(extBody).toContain('where uid = ("1091500","999") & external_game_source = 1')
    const gamesBody = String(
      fetchMock.mock.calls.find(([u]) => String(u).includes('/games'))?.[1]?.body,
    )
    expect(gamesBody).toContain('where id = (1942)')
  })

  it('aucun lien trouvé → Map vide, sans requête /games', async () => {
    const fetchMock = mockMatchFetch([], [])
    vi.stubGlobal('fetch', fetchMock)
    const { getGamesBySteamAppIds } = await import('@/lib/igdb')
    const result = await getGamesBySteamAppIds([111, 222])
    expect(result.size).toBe(0)
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/games'))).toBe(false)
  })

  it('liste vide → Map vide sans aucune requête', async () => {
    const fetchMock = mockMatchFetch([], [])
    vi.stubGlobal('fetch', fetchMock)
    const { getGamesBySteamAppIds } = await import('@/lib/igdb')
    expect((await getGamesBySteamAppIds([])).size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('découpe en lots de 100 appids', async () => {
    const fetchMock = mockMatchFetch([], [])
    vi.stubGlobal('fetch', fetchMock)
    const { getGamesBySteamAppIds } = await import('@/lib/igdb')
    const ids = Array.from({ length: 150 }, (_, i) => i + 1)
    await getGamesBySteamAppIds(ids)
    const extCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('/external_games'),
    )
    expect(extCalls).toHaveLength(2)
  }, 10_000) // un lot au-delà du premier attend 600 ms (limite IGDB 4 req/s)
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `npx vitest run test/igdb.test.ts`
Expected: FAIL — `getGamesBySteamAppIds` n'existe pas ; les tests existants restent PASS.

- [ ] **Step 3 : Implémenter le matching**

Dans `src/lib/igdb.ts` :

1. Généraliser la requête : remplacer la fonction `igdbQuery` existante par :

```ts
async function igdbRequest<T>(path: string, body: string): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID ?? '',
      Authorization: `Bearer ${token}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`IGDB a répondu HTTP ${res.status}`)
  return (await res.json()) as T
}

async function igdbQuery(body: string): Promise<RawGame[]> {
  return igdbRequest<RawGame[]>('games', body)
}
```

2. Ajouter en fin de fichier :

```ts
// Matching de l'import Steam : appids → jeux IGDB, via l'endpoint
// external_games (source 1 = Steam). Par lots, pour tenir dans une seule
// requête IGDB et respecter la limite de 4 req/s entre les lots.
const STEAM_SOURCE = 1
const MATCH_CHUNK_SIZE = 100

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getGamesBySteamAppIds(
  appIds: number[],
): Promise<Map<number, IgdbGame>> {
  const result = new Map<number, IgdbGame>()
  for (let i = 0; i < appIds.length; i += MATCH_CHUNK_SIZE) {
    if (i > 0) await sleep(600) // 2 requêtes par lot → reste sous 4 req/s
    const chunk = appIds.slice(i, i + MATCH_CHUNK_SIZE)
    const uids = chunk.map((id) => `"${id}"`).join(',')
    const links = await igdbRequest<{ uid: string; game: number }[]>(
      'external_games',
      `fields uid, game; where uid = (${uids}) & external_game_source = ${STEAM_SOURCE}; limit 500;`,
    )
    if (links.length === 0) continue
    const gameIds = [...new Set(links.map((l) => l.game))]
    const raw = await igdbQuery(
      `where id = (${gameIds.join(',')}); ${GAME_FIELDS} limit 500;`,
    )
    const byId = new Map(raw.map((r) => [r.id, toIgdbGame(r)]))
    for (const link of links) {
      const game = byId.get(link.game)
      const appId = Number(link.uid)
      if (game && !result.has(appId)) result.set(appId, game)
    }
  }
  return result
}
```

Note : le repo utilise déjà le vocabulaire IGDB post-2024 (`game_type`) ; `external_game_source` est l'équivalent moderne de l'ancien champ `category` sur `external_games`. Si IGDB répondait HTTP 400 sur ce champ lors de la vérification réelle (Task 8), remplacer par `category = ${STEAM_SOURCE}` — même sémantique.

- [ ] **Step 4 : Vérifier que tous les tests igdb passent**

Run: `npx vitest run test/igdb.test.ts`
Expected: PASS (anciens + 4 nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/igdb.ts test/igdb.test.ts
git commit -m "feat: matching Steam → IGDB par lots via external_games

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4 : Config Steam — lecture/écriture (`src/lib/import-steam.ts`)

**Files:**
- Create: `src/lib/import-steam.ts`
- Test: `test/import-steam.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/prisma`), modèle `ImportSource` (Task 1).
- Produces:
  - `type SteamConfigView = { configured: boolean; accountId: string | null; lastImportAt: Date | null }`
  - `getSteamConfig(userId: string): Promise<SteamConfigView>` — ne renvoie JAMAIS la clé.
  - `saveSteamConfig(userId: string, input: { apiKey?: unknown; accountId: unknown }): Promise<{ ok: true } | { ok: false; error: string }>` — `apiKey` optionnelle si déjà configurée (l'UI ne renvoie jamais la clé stockée).

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `test/import-steam.test.ts` :

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/steam', () => ({
  getOwnedGames: vi.fn(async () => []),
  SteamAuthError: class SteamAuthError extends Error {},
  SteamPrivateProfileError: class SteamPrivateProfileError extends Error {},
}))
vi.mock('@/lib/igdb', () => ({
  getGamesBySteamAppIds: vi.fn(async () => new Map()),
}))

import { getSteamConfig, saveSteamConfig } from '@/lib/import-steam'

const USER = 'default-user'
const STEAM_ID = '76561198000000001'

beforeEach(async () => {
  await prisma.importSource.deleteMany()
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
})

describe('getSteamConfig / saveSteamConfig', () => {
  it('non configuré → configured=false', async () => {
    expect(await getSteamConfig(USER)).toEqual({
      configured: false,
      accountId: null,
      lastImportAt: null,
    })
  })

  it('enregistre puis relit la config (sans exposer la clé)', async () => {
    const saved = await saveSteamConfig(USER, { apiKey: 'ma-cle', accountId: STEAM_ID })
    expect(saved).toEqual({ ok: true })
    const config = await getSteamConfig(USER)
    expect(config.configured).toBe(true)
    expect(config.accountId).toBe(STEAM_ID)
    expect(config).not.toHaveProperty('apiKey')
  })

  it('SteamID64 invalide → erreur en français', async () => {
    const result = await saveSteamConfig(USER, { apiKey: 'k', accountId: '1234' })
    expect(result).toEqual({ ok: false, error: 'Le SteamID64 doit comporter 17 chiffres.' })
  })

  it('clé absente à la première configuration → erreur', async () => {
    const result = await saveSteamConfig(USER, { accountId: STEAM_ID })
    expect(result).toEqual({ ok: false, error: 'La clé Web API est requise.' })
  })

  it('mise à jour sans clé → conserve la clé existante', async () => {
    await saveSteamConfig(USER, { apiKey: 'ma-cle', accountId: STEAM_ID })
    const other = '76561198000000002'
    const result = await saveSteamConfig(USER, { accountId: other })
    expect(result).toEqual({ ok: true })
    const row = await prisma.importSource.findUnique({
      where: { userId_provider: { userId: USER, provider: 'STEAM' } },
    })
    expect(row?.apiKey).toBe('ma-cle')
    expect(row?.accountId).toBe(other)
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `npx vitest run test/import-steam.test.ts`
Expected: FAIL — `Cannot find module '@/lib/import-steam'`.

- [ ] **Step 3 : Implémenter la config**

Créer `src/lib/import-steam.ts` :

```ts
// Import Steam : configuration (page Réglages) et orchestration.
// La clé Web API vit en base (app solo auto-hébergée) et ne quitte jamais
// le serveur : getSteamConfig n'expose que l'état, jamais la clé.

import { prisma } from '@/lib/prisma'

export type SteamConfigView = {
  configured: boolean
  accountId: string | null
  lastImportAt: Date | null
}

async function findSource(userId: string) {
  return prisma.importSource.findUnique({
    where: { userId_provider: { userId, provider: 'STEAM' } },
  })
}

export async function getSteamConfig(userId: string): Promise<SteamConfigView> {
  const source = await findSource(userId)
  return {
    configured: source !== null,
    accountId: source?.accountId ?? null,
    lastImportAt: source?.lastImportAt ?? null,
  }
}

const STEAM_ID64_RE = /^\d{17}$/

export async function saveSteamConfig(
  userId: string,
  input: { apiKey?: unknown; accountId: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : ''
  if (!STEAM_ID64_RE.test(accountId))
    return { ok: false, error: 'Le SteamID64 doit comporter 17 chiffres.' }
  const newKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  const existing = await findSource(userId)
  // Clé absente = on conserve l'existante (l'UI ne renvoie jamais la clé stockée)
  const apiKey = newKey || existing?.apiKey
  if (!apiKey) return { ok: false, error: 'La clé Web API est requise.' }
  await prisma.importSource.upsert({
    where: { userId_provider: { userId, provider: 'STEAM' } },
    update: { apiKey, accountId },
    create: { userId, provider: 'STEAM', apiKey, accountId },
  })
  return { ok: true }
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `npx vitest run test/import-steam.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/import-steam.ts test/import-steam.test.ts
git commit -m "feat: configuration Steam en base (clé jamais exposée, SteamID64 validé)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5 : Orchestration de l'import (`runSteamImport`)

**Files:**
- Modify: `src/lib/import-steam.ts`
- Test: `test/import-steam.test.ts` (nouveaux blocs `describe`)

**Interfaces:**
- Consumes: `getOwnedGames`, `SteamAuthError`, `SteamPrivateProfileError`, `type OwnedGame` (`@/lib/steam`) ; `getGamesBySteamAppIds` (`@/lib/igdb`) ; modèles Prisma (Task 1).
- Produces:
  - `type ImportReport = { total: number; added: number; updated: number; unmatched: number; unmatchedTitles: string[] }`
  - `runSteamImport(userId: string): Promise<ImportReport>`
  - `testSteamConnection(userId: string): Promise<number>` (nombre de jeux possédés)
  - `class SteamNotConfiguredError extends Error`
  - `steamErrorToHttp(err: unknown): { status: number; error: string }` — 400 pour config/clé/profil (l'utilisateur peut corriger), 502 sinon.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter en fin de `test/import-steam.test.ts` :

```ts
import { getOwnedGames } from '@/lib/steam'
import { getGamesBySteamAppIds } from '@/lib/igdb'
import type { IgdbGame } from '@/lib/igdb'
import {
  runSteamImport,
  testSteamConnection,
  SteamNotConfiguredError,
} from '@/lib/import-steam'

const HADES: IgdbGame = {
  igdbId: 113112,
  title: 'Hades',
  coverUrl: null,
  releaseYear: 2020,
  summary: 'A rogue-lite.',
  genres: ['RPG'],
  themes: [],
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
  igdbRating: 92,
  gameType: 'Jeu principal',
}

async function configure() {
  await saveSteamConfig(USER, { apiKey: 'k', accountId: STEAM_ID })
}

describe('runSteamImport', () => {
  it('sans configuration → SteamNotConfiguredError', async () => {
    await expect(runSteamImport(USER)).rejects.toThrow(SteamNotConfiguredError)
  })

  it('import initial : matché → entrée À trier ; non-matché → fiche manuelle', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
      { appId: 999999, name: 'Jeu Obscur', playtimeMinutes: 30 },
    ])
    vi.mocked(getGamesBySteamAppIds).mockResolvedValueOnce(new Map([[1145360, HADES]]))

    const report = await runSteamImport(USER)
    expect(report).toEqual({
      total: 2,
      added: 2,
      updated: 0,
      unmatched: 1,
      unmatchedTitles: ['Jeu Obscur'],
    })

    const hades = await prisma.game.findUnique({
      where: { igdbId: 113112 },
      include: { entries: true },
    })
    expect(hades?.steamAppId).toBe(1145360)
    expect(hades?.entries[0]).toMatchObject({
      status: 'TO_SORT',
      source: 'STEAM',
      platformsPlayed: ['PC'],
      steamPlaytimeMinutes: 600,
    })

    const obscur = await prisma.game.findUnique({ where: { steamAppId: 999999 } })
    expect(obscur?.igdbId).toBeNull() // fiche manuelle, résolution au fil de l'eau
    expect(obscur?.title).toBe('Jeu Obscur')
  })

  it('relance → aucun doublon, temps de jeu rafraîchis (idempotence)', async () => {
    await configure()
    const owned = [
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
      { appId: 999999, name: 'Jeu Obscur', playtimeMinutes: 30 },
    ]
    vi.mocked(getOwnedGames).mockResolvedValue(owned)
    vi.mocked(getGamesBySteamAppIds).mockResolvedValue(new Map([[1145360, HADES]]))
    await runSteamImport(USER)

    // Relance avec temps de jeu qui ont bougé
    vi.mocked(getOwnedGames).mockResolvedValue([
      { ...owned[0], playtimeMinutes: 700 },
      owned[1],
    ])
    const report = await runSteamImport(USER)
    expect(report.added).toBe(0)
    expect(report.updated).toBe(2)
    expect(report.unmatched).toBe(0)
    expect(await prisma.game.count()).toBe(2)
    expect(await prisma.libraryEntry.count()).toBe(2)
    const entry = await prisma.libraryEntry.findFirst({
      where: { game: { steamAppId: 1145360 } },
    })
    expect(entry?.steamPlaytimeMinutes).toBe(700)
    // La relance ne repasse pas par IGDB : tout est ancré par steamAppId
    expect(vi.mocked(getGamesBySteamAppIds).mock.lastCall?.[0]).toEqual([])
  })

  it('jeu déjà en bibliothèque (ajout manuel) → fusion, vécu intact', async () => {
    await configure()
    // Hades noté sur Switch, ajouté à la main hier
    const game = await prisma.game.create({
      data: { igdbId: 113112, title: 'Hades', platforms: HADES.platforms },
    })
    await prisma.libraryEntry.create({
      data: {
        userId: USER,
        gameId: game.id,
        status: 'FINISHED',
        rating: 18,
        review: 'Chef-d’œuvre.',
        platformsPlayed: ['Switch'],
      },
    })
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
    ])
    vi.mocked(getGamesBySteamAppIds).mockResolvedValueOnce(new Map([[1145360, HADES]]))

    const report = await runSteamImport(USER)
    expect(report).toMatchObject({ added: 0, updated: 1, unmatched: 0 })
    const entry = await prisma.libraryEntry.findFirst({ where: { gameId: game.id } })
    expect(entry).toMatchObject({
      status: 'FINISHED', // intact
      rating: 18, // intact
      review: 'Chef-d’œuvre.', // intact
      platformsPlayed: ['Switch', 'PC'], // fusion
      steamPlaytimeMinutes: 600,
    })
    expect(await prisma.libraryEntry.count()).toBe(1) // pas de doublon
  })

  it('met à jour lastImportAt', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([])
    // Bibliothèque Steam vide : rapport à zéro, mais l'import a bien eu lieu
    const report = await runSteamImport(USER)
    expect(report.total).toBe(0)
    const config = await getSteamConfig(USER)
    expect(config.lastImportAt).not.toBeNull()
  })
})

describe('testSteamConnection', () => {
  it('renvoie le nombre de jeux possédés', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1, name: 'A', playtimeMinutes: 0 },
      { appId: 2, name: 'B', playtimeMinutes: 0 },
    ])
    expect(await testSteamConnection(USER)).toBe(2)
  })

  it('sans configuration → SteamNotConfiguredError', async () => {
    await expect(testSteamConnection(USER)).rejects.toThrow(SteamNotConfiguredError)
  })
})
```

Note : le `vi.mock('@/lib/steam', ...)` posé en Task 4 doit maintenant exposer `getOwnedGames` en `vi.fn()` réassignable — c'est déjà le cas. Les `mockResolvedValue` sont réinitialisés par test via `mockResolvedValueOnce` ou réécrasés ; ajouter `vi.mocked(getOwnedGames).mockReset()` et `vi.mocked(getGamesBySteamAppIds).mockReset().mockResolvedValue(new Map())` dans le `beforeEach` existant.

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `npx vitest run test/import-steam.test.ts`
Expected: FAIL — `runSteamImport` n'existe pas ; les 5 tests de config restent PASS.

- [ ] **Step 3 : Implémenter l'orchestration**

Dans `src/lib/import-steam.ts`, ajouter les imports en tête de fichier (sous l'import de `prisma`) :

```ts
import {
  getOwnedGames,
  SteamAuthError,
  SteamPrivateProfileError,
  type OwnedGame,
} from '@/lib/steam'
import { getGamesBySteamAppIds } from '@/lib/igdb'
```

Puis ajouter en fin de fichier :

```ts
export class SteamNotConfiguredError extends Error {
  constructor() {
    super("Steam n'est pas configuré — renseignez la clé Web API et le SteamID64.")
  }
}

export type ImportReport = {
  total: number // jeux possédés sur Steam
  added: number // nouvelles entrées créées
  updated: number // entrées existantes rafraîchies (fusion / temps de jeu)
  unmatched: number // fiches manuelles créées (introuvables sur IGDB)
  unmatchedTitles: string[] // pour affichage dans le rapport (plafonné)
}

const UNMATCHED_TITLES_MAX = 50

// Le vocabulaire fermé (src/lib/platforms.ts) désigne Steam par « PC ».
const STEAM_PLATFORM = 'PC'

// Crée l'entrée « à trier » ou fusionne avec l'entrée existante — même
// règle anti-duplication que upsertEntry (library.ts) : le vécu existant
// (statut, note, avis) fait foi, on n'y touche jamais.
async function attachSteamEntry(
  userId: string,
  gameId: string,
  owned: OwnedGame,
): Promise<{ created: boolean }> {
  const existing = await prisma.libraryEntry.findUnique({
    where: { userId_gameId: { userId, gameId } },
  })
  if (existing) {
    await prisma.libraryEntry.update({
      where: { id: existing.id },
      data: {
        platformsPlayed: [...new Set([...existing.platformsPlayed, STEAM_PLATFORM])],
        steamPlaytimeMinutes: owned.playtimeMinutes,
      },
    })
    return { created: false }
  }
  await prisma.libraryEntry.create({
    data: {
      userId,
      gameId,
      status: 'TO_SORT',
      source: 'STEAM',
      platformsPlayed: [STEAM_PLATFORM],
      steamPlaytimeMinutes: owned.playtimeMinutes,
    },
  })
  return { created: true }
}

export async function runSteamImport(userId: string): Promise<ImportReport> {
  const source = await findSource(userId)
  if (!source) throw new SteamNotConfiguredError()
  const owned = await getOwnedGames(source.apiKey, source.accountId)

  const report: ImportReport = {
    total: owned.length,
    added: 0,
    updated: 0,
    unmatched: 0,
    unmatchedTitles: [],
  }

  // 1. Fiches déjà ancrées par steamAppId (imports précédents, y compris les
  //    fiches manuelles créées par un import) → simple rafraîchissement,
  //    sans repasser par IGDB.
  const known = new Map(
    (
      await prisma.game.findMany({
        where: { steamAppId: { in: owned.map((g) => g.appId) } },
        select: { id: true, steamAppId: true },
      })
    ).map((g) => [g.steamAppId as number, g.id]),
  )

  const toMatch: OwnedGame[] = []
  for (const ownedGame of owned) {
    const gameId = known.get(ownedGame.appId)
    if (!gameId) {
      toMatch.push(ownedGame)
      continue
    }
    const { created } = await attachSteamEntry(userId, gameId, ownedGame)
    if (created) report.added++
    else report.updated++
  }

  // 2. Matching IGDB par lots pour les inconnus.
  const matched = await getGamesBySteamAppIds(toMatch.map((g) => g.appId))
  for (const ownedGame of toMatch) {
    const igdb = matched.get(ownedGame.appId)
    if (igdb) {
      // Le jeu peut déjà exister via son igdbId (ajouté à la main) : on y
      // accroche alors le steamAppId — règle anti-duplication.
      const game = await prisma.game.upsert({
        where: { igdbId: igdb.igdbId },
        update: { steamAppId: ownedGame.appId },
        create: {
          igdbId: igdb.igdbId,
          steamAppId: ownedGame.appId,
          title: igdb.title,
          coverUrl: igdb.coverUrl,
          releaseYear: igdb.releaseYear,
          // Résumé en anglais : le batch `npm run translate:fr` rattrapera.
          summary: igdb.summary,
          genres: igdb.genres,
          themes: igdb.themes,
          platforms: igdb.platforms,
          igdbRating: igdb.igdbRating,
        },
      })
      const { created } = await attachSteamEntry(userId, game.id, ownedGame)
      if (created) report.added++
      else report.updated++
    } else {
      // Introuvable sur IGDB → fiche manuelle « à trier », à résoudre ou
      // ignorer au fil de l'eau (jeux de bundles jamais lancés, outils…).
      const game = await prisma.game.create({
        data: {
          title: ownedGame.name,
          steamAppId: ownedGame.appId,
          platforms: ['PC (Microsoft Windows)'],
        },
      })
      await attachSteamEntry(userId, game.id, ownedGame)
      report.added++
      report.unmatched++
      if (report.unmatchedTitles.length < UNMATCHED_TITLES_MAX)
        report.unmatchedTitles.push(ownedGame.name)
    }
  }

  await prisma.importSource.update({
    where: { id: source.id },
    data: { lastImportAt: new Date() },
  })
  return report
}

export async function testSteamConnection(userId: string): Promise<number> {
  const source = await findSource(userId)
  if (!source) throw new SteamNotConfiguredError()
  return (await getOwnedGames(source.apiKey, source.accountId)).length
}

// Erreur → réponse HTTP : 400 quand l'utilisateur peut corriger (config,
// clé, profil privé), 502 quand un service externe est en cause.
export function steamErrorToHttp(err: unknown): { status: number; error: string } {
  if (
    err instanceof SteamNotConfiguredError ||
    err instanceof SteamAuthError ||
    err instanceof SteamPrivateProfileError
  )
    return { status: 400, error: err.message }
  console.error('Import Steam en échec :', err)
  return { status: 502, error: 'Steam ou IGDB est indisponible — réessayez plus tard.' }
}
```

Attention au rapport du test « import initial » : une fiche manuelle non-matchée crée aussi une entrée, donc elle compte dans `added` **et** dans `unmatched` (le test attend `added: 2, unmatched: 1` pour 2 jeux dont 1 non-matché).

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `npx vitest run test/import-steam.test.ts`
Expected: 12 tests PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/import-steam.ts test/import-steam.test.ts
git commit -m "feat: orchestration de l'import Steam (idempotent, fusion anti-duplication)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6 : Routes API (réglages + import + test de connexion)

**Files:**
- Create: `src/app/api/settings/steam/route.ts`
- Create: `src/app/api/import/steam/route.ts`
- Create: `src/app/api/import/steam/test/route.ts`
- Test: `test/api-import-steam.test.ts`

**Interfaces:**
- Consumes: tout `@/lib/import-steam` (Tasks 4-5), `DEFAULT_USER_ID` (`@/lib/user`).
- Produces (contrat pour l'UI, Task 7) :
  - `GET /api/settings/steam` → 200 `SteamConfigView` (JSON, `lastImportAt` sérialisé en ISO)
  - `PUT /api/settings/steam` body `{ apiKey?, accountId }` → 200 `SteamConfigView` | 400 `{ error }`
  - `POST /api/import/steam` → 200 `ImportReport` | 400/502 `{ error }`
  - `POST /api/import/steam/test` → 200 `{ gameCount: number }` | 400/502 `{ error }`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `test/api-import-steam.test.ts` :

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/steam', async () => {
  class SteamAuthError extends Error {
    constructor() { super('Clé Steam Web API refusée — vérifiez-la sur steamcommunity.com/dev/apikey.') }
  }
  class SteamPrivateProfileError extends Error {
    constructor() { super("Steam n'a renvoyé aucun jeu : profil privé ou SteamID64 incorrect.") }
  }
  return { getOwnedGames: vi.fn(async () => []), SteamAuthError, SteamPrivateProfileError }
})
vi.mock('@/lib/igdb', () => ({
  getGamesBySteamAppIds: vi.fn(async () => new Map()),
}))

import { getOwnedGames, SteamAuthError } from '@/lib/steam'
import { GET, PUT } from '@/app/api/settings/steam/route'
import { POST as importSteam } from '@/app/api/import/steam/route'
import { POST as testSteam } from '@/app/api/import/steam/test/route'

const STEAM_ID = '76561198000000001'

function putRequest(body: unknown): Request {
  return new Request('http://test/api/settings/steam', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  vi.mocked(getOwnedGames).mockReset().mockResolvedValue([])
  await prisma.importSource.deleteMany()
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: 'default-user', name: 'Test' } })
})

describe('GET/PUT /api/settings/steam', () => {
  it('GET sans config → configured=false', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ configured: false, accountId: null })
  })

  it('PUT valide → 200 avec la config (sans clé) ; GET la relit', async () => {
    const res = await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ configured: true, accountId: STEAM_ID })
    expect(body).not.toHaveProperty('apiKey')
  })

  it('PUT invalide → 400 avec message', async () => {
    const res = await PUT(putRequest({ apiKey: 'k', accountId: 'abc' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/SteamID64/)
  })

  it('PUT JSON invalide → 400', async () => {
    const res = await PUT(
      new Request('http://test', { method: 'PUT', body: 'pas-du-json' }),
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/import/steam', () => {
  it('sans config → 400 avec message actionnable', async () => {
    const res = await importSteam()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/configuré/)
  })

  it('clé refusée par Steam → 400 avec le message de SteamAuthError', async () => {
    await PUT(putRequest({ apiKey: 'mauvaise', accountId: STEAM_ID }))
    vi.mocked(getOwnedGames).mockRejectedValueOnce(new SteamAuthError())
    const res = await importSteam()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/steamcommunity\.com/)
  })

  it('erreur inattendue → 502 générique', async () => {
    await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    vi.mocked(getOwnedGames).mockRejectedValueOnce(new Error('boom réseau'))
    const res = await importSteam()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/indisponible/)
  })

  it('import OK → 200 avec le rapport', async () => {
    await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    const res = await importSteam()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      total: 0,
      added: 0,
      updated: 0,
      unmatched: 0,
      unmatchedTitles: [],
    })
  })
})

describe('POST /api/import/steam/test', () => {
  it('config OK → 200 avec le nombre de jeux', async () => {
    await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1, name: 'A', playtimeMinutes: 0 },
    ])
    const res = await testSteam()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ gameCount: 1 })
  })

  it('sans config → 400', async () => {
    expect((await testSteam()).status).toBe(400)
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `npx vitest run test/api-import-steam.test.ts`
Expected: FAIL — les modules de routes n'existent pas.

- [ ] **Step 3 : Implémenter les trois routes**

Créer `src/app/api/settings/steam/route.ts` :

```ts
import { NextResponse } from 'next/server'
import { getSteamConfig, saveSteamConfig } from '@/lib/import-steam'
import { DEFAULT_USER_ID } from '@/lib/user'

export async function GET() {
  return NextResponse.json(await getSteamConfig(DEFAULT_USER_ID))
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 })
  const result = await saveSteamConfig(DEFAULT_USER_ID, body)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(await getSteamConfig(DEFAULT_USER_ID))
}
```

Créer `src/app/api/import/steam/route.ts` :

```ts
import { NextResponse } from 'next/server'
import { runSteamImport, steamErrorToHttp } from '@/lib/import-steam'
import { DEFAULT_USER_ID } from '@/lib/user'

export async function POST() {
  try {
    return NextResponse.json(await runSteamImport(DEFAULT_USER_ID))
  } catch (err) {
    const { status, error } = steamErrorToHttp(err)
    return NextResponse.json({ error }, { status })
  }
}
```

Créer `src/app/api/import/steam/test/route.ts` :

```ts
import { NextResponse } from 'next/server'
import { testSteamConnection, steamErrorToHttp } from '@/lib/import-steam'
import { DEFAULT_USER_ID } from '@/lib/user'

export async function POST() {
  try {
    return NextResponse.json({ gameCount: await testSteamConnection(DEFAULT_USER_ID) })
  } catch (err) {
    const { status, error } = steamErrorToHttp(err)
    return NextResponse.json({ error }, { status })
  }
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `npx vitest run test/api-import-steam.test.ts`
Expected: 10 tests PASS.

- [ ] **Step 5 : Lancer la suite complète**

Run: `npm test`
Expected: tous les tests PASS (anciens + nouveaux).

- [ ] **Step 6 : Commit**

```bash
git add src/app/api/settings src/app/api/import test/api-import-steam.test.ts
git commit -m "feat: routes API réglages Steam, import et test de connexion

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7 : Page Réglages + carte Steam + navigation

**Files:**
- Create: `src/app/reglages/page.tsx`
- Create: `src/components/SteamImportCard.tsx`
- Modify: `src/app/layout.tsx` (tableau `NAV`, lignes 10-15)

**Interfaces:**
- Consumes: les 4 endpoints de la Task 6, exactement selon leur contrat JSON.
- Produces: page `/reglages` accessible depuis la navigation.

Pas de test automatisé (le repo ne teste pas les composants React — convention existante) : vérification par build + parcours manuel.

- [ ] **Step 1 : Ajouter l'entrée de navigation**

Dans `src/app/layout.tsx`, ajouter à la fin du tableau `NAV` :

```ts
  { href: '/reglages', label: 'Réglages' },
```

- [ ] **Step 2 : Créer la page Réglages**

Créer `src/app/reglages/page.tsx` :

```tsx
import { SteamImportCard } from '@/components/SteamImportCard'

export default function ReglagesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Réglages</h1>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Sources d’import</h2>
        <SteamImportCard />
        {/* Emplacements prévus par le spec — API non officielles, post-v1 */}
        <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
          PlayStation Network — bientôt
        </div>
        <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-600">
          Xbox — bientôt
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3 : Créer la carte Steam**

Créer `src/components/SteamImportCard.tsx` :

```tsx
'use client'

import { useEffect, useState } from 'react'

type Config = {
  configured: boolean
  accountId: string | null
  lastImportAt: string | null
}

type Report = {
  total: number
  added: number
  updated: number
  unmatched: number
  unmatchedTitles: string[]
}

type Action = 'save' | 'test' | 'import'

export function SteamImportCard() {
  const [config, setConfig] = useState<Config | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    fetch('/api/settings/steam')
      .then((r) => r.json())
      .then((c: Config) => {
        setConfig(c)
        setAccountId(c.accountId ?? '')
      })
      .catch(() => setError('Impossible de charger la configuration.'))
  }, [])

  async function run(action: Action) {
    setBusy(action)
    setError(null)
    setMessage(null)
    try {
      if (action === 'save') {
        const res = await fetch('/api/settings/steam', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKey || undefined, accountId }),
        })
        const body = await res.json()
        if (!res.ok) return setError(body.error)
        setConfig(body)
        setApiKey('') // la clé ne reste jamais affichée
        setMessage('Configuration enregistrée.')
      } else if (action === 'test') {
        const res = await fetch('/api/import/steam/test', { method: 'POST' })
        const body = await res.json()
        if (!res.ok) return setError(body.error)
        setMessage(`Connexion réussie — ${body.gameCount} jeux possédés sur Steam.`)
      } else {
        setReport(null)
        const res = await fetch('/api/import/steam', { method: 'POST' })
        const body = await res.json()
        if (!res.ok) return setError(body.error)
        setReport(body)
        setConfig(await (await fetch('/api/settings/steam')).json())
      }
    } catch {
      setError('Erreur réseau — réessayez.')
    } finally {
      setBusy(null)
    }
  }

  if (!config) {
    return (
      <div className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-500">
        Steam — chargement…
      </div>
    )
  }

  const inputClass =
    'w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600'
  const buttonClass =
    'rounded border border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-500 disabled:opacity-50'

  return (
    <div className="space-y-4 rounded-lg border border-zinc-800 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Steam</h3>
        {config.lastImportAt && (
          <span className="text-xs text-zinc-500">
            Dernier import : {new Date(config.lastImportAt).toLocaleString('fr-FR')}
          </span>
        )}
      </div>
      <p className="text-sm text-zinc-400">
        Importe vos jeux possédés et leurs temps de jeu réels. Obtenez une clé Web API
        (gratuite) sur{' '}
        <a
          href="https://steamcommunity.com/dev/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-emerald-400 hover:underline"
        >
          steamcommunity.com/dev/apikey
        </a>{' '}
        ; votre SteamID64 (17 chiffres) figure sur la même page. Le profil doit être
        public (Confidentialité → Détails de jeu) le temps de l’import.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">Clé Web API</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config.configured ? 'Enregistrée (laisser vide pour conserver)' : ''}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-zinc-400">SteamID64</span>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="76561198…"
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button onClick={() => run('save')} disabled={busy !== null} className={buttonClass}>
          {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          onClick={() => run('test')}
          disabled={busy !== null || !config.configured}
          className={buttonClass}
        >
          {busy === 'test' ? 'Test…' : 'Tester la connexion'}
        </button>
        <button
          onClick={() => run('import')}
          disabled={busy !== null || !config.configured}
          className={`${buttonClass} border-emerald-800 text-emerald-300 hover:border-emerald-600`}
        >
          {busy === 'import' ? 'Import en cours… (peut prendre une minute)' : 'Importer'}
        </button>
      </div>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {report && (
        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <p>
            {report.total} jeux sur Steam : <strong>{report.added} ajoutés</strong> (statut
            « À trier »), {report.updated} mis à jour, {report.unmatched} introuvables sur
            IGDB (fiches manuelles créées).
          </p>
          {report.unmatchedTitles.length > 0 && (
            <p className="text-zinc-500">
              Non trouvés : {report.unmatchedTitles.join(', ')}
              {report.unmatched > report.unmatchedTitles.length && '…'}
            </p>
          )}
          <p className="text-zinc-500">
            Les résumés importés sont en anglais — lancez <code>npm run translate:fr</code>{' '}
            pour les traduire.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4 : Lint et build**

Run: `npm run lint && npm run build`
Expected: aucune erreur.

- [ ] **Step 5 : Vérification manuelle du parcours**

```bash
npm run db:up && npm run dev
```

Sur `http://localhost:3000/reglages` :
1. « Réglages » apparaît dans la navigation.
2. SteamID64 invalide (ex. `123`) → message « Le SteamID64 doit comporter 17 chiffres. »
3. « Tester la connexion » et « Importer » sont désactivés tant que rien n'est enregistré.
4. Après enregistrement d'une config bidon : « Tester la connexion » → message d'erreur français (clé refusée), pas de crash.

- [ ] **Step 6 : Commit**

```bash
git add src/app/reglages src/components/SteamImportCard.tsx src/app/layout.tsx
git commit -m "feat: page Réglages avec carte d'import Steam

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8 : Temps de jeu Steam sur la fiche + vérification réelle de bout en bout

**Files:**
- Modify: `src/app/jeux/[entryId]/page.tsx` (bloc « Mon vécu », vers la ligne 66)

**Interfaces:**
- Consumes: `LibraryEntry.steamPlaytimeMinutes` (Task 1) — déjà inclus dans `getEntryWithGame`.

- [ ] **Step 1 : Afficher le temps Steam sur la fiche jeu**

Dans `src/app/jeux/[entryId]/page.tsx`, dans le `<div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">`, ajouter après la ligne `{entry.estimatedHours != null && <span>≈ {entry.estimatedHours} h</span>}` :

```tsx
            {entry.steamPlaytimeMinutes != null && (
              <span title="Temps de jeu réel enregistré par Steam">
                Steam :{' '}
                {entry.steamPlaytimeMinutes >= 60
                  ? `${Math.round(entry.steamPlaytimeMinutes / 60)} h`
                  : `${entry.steamPlaytimeMinutes} min`}
              </span>
            )}
```

- [ ] **Step 2 : Suite complète, lint, build**

Run: `npm test && npm run lint && npm run build`
Expected: tout PASS, aucune erreur.

- [ ] **Step 3 : Vérification réelle (nécessite les identifiants de Romain)**

C'est le seul step qui exige une clé réelle — si Romain n'est pas disponible, marquer le step comme À VALIDER et le signaler dans le rapport final :

1. Romain saisit sa clé Web API et son SteamID64 dans `/reglages`, teste la connexion (nombre de jeux cohérent), lance l'import.
2. Vérifier : entrées « À trier » créées, temps de jeu visibles sur les fiches, jeux déjà en bibliothèque fusionnés (plateforme PC ajoutée, note intacte).
3. Relancer l'import → rapport `0 ajoutés / N mis à jour`, aucun doublon (`npx prisma studio` ou la page « Tous les jeux » pour contrôler).
4. Si IGDB répond HTTP 400 sur `external_game_source` (vocabulaire pré-2024) : remplacer par `category` dans `getGamesBySteamAppIds` (cf. note Task 3) et relancer.

- [ ] **Step 4 : Commit final**

```bash
git add src/app/jeux
git commit -m "feat: temps de jeu Steam affiché sur la fiche jeu

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
