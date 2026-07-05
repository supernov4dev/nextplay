# NextPlay — Plan 1/4 : Cœur bibliothèque — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une web app Next.js fonctionnelle en local : bibliothèque de jeux personnelle avec recherche IGDB, ajout unitaire/en série/manuel, anti-duplication, vue dense filtrable, fiche jeu et tableau de bord.

**Architecture:** Application Next.js (App Router) monolithique : les pages serveur interrogent Prisma directement, les interactions client passent par des route handlers `/api/*`. PostgreSQL en Docker pour le dev. Le client IGDB (auth Twitch) vit dans `src/lib/` avec le reste de la logique métier, testée par Vitest.

**Tech Stack:** Next.js 16 (App Router — version installée : 16.x) · TypeScript strict · Tailwind CSS 4 · Prisma 6 · PostgreSQL 16 · Vitest · Node ≥ 22.12

**Spec :** `docs/superpowers/specs/2026-07-05-nextplay-design.md`. Ce plan couvre les sections 3, 4, 5.1, 5.2, 5.3 du spec. Hors périmètre de ce plan (plans suivants) : import Steam (plan 2), recommandations IA (plan 3), Dockerfile/CI/k8s (plan 4).

## Global Constraints

- Node ≥ 22.12, TypeScript `strict: true`, ESM.
- Interface utilisateur **entièrement en français** ; identifiants de code en anglais.
- **Anti-duplication** : `Game.igdbId` unique ; une seule `LibraryEntry` par couple (user, game) ; ré-ajout = fusion des plateformes jouées, jamais d'écrasement de la note/avis.
- **Jamais de miroir IGDB** : seuls les jeux ajoutés à la bibliothèque sont écrits en base.
- Un seul utilisateur en v1, seedé avec l'id fixe `default-user` ; toute donnée personnelle porte un `userId`.
- Statuts : Terminé / En cours / Abandonné / En pause / Souhaité / À trier. Note sur 10 (entier, optionnel).
- Pas de tests E2E navigateur ; Vitest pour la logique, vérification manuelle guidée pour l'UI.
- Commits fréquents, messages conventionnels (`feat:`, `test:`, `chore:`) en français.
- Prérequis exécution : Docker (compose) dispo sur la machine de dev ; clés IGDB (`IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`) créées sur https://dev.twitch.tv/console/apps (les tests n'en ont pas besoin — tout est mocké).

---

### Task 1: Scaffold du projet et outillage

**Files:**
- Create: projet Next.js à la racine du repo (`package.json`, `src/app/…`, `tsconfig.json`, etc. via create-next-app)
- Create: `docker-compose.dev.yml`, `docker/dev-init.sql`
- Create: `.env`, `.env.example`
- Create: `vitest.config.ts`, `test/setup.ts`
- Modify: `next.config.ts`, `package.json` (scripts)

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: commandes `npm run dev`, `npm test`, `npm run db:up` ; Postgres local avec bases `nextplay` (dev) et `nextplay_test` (tests) ; alias TS `@/*` → `src/*`.

- [ ] **Step 1: Scaffold Next.js**

Le repo contient déjà `docs/` et `.claude/` — create-next-app refuse un dossier non vide, donc scaffolder à côté puis rapatrier :

```bash
cd /home/nova/workspace/nextplay
npx create-next-app@latest /tmp/nextplay-scaffold --typescript --tailwind --eslint --app --src-dir --use-npm --no-import-alias --turbopack
rm -rf /tmp/nextplay-scaffold/.git   # create-next-app fait un git init : NE PAS écraser notre .git
cp -r /tmp/nextplay-scaffold/. . && rm -rf /tmp/nextplay-scaffold
```

Note : `--no-import-alias` garde l'alias par défaut `@/*` → `./src/*`. Vérifier dans `tsconfig.json` que `"paths": { "@/*": ["./src/*"] }` est présent.

- [ ] **Step 2: Postgres de dev via Docker Compose**

Créer `docker/dev-init.sql` :

```sql
-- Base dédiée aux tests d'intégration (la base "nextplay" est créée par POSTGRES_DB)
CREATE DATABASE nextplay_test OWNER nextplay;
```

Créer `docker-compose.dev.yml` :

```yaml
# Postgres de développement local (le déploiement réel est sur k3s, plan 4)
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: nextplay
      POSTGRES_PASSWORD: nextplay
      POSTGRES_DB: nextplay
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./docker/dev-init.sql:/docker-entrypoint-initdb.d/dev-init.sql:ro
volumes:
  db-data:
```

- [ ] **Step 3: Variables d'environnement**

Créer `.env.example` (committé) :

```bash
DATABASE_URL="postgresql://nextplay:nextplay@localhost:5432/nextplay"
# Créer une app sur https://dev.twitch.tv/console/apps pour obtenir ces clés
IGDB_CLIENT_ID=""
IGDB_CLIENT_SECRET=""
```

Copier en `.env` (non committé). Le `.gitignore` généré par create-next-app contient `.env*`, ce qui ignorerait aussi l'exemple : ajouter la ligne `!.env.example` juste après `.env*` dans `.gitignore`.

- [ ] **Step 4: Vitest**

```bash
npm install -D vitest tsx
```

Créer `vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

Créer `test/setup.ts` :

```ts
// Force la base de TEST — écrase toute valeur venant de .env pour ne jamais
// écrire dans la base de dev pendant les tests.
process.env.DATABASE_URL =
  'postgresql://nextplay:nextplay@localhost:5432/nextplay_test'
process.env.IGDB_CLIENT_ID = 'test-client-id'
process.env.IGDB_CLIENT_SECRET = 'test-secret'
```

- [ ] **Step 5: Scripts npm et next.config**

Dans `package.json`, ajouter aux `"scripts"` :

```json
"db:up": "docker compose -f docker-compose.dev.yml up -d",
"db:down": "docker compose -f docker-compose.dev.yml down",
"test": "vitest run",
"test:watch": "vitest"
```

Remplacer le contenu de `next.config.ts` :

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone', // image Docker légère (plan 4)
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.igdb.com' }],
  },
}

export default nextConfig
```

- [ ] **Step 6: Vérifier que tout tourne**

```bash
npm run db:up
docker compose -f docker-compose.dev.yml exec db psql -U nextplay -c '\l' | grep nextplay_test
npm run lint && npm run build
```

Attendu : la base `nextplay_test` listée ; lint et build sans erreur.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Postgres dev + Vitest"
```

---

### Task 2: Schéma Prisma, seed et client

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`
- Create: `src/lib/prisma.ts`, `src/lib/user.ts`
- Modify: `package.json` (bloc `"prisma"` + script)

**Interfaces:**
- Consumes: base Postgres de la Task 1.
- Produces: modèles `User`, `Game`, `LibraryEntry` ; enums `EntryStatus` (`FINISHED|PLAYING|DROPPED|PAUSED|WISHLIST|TO_SORT`) et `EntrySource` (`MANUAL|STEAM`) ; singleton `prisma` (`@/lib/prisma`) ; constante `DEFAULT_USER_ID = 'default-user'` (`@/lib/user`).

- [ ] **Step 1: Installer Prisma**

```bash
npm install @prisma/client
npm install -D prisma
```

- [ ] **Step 2: Écrire le schéma**

Créer `prisma/schema.prisma` :

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id      String         @id
  name    String
  entries LibraryEntry[]
}

// Fiche "objective" d'un jeu — cache local des métadonnées IGDB.
// Seuls les jeux ajoutés à la bibliothèque existent ici (jamais un miroir d'IGDB).
model Game {
  id          String         @id @default(cuid())
  igdbId      Int?           @unique // null = fiche créée manuellement
  title       String
  coverUrl    String?
  releaseYear Int?
  summary     String?
  genres      String[]       @default([])
  themes      String[]       @default([])
  platforms   String[]       @default([]) // plateformes où le jeu EXISTE (IGDB)
  igdbRating  Float?         // note agrégée IGDB (0-100)
  createdAt   DateTime       @default(now())
  entries     LibraryEntry[]
}

enum EntryStatus {
  FINISHED // Terminé
  PLAYING  // En cours
  DROPPED  // Abandonné
  PAUSED   // En pause
  WISHLIST // Souhaité
  TO_SORT  // À trier (imports)
}

enum EntrySource {
  MANUAL
  STEAM
}

// Le vécu de l'utilisateur sur un jeu — le cœur du projet.
model LibraryEntry {
  id              String      @id @default(cuid())
  userId          String
  gameId          String
  status          EntryStatus
  rating          Int?        // note personnelle sur 10
  review          String?     // avis personnel
  platformsPlayed String[]    @default([]) // plateformes où J'AI joué
  playPeriod      String?     // "2003", "vers 2010", "2019-2021"…
  estimatedHours  Int?
  source          EntrySource @default(MANUAL)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  user            User        @relation(fields: [userId], references: [id])
  game            Game        @relation(fields: [gameId], references: [id])

  @@unique([userId, gameId]) // anti-duplication : une entrée par jeu et par utilisateur
}
```

- [ ] **Step 3: Migration + seed**

Créer `prisma/seed.ts` :

```ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.user.upsert({
    where: { id: 'default-user' },
    update: {},
    create: { id: 'default-user', name: 'Romain' },
  })
  console.log('Utilisateur par défaut seedé.')
}

main().finally(() => prisma.$disconnect())
```

Dans `package.json`, ajouter (à la racine du JSON) :

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

et au bloc `"scripts"` :

```json
"db:push:test": "DATABASE_URL=postgresql://nextplay:nextplay@localhost:5432/nextplay_test prisma db push --skip-generate"
```

Puis :

```bash
npx prisma migrate dev --name init
npx prisma db seed
npm run db:push:test
```

Attendu : migration créée dans `prisma/migrations/`, message « Utilisateur par défaut seedé. », schéma poussé sur `nextplay_test`.

- [ ] **Step 4: Singleton Prisma et constante utilisateur**

Créer `src/lib/prisma.ts` :

```ts
import { PrismaClient } from '@prisma/client'

// Singleton : évite d'épuiser les connexions avec le hot-reload de Next.js
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

Créer `src/lib/user.ts` :

```ts
// v1 mono-utilisateur : id fixe créé par le seed. Le multi-comptes remplacera
// cette constante par l'utilisateur de la session.
export const DEFAULT_USER_ID = 'default-user'
```

- [ ] **Step 5: Vérifier et committer**

```bash
npm run build
git add -A
git commit -m "feat: schéma Prisma (User, Game, LibraryEntry) + seed"
```

---

### Task 3: Client IGDB

**Files:**
- Create: `src/lib/igdb.ts`
- Test: `test/igdb.test.ts`

**Interfaces:**
- Consumes: env `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`.
- Produces:
  ```ts
  export type IgdbGame = {
    igdbId: number; title: string; coverUrl: string | null
    releaseYear: number | null; summary: string | null
    genres: string[]; themes: string[]; platforms: string[]
    igdbRating: number | null
  }
  export async function searchGames(query: string): Promise<IgdbGame[]>
  export async function getGameById(igdbId: number): Promise<IgdbGame | null>
  export function resetTokenCache(): void // pour les tests
  ```

- [ ] **Step 1: Écrire les tests (échouants)**

Créer `test/igdb.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchGames, getGameById, resetTokenCache } from '@/lib/igdb'

const TOKEN_RESPONSE = { access_token: 'tok-123', expires_in: 5000 }
const RAW_GAME = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  summary: 'Geralt of Rivia...',
  first_release_date: 1431993600, // 2015-05-19
  total_rating: 93.4,
  cover: { image_id: 'co1wyy' },
  genres: [{ name: 'Role-playing (RPG)' }],
  themes: [{ name: 'Fantasy' }],
  platforms: [{ name: 'PC (Microsoft Windows)' }, { name: 'PlayStation 4' }],
}

function mockFetch(gameResults: unknown[]) {
  return vi.fn(async (url: RequestInfo | URL) => {
    if (String(url).includes('id.twitch.tv')) {
      return new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 })
    }
    return new Response(JSON.stringify(gameResults), { status: 200 })
  })
}

beforeEach(() => resetTokenCache())

describe('searchGames', () => {
  it('mappe la réponse IGDB vers IgdbGame', async () => {
    vi.stubGlobal('fetch', mockFetch([RAW_GAME]))
    const results = await searchGames('witcher')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      igdbId: 1942,
      title: 'The Witcher 3: Wild Hunt',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
      releaseYear: 2015,
      summary: 'Geralt of Rivia...',
      genres: ['Role-playing (RPG)'],
      themes: ['Fantasy'],
      platforms: ['PC (Microsoft Windows)', 'PlayStation 4'],
      igdbRating: 93.4,
    })
  })

  it('tolère les champs absents (jaquette, date, genres...)', async () => {
    vi.stubGlobal('fetch', mockFetch([{ id: 7, name: 'Jeu obscur' }]))
    const [game] = await searchGames('obscur')
    expect(game.coverUrl).toBeNull()
    expect(game.releaseYear).toBeNull()
    expect(game.genres).toEqual([])
    expect(game.igdbRating).toBeNull()
  })

  it("réutilise le token entre deux appels (une seule requête d'auth)", async () => {
    const fetchMock = mockFetch([RAW_GAME])
    vi.stubGlobal('fetch', fetchMock)
    await searchGames('a')
    await searchGames('b')
    const authCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('id.twitch.tv'),
    )
    expect(authCalls).toHaveLength(1)
  })

  it('lève une erreur si IGDB répond en échec', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes('id.twitch.tv')
        ? new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 })
        : new Response('oops', { status: 500 }),
    ))
    await expect(searchGames('x')).rejects.toThrow()
  })
})

describe('getGameById', () => {
  it('retourne le jeu si trouvé', async () => {
    vi.stubGlobal('fetch', mockFetch([RAW_GAME]))
    const game = await getGameById(1942)
    expect(game?.title).toBe('The Witcher 3: Wild Hunt')
  })

  it('retourne null si introuvable', async () => {
    vi.stubGlobal('fetch', mockFetch([]))
    expect(await getGameById(999999)).toBeNull()
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- test/igdb.test.ts`
Expected: FAIL — `Cannot find module '@/lib/igdb'` (ou équivalent).

- [ ] **Step 3: Implémenter le client**

Créer `src/lib/igdb.ts` :

```ts
// Client IGDB (https://api-docs.igdb.com) — auth Twitch "client credentials".
// Sollicité UNIQUEMENT pour la recherche à l'ajout, le matching d'import et
// l'enrichissement des recos : on ne stocke jamais un miroir d'IGDB.

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API_URL = 'https://api.igdb.com/v4'
const GAME_FIELDS =
  'fields name, summary, first_release_date, total_rating, cover.image_id, genres.name, themes.name, platforms.name;'

export type IgdbGame = {
  igdbId: number
  title: string
  coverUrl: string | null
  releaseYear: number | null
  summary: string | null
  genres: string[]
  themes: string[]
  platforms: string[]
  igdbRating: number | null
}

let cachedToken: { value: string; expiresAt: number } | null = null

export function resetTokenCache(): void {
  cachedToken = null
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value
  const params = new URLSearchParams({
    client_id: process.env.IGDB_CLIENT_ID ?? '',
    client_secret: process.env.IGDB_CLIENT_SECRET ?? '',
    grant_type: 'client_credentials',
  })
  const res = await fetch(`${TOKEN_URL}?${params}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Auth Twitch échouée (HTTP ${res.status})`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    value: data.access_token,
    // marge de 60 s pour ne jamais utiliser un token expiré
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

type RawGame = {
  id: number
  name: string
  summary?: string
  first_release_date?: number
  total_rating?: number
  cover?: { image_id: string }
  genres?: { name: string }[]
  themes?: { name: string }[]
  platforms?: { name: string }[]
}

function toIgdbGame(raw: RawGame): IgdbGame {
  return {
    igdbId: raw.id,
    title: raw.name,
    coverUrl: raw.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${raw.cover.image_id}.jpg`
      : null,
    releaseYear: raw.first_release_date
      ? new Date(raw.first_release_date * 1000).getUTCFullYear()
      : null,
    summary: raw.summary ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    themes: (raw.themes ?? []).map((t) => t.name),
    platforms: (raw.platforms ?? []).map((p) => p.name),
    igdbRating: raw.total_rating ?? null,
  }
}

async function igdbQuery(body: string): Promise<RawGame[]> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}/games`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID ?? '',
      Authorization: `Bearer ${token}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`IGDB a répondu HTTP ${res.status}`)
  return (await res.json()) as RawGame[]
}

export async function searchGames(query: string): Promise<IgdbGame[]> {
  const safe = query.replaceAll('"', '')
  const raw = await igdbQuery(`search "${safe}"; ${GAME_FIELDS} limit 10;`)
  return raw.map(toIgdbGame)
}

export async function getGameById(igdbId: number): Promise<IgdbGame | null> {
  const raw = await igdbQuery(`where id = ${igdbId}; ${GAME_FIELDS} limit 1;`)
  return raw.length > 0 ? toIgdbGame(raw[0]) : null
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test -- test/igdb.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/igdb.ts test/igdb.test.ts
git commit -m "feat: client IGDB (auth Twitch, recherche, fiche par id)"
```

---

### Task 4: Service bibliothèque — ajout et anti-duplication

**Files:**
- Create: `src/lib/library.ts`
- Test: `test/library.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), type `IgdbGame` (Task 3), enums Prisma `EntryStatus`/`EntrySource`.
- Produces:
  ```ts
  export type PersonalInput = {
    status: EntryStatus
    rating?: number | null
    review?: string | null
    platformsPlayed?: string[]
    playPeriod?: string | null
    estimatedHours?: number | null
  }
  export type ManualGameInput = { title: string; releaseYear?: number | null; platforms?: string[] }
  export async function addGameFromIgdb(userId: string, igdb: IgdbGame, personal: PersonalInput): Promise<{ entry: LibraryEntry; created: boolean }>
  export async function addManualGame(userId: string, game: ManualGameInput, personal: PersonalInput): Promise<{ entry: LibraryEntry; created: boolean }>
  export async function updateEntry(entryId: string, personal: Partial<PersonalInput>): Promise<LibraryEntry>
  export async function deleteEntry(entryId: string): Promise<void>
  export async function getEntryWithGame(entryId: string): Promise<(LibraryEntry & { game: Game }) | null>
  ```

**Note :** tests d'intégration contre la base `nextplay_test` (Docker démarré : `npm run db:up`, schéma poussé : `npm run db:push:test`).

- [ ] **Step 1: Écrire les tests (échouants)**

Créer `test/library.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  addGameFromIgdb,
  addManualGame,
  updateEntry,
  deleteEntry,
  getEntryWithGame,
} from '@/lib/library'
import type { IgdbGame } from '@/lib/igdb'

const USER = 'test-user'
const HADES: IgdbGame = {
  igdbId: 113112,
  title: 'Hades',
  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co39vc.jpg',
  releaseYear: 2020,
  summary: 'Un rogue-lite infernal.',
  genres: ['Role-playing (RPG)'],
  themes: ['Fantasy'],
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
  igdbRating: 92.1,
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
})

describe('addGameFromIgdb', () => {
  it('crée la fiche Game et la LibraryEntry', async () => {
    const { entry, created } = await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED',
      rating: 9,
      review: 'Excellent.',
      platformsPlayed: ['Switch'],
    })
    expect(created).toBe(true)
    expect(entry.rating).toBe(9)
    const game = await prisma.game.findUnique({ where: { igdbId: 113112 } })
    expect(game?.title).toBe('Hades')
    expect(game?.genres).toEqual(['Role-playing (RPG)'])
  })

  it("ré-ajout du même jeu : fusionne les plateformes SANS écraser note/avis", async () => {
    await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED', rating: 9, review: 'Excellent.', platformsPlayed: ['Switch'],
    })
    const { entry, created } = await addGameFromIgdb(USER, HADES, {
      status: 'PLAYING', rating: 5, review: 'écrasé ?', platformsPlayed: ['PC', 'Switch'],
    })
    expect(created).toBe(false)
    expect(entry.platformsPlayed.sort()).toEqual(['PC', 'Switch'])
    expect(entry.rating).toBe(9)          // conservé
    expect(entry.review).toBe('Excellent.') // conservé
    expect(entry.status).toBe('FINISHED')   // conservé
    expect(await prisma.game.count()).toBe(1) // pas de doublon de fiche
  })
})

describe('addManualGame', () => {
  it('crée une fiche sans igdbId', async () => {
    const { entry, created } = await addManualGame(
      USER,
      { title: 'Jeu homebrew PS1', releaseYear: 1998, platforms: ['PlayStation'] },
      { status: 'FINISHED', platformsPlayed: ['PlayStation'] },
    )
    expect(created).toBe(true)
    const full = await getEntryWithGame(entry.id)
    expect(full?.game.igdbId).toBeNull()
    expect(full?.game.title).toBe('Jeu homebrew PS1')
  })
})

describe('updateEntry / deleteEntry', () => {
  it('met à jour uniquement les champs fournis', async () => {
    const { entry } = await addGameFromIgdb(USER, HADES, {
      status: 'TO_SORT', platformsPlayed: ['PC'],
    })
    const updated = await updateEntry(entry.id, { status: 'FINISHED', rating: 8 })
    expect(updated.status).toBe('FINISHED')
    expect(updated.rating).toBe(8)
    expect(updated.platformsPlayed).toEqual(['PC']) // intact
  })

  it("supprime l'entrée et la fiche Game devenue orpheline", async () => {
    const { entry } = await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED', platformsPlayed: [],
    })
    await deleteEntry(entry.id)
    expect(await prisma.libraryEntry.count()).toBe(0)
    expect(await prisma.game.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm run db:up && npm run db:push:test && npm test -- test/library.test.ts`
Expected: FAIL — `Cannot find module '@/lib/library'`.

- [ ] **Step 3: Implémenter le service**

Créer `src/lib/library.ts` :

```ts
import { prisma } from '@/lib/prisma'
import type { EntryStatus, Game, LibraryEntry } from '@prisma/client'
import type { IgdbGame } from '@/lib/igdb'

export type PersonalInput = {
  status: EntryStatus
  rating?: number | null
  review?: string | null
  platformsPlayed?: string[]
  playPeriod?: string | null
  estimatedHours?: number | null
}

export type ManualGameInput = {
  title: string
  releaseYear?: number | null
  platforms?: string[]
}

// Règle anti-duplication : si l'utilisateur possède déjà une entrée pour ce
// jeu, on fusionne les plateformes jouées et on ne touche à rien d'autre
// (la note et l'avis existants font foi).
async function upsertEntry(
  userId: string,
  gameId: string,
  personal: PersonalInput,
): Promise<{ entry: LibraryEntry; created: boolean }> {
  const existing = await prisma.libraryEntry.findUnique({
    where: { userId_gameId: { userId, gameId } },
  })
  if (existing) {
    const merged = [
      ...new Set([...existing.platformsPlayed, ...(personal.platformsPlayed ?? [])]),
    ]
    const entry = await prisma.libraryEntry.update({
      where: { id: existing.id },
      data: { platformsPlayed: merged },
    })
    return { entry, created: false }
  }
  const entry = await prisma.libraryEntry.create({
    data: {
      userId,
      gameId,
      status: personal.status,
      rating: personal.rating ?? null,
      review: personal.review ?? null,
      platformsPlayed: personal.platformsPlayed ?? [],
      playPeriod: personal.playPeriod ?? null,
      estimatedHours: personal.estimatedHours ?? null,
    },
  })
  return { entry, created: true }
}

export async function addGameFromIgdb(
  userId: string,
  igdb: IgdbGame,
  personal: PersonalInput,
): Promise<{ entry: LibraryEntry; created: boolean }> {
  const game = await prisma.game.upsert({
    where: { igdbId: igdb.igdbId },
    update: {}, // fiche existante = source de vérité, pas de rafraîchissement ici
    create: {
      igdbId: igdb.igdbId,
      title: igdb.title,
      coverUrl: igdb.coverUrl,
      releaseYear: igdb.releaseYear,
      summary: igdb.summary,
      genres: igdb.genres,
      themes: igdb.themes,
      platforms: igdb.platforms,
      igdbRating: igdb.igdbRating,
    },
  })
  return upsertEntry(userId, game.id, personal)
}

export async function addManualGame(
  userId: string,
  gameInput: ManualGameInput,
  personal: PersonalInput,
): Promise<{ entry: LibraryEntry; created: boolean }> {
  const game = await prisma.game.create({
    data: {
      title: gameInput.title,
      releaseYear: gameInput.releaseYear ?? null,
      platforms: gameInput.platforms ?? [],
    },
  })
  return upsertEntry(userId, game.id, personal)
}

export async function updateEntry(
  entryId: string,
  personal: Partial<PersonalInput>,
): Promise<LibraryEntry> {
  return prisma.libraryEntry.update({
    where: { id: entryId },
    data: {
      ...(personal.status !== undefined && { status: personal.status }),
      ...(personal.rating !== undefined && { rating: personal.rating }),
      ...(personal.review !== undefined && { review: personal.review }),
      ...(personal.platformsPlayed !== undefined && {
        platformsPlayed: personal.platformsPlayed,
      }),
      ...(personal.playPeriod !== undefined && { playPeriod: personal.playPeriod }),
      ...(personal.estimatedHours !== undefined && {
        estimatedHours: personal.estimatedHours,
      }),
    },
  })
}

export async function deleteEntry(entryId: string): Promise<void> {
  const entry = await prisma.libraryEntry.delete({ where: { id: entryId } })
  // Supprime la fiche Game si plus personne ne la référence
  const remaining = await prisma.libraryEntry.count({ where: { gameId: entry.gameId } })
  if (remaining === 0) await prisma.game.delete({ where: { id: entry.gameId } })
}

export async function getEntryWithGame(
  entryId: string,
): Promise<(LibraryEntry & { game: Game }) | null> {
  return prisma.libraryEntry.findUnique({
    where: { id: entryId },
    include: { game: true },
  })
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test -- test/library.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/library.ts test/library.test.ts
git commit -m "feat: service bibliothèque (ajout IGDB/manuel, fusion anti-duplication)"
```

---

### Task 5: Service bibliothèque — liste, filtres et tris

**Files:**
- Create: `src/lib/filters.ts`
- Modify: `src/lib/library.ts` (ajout de `listLibrary`)
- Test: `test/filters.test.ts`, `test/library-list.test.ts`

**Interfaces:**
- Consumes: `prisma`, modèles Task 2, service Task 4.
- Produces:
  ```ts
  // @/lib/filters
  export type LibrarySort = 'recent' | 'title' | 'rating' | 'releaseYear'
  export type LibraryFilters = {
    status?: EntryStatus; platform?: string; genre?: string
    decade?: number; minRating?: number; search?: string; sort: LibrarySort
  }
  export function parseFilters(params: Record<string, string | undefined>): LibraryFilters
  // @/lib/library
  export async function listLibrary(userId: string, filters: LibraryFilters): Promise<(LibraryEntry & { game: Game })[]>
  ```

- [ ] **Step 1: Tests de `parseFilters` (échouants)**

Créer `test/filters.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { parseFilters } from '@/lib/filters'

describe('parseFilters', () => {
  it('valeurs par défaut : tri "recent", aucun filtre', () => {
    expect(parseFilters({})).toEqual({ sort: 'recent' })
  })

  it('parse tous les paramètres valides', () => {
    expect(
      parseFilters({
        status: 'FINISHED', platform: 'PC', genre: 'RPG',
        decade: '1990', minRating: '8', q: 'zelda', sort: 'rating',
      }),
    ).toEqual({
      status: 'FINISHED', platform: 'PC', genre: 'RPG',
      decade: 1990, minRating: 8, search: 'zelda', sort: 'rating',
    })
  })

  it('ignore les valeurs invalides (statut inconnu, tri inconnu, décennie non numérique)', () => {
    expect(
      parseFilters({ status: 'NIMPORTE', sort: 'hack', decade: 'abc' }),
    ).toEqual({ sort: 'recent' })
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- test/filters.test.ts`
Expected: FAIL — `Cannot find module '@/lib/filters'`.

- [ ] **Step 3: Implémenter `parseFilters`**

Créer `src/lib/filters.ts` :

```ts
import { EntryStatus } from '@prisma/client'

export type LibrarySort = 'recent' | 'title' | 'rating' | 'releaseYear'

export type LibraryFilters = {
  status?: EntryStatus
  platform?: string
  genre?: string
  decade?: number
  minRating?: number
  search?: string
  sort: LibrarySort
}

const SORTS: LibrarySort[] = ['recent', 'title', 'rating', 'releaseYear']

// Traduit les searchParams d'URL (tous optionnels, non fiables) en filtres sûrs.
export function parseFilters(
  params: Record<string, string | undefined>,
): LibraryFilters {
  const filters: LibraryFilters = {
    sort: SORTS.includes(params.sort as LibrarySort)
      ? (params.sort as LibrarySort)
      : 'recent',
  }
  if (params.status && params.status in EntryStatus)
    filters.status = params.status as EntryStatus
  if (params.platform) filters.platform = params.platform
  if (params.genre) filters.genre = params.genre
  const decade = Number(params.decade)
  if (params.decade && Number.isInteger(decade)) filters.decade = decade
  const minRating = Number(params.minRating)
  if (params.minRating && Number.isInteger(minRating)) filters.minRating = minRating
  if (params.q) filters.search = params.q
  return filters
}
```

Run: `npm test -- test/filters.test.ts` → PASS (3 tests).

- [ ] **Step 4: Tests de `listLibrary` (échouants)**

Créer `test/library-list.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addGameFromIgdb, listLibrary } from '@/lib/library'
import type { IgdbGame } from '@/lib/igdb'

const USER = 'test-user'

function fakeGame(igdbId: number, title: string, year: number, genres: string[]): IgdbGame {
  return {
    igdbId, title, releaseYear: year, genres,
    coverUrl: null, summary: null, themes: [], platforms: [], igdbRating: null,
  }
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
  await addGameFromIgdb(USER, fakeGame(1, 'Final Fantasy VII', 1997, ['RPG']), {
    status: 'FINISHED', rating: 10, platformsPlayed: ['PlayStation'], playPeriod: '1998',
  })
  await addGameFromIgdb(USER, fakeGame(2, 'Hades', 2020, ['RPG', 'Roguelike']), {
    status: 'PLAYING', rating: 9, platformsPlayed: ['PC'],
  })
  await addGameFromIgdb(USER, fakeGame(3, 'Gran Turismo', 1997, ['Course']), {
    status: 'TO_SORT', platformsPlayed: ['PlayStation'],
  })
})

describe('listLibrary', () => {
  it('sans filtre : tout, trié par ajout récent', async () => {
    const list = await listLibrary(USER, { sort: 'recent' })
    expect(list.map((e) => e.game.title)).toEqual([
      'Gran Turismo', 'Hades', 'Final Fantasy VII',
    ])
  })

  it('filtre par statut', async () => {
    const list = await listLibrary(USER, { sort: 'recent', status: 'PLAYING' })
    expect(list.map((e) => e.game.title)).toEqual(['Hades'])
  })

  it('filtre par plateforme jouée + genre + décennie', async () => {
    const list = await listLibrary(USER, {
      sort: 'recent', platform: 'PlayStation', genre: 'RPG', decade: 1990,
    })
    expect(list.map((e) => e.game.title)).toEqual(['Final Fantasy VII'])
  })

  it('filtre par note minimale et tri par note', async () => {
    const list = await listLibrary(USER, { sort: 'rating', minRating: 9 })
    expect(list.map((e) => e.rating)).toEqual([10, 9])
  })

  it('recherche plein-texte insensible à la casse', async () => {
    const list = await listLibrary(USER, { sort: 'recent', search: 'hades' })
    expect(list.map((e) => e.game.title)).toEqual(['Hades'])
  })

  it('tri par titre', async () => {
    const list = await listLibrary(USER, { sort: 'title' })
    expect(list.map((e) => e.game.title)).toEqual([
      'Final Fantasy VII', 'Gran Turismo', 'Hades',
    ])
  })
})
```

- [ ] **Step 5: Vérifier l'échec**

Run: `npm test -- test/library-list.test.ts`
Expected: FAIL — `listLibrary is not a function` (ou export manquant).

- [ ] **Step 6: Implémenter `listLibrary`**

Ajouter à la fin de `src/lib/library.ts` :

```ts
import type { LibraryFilters } from '@/lib/filters'

export async function listLibrary(
  userId: string,
  filters: LibraryFilters,
): Promise<(LibraryEntry & { game: Game })[]> {
  const gameWhere: Record<string, unknown> = {}
  if (filters.genre) gameWhere.genres = { has: filters.genre }
  if (filters.decade !== undefined)
    gameWhere.releaseYear = { gte: filters.decade, lt: filters.decade + 10 }
  if (filters.search)
    gameWhere.title = { contains: filters.search, mode: 'insensitive' }

  const orderBy =
    filters.sort === 'title'
      ? { game: { title: 'asc' as const } }
      : filters.sort === 'rating'
        ? { rating: { sort: 'desc' as const, nulls: 'last' as const } }
        : filters.sort === 'releaseYear'
          ? { game: { releaseYear: { sort: 'desc' as const, nulls: 'last' as const } } }
          : { createdAt: 'desc' as const }

  return prisma.libraryEntry.findMany({
    where: {
      userId,
      ...(filters.status && { status: filters.status }),
      ...(filters.platform && { platformsPlayed: { has: filters.platform } }),
      ...(filters.minRating !== undefined && { rating: { gte: filters.minRating } }),
      ...(Object.keys(gameWhere).length > 0 && { game: gameWhere }),
    },
    include: { game: true },
    orderBy,
  })
}
```

Note : l'import de `LibraryFilters` doit être remonté avec les autres imports en tête de fichier.

- [ ] **Step 7: Vérifier le succès puis tout relancer**

Run: `npm test`
Expected: PASS — tous les tests du projet (igdb, library, filters, library-list).

- [ ] **Step 8: Commit**

```bash
git add src/lib/filters.ts src/lib/library.ts test/filters.test.ts test/library-list.test.ts
git commit -m "feat: liste de la bibliothèque avec filtres et tris"
```

---

### Task 6: Routes API

**Files:**
- Create: `src/app/api/igdb/search/route.ts`
- Create: `src/app/api/library/route.ts`
- Create: `src/app/api/library/[entryId]/route.ts`
- Create: `src/lib/validate.ts`
- Test: `test/api-library.test.ts`

**Interfaces:**
- Consumes: `searchGames`/`getGameById` (Task 3), services Task 4/5, `DEFAULT_USER_ID`.
- Produces (contrat HTTP utilisé par l'UI, Tasks 7-10) :
  - `GET /api/igdb/search?q=<texte>` → `200 { results: IgdbGame[] }` | `400` si `q` absent | `502` si IGDB en panne
  - `POST /api/library` body `{ igdbId?: number; manual?: ManualGameInput; personal: PersonalInput }` → `201 { entryId, created: true }` | `200 { entryId, created: false }` (fusion) | `400` | `404` (igdbId inconnu)
  - `PATCH /api/library/:entryId` body `{ personal: Partial<PersonalInput> }` → `200 { entryId }`
  - `DELETE /api/library/:entryId` → `204`

- [ ] **Step 1: Écrire les tests (échouants)**

Créer `test/api-library.test.ts` :

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/igdb', () => ({
  getGameById: vi.fn(async (id: number) =>
    id === 113112
      ? {
          igdbId: 113112, title: 'Hades', coverUrl: null, releaseYear: 2020,
          summary: null, genres: ['RPG'], themes: [], platforms: [], igdbRating: 92,
        }
      : null,
  ),
  searchGames: vi.fn(async () => []),
}))

import { POST } from '@/app/api/library/route'
import { PATCH, DELETE } from '@/app/api/library/[entryId]/route'

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://test/api/library', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: 'default-user', name: 'Test' } })
})

describe('POST /api/library', () => {
  it('ajoute un jeu depuis IGDB → 201', async () => {
    const res = await POST(
      jsonRequest('POST', {
        igdbId: 113112,
        personal: { status: 'FINISHED', rating: 9, platformsPlayed: ['PC'] },
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.created).toBe(true)
  })

  it('ré-ajout → 200 avec created=false (fusion)', async () => {
    const payload = {
      igdbId: 113112,
      personal: { status: 'FINISHED', platformsPlayed: ['PC'] },
    }
    await POST(jsonRequest('POST', payload))
    const res = await POST(jsonRequest('POST', payload))
    expect(res.status).toBe(200)
    expect((await res.json()).created).toBe(false)
  })

  it('igdbId inconnu → 404 ; payload sans statut → 400 ; note hors bornes → 400', async () => {
    expect(
      (await POST(jsonRequest('POST', { igdbId: 42, personal: { status: 'FINISHED' } }))).status,
    ).toBe(404)
    expect((await POST(jsonRequest('POST', { igdbId: 113112, personal: {} }))).status).toBe(400)
    expect(
      (await POST(
        jsonRequest('POST', { igdbId: 113112, personal: { status: 'FINISHED', rating: 15 } }),
      )).status,
    ).toBe(400)
  })

  it('ajout manuel → 201', async () => {
    const res = await POST(
      jsonRequest('POST', {
        manual: { title: 'Jeu PS1 obscur', releaseYear: 1998 },
        personal: { status: 'FINISHED' },
      }),
    )
    expect(res.status).toBe(201)
  })
})

describe('PATCH & DELETE /api/library/:entryId', () => {
  it('met à jour puis supprime', async () => {
    const created = await POST(
      jsonRequest('POST', { igdbId: 113112, personal: { status: 'TO_SORT' } }),
    )
    const { entryId } = await created.json()
    const params = Promise.resolve({ entryId })

    const patched = await PATCH(
      jsonRequest('PATCH', { personal: { status: 'FINISHED', rating: 8 } }),
      { params },
    )
    expect(patched.status).toBe(200)
    const entry = await prisma.libraryEntry.findUnique({ where: { id: entryId } })
    expect(entry?.rating).toBe(8)

    const deleted = await DELETE(new Request('http://test'), { params })
    expect(deleted.status).toBe(204)
    expect(await prisma.libraryEntry.count()).toBe(0)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- test/api-library.test.ts`
Expected: FAIL — modules de routes introuvables.

- [ ] **Step 3: Implémenter la validation**

Créer `src/lib/validate.ts` :

```ts
import { EntryStatus } from '@prisma/client'
import type { PersonalInput } from '@/lib/library'

type Result =
  | { ok: true; value: PersonalInput }
  | { ok: false; error: string }

export function validatePersonal(input: unknown): Result {
  if (!input || typeof input !== 'object')
    return { ok: false, error: 'Données personnelles requises.' }
  const p = input as Record<string, unknown>
  if (typeof p.status !== 'string' || !(p.status in EntryStatus))
    return { ok: false, error: 'Statut invalide.' }
  if (
    p.rating != null &&
    (typeof p.rating !== 'number' || !Number.isInteger(p.rating) || p.rating < 0 || p.rating > 10)
  )
    return { ok: false, error: 'La note doit être un entier entre 0 et 10.' }
  return {
    ok: true,
    value: {
      status: p.status as EntryStatus,
      rating: (p.rating as number | null) ?? null,
      review: typeof p.review === 'string' && p.review !== '' ? p.review : null,
      platformsPlayed: Array.isArray(p.platformsPlayed)
        ? p.platformsPlayed.filter((x): x is string => typeof x === 'string')
        : [],
      playPeriod: typeof p.playPeriod === 'string' && p.playPeriod !== '' ? p.playPeriod : null,
      estimatedHours:
        typeof p.estimatedHours === 'number' ? Math.round(p.estimatedHours) : null,
    },
  }
}
```

- [ ] **Step 4: Implémenter les routes**

Créer `src/app/api/igdb/search/route.ts` :

```ts
import { NextResponse } from 'next/server'
import { searchGames } from '@/lib/igdb'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')
  if (!q) return NextResponse.json({ error: 'Paramètre q requis.' }, { status: 400 })
  try {
    return NextResponse.json({ results: await searchGames(q) })
  } catch (err) {
    console.error('Recherche IGDB en échec :', err)
    return NextResponse.json(
      { error: 'IGDB est indisponible — vous pouvez créer une fiche manuelle.' },
      { status: 502 },
    )
  }
}
```

Créer `src/app/api/library/route.ts` :

```ts
import { NextResponse } from 'next/server'
import { getGameById } from '@/lib/igdb'
import { addGameFromIgdb, addManualGame } from '@/lib/library'
import { validatePersonal } from '@/lib/validate'
import { DEFAULT_USER_ID } from '@/lib/user'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'JSON invalide.' }, { status: 400 })

  const personal = validatePersonal(body.personal)
  if (!personal.ok) return NextResponse.json({ error: personal.error }, { status: 400 })

  if (typeof body.igdbId === 'number') {
    const igdb = await getGameById(body.igdbId)
    if (!igdb)
      return NextResponse.json({ error: 'Jeu introuvable sur IGDB.' }, { status: 404 })
    const { entry, created } = await addGameFromIgdb(DEFAULT_USER_ID, igdb, personal.value)
    return NextResponse.json(
      { entryId: entry.id, created },
      { status: created ? 201 : 200 },
    )
  }

  if (body.manual && typeof body.manual.title === 'string' && body.manual.title.trim()) {
    const { entry } = await addManualGame(
      DEFAULT_USER_ID,
      {
        title: body.manual.title.trim(),
        releaseYear: typeof body.manual.releaseYear === 'number' ? body.manual.releaseYear : null,
        platforms: Array.isArray(body.manual.platforms) ? body.manual.platforms : [],
      },
      personal.value,
    )
    return NextResponse.json({ entryId: entry.id, created: true }, { status: 201 })
  }

  return NextResponse.json({ error: 'igdbId ou manual.title requis.' }, { status: 400 })
}
```

Créer `src/app/api/library/[entryId]/route.ts` :

```ts
import { NextResponse } from 'next/server'
import { updateEntry, deleteEntry } from '@/lib/library'
import type { PersonalInput } from '@/lib/library'
import { EntryStatus } from '@prisma/client'

type Ctx = { params: Promise<{ entryId: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  const { entryId } = await params
  const body = await req.json().catch(() => null)
  const p = body?.personal
  if (!p || typeof p !== 'object')
    return NextResponse.json({ error: 'personal requis.' }, { status: 400 })
  if (p.status !== undefined && !(typeof p.status === 'string' && p.status in EntryStatus))
    return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 })
  if (
    p.rating != null &&
    (!Number.isInteger(p.rating) || p.rating < 0 || p.rating > 10)
  )
    return NextResponse.json({ error: 'La note doit être un entier entre 0 et 10.' }, { status: 400 })
  try {
    await updateEntry(entryId, p as Partial<PersonalInput>)
    return NextResponse.json({ entryId })
  } catch {
    return NextResponse.json({ error: 'Entrée introuvable.' }, { status: 404 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { entryId } = await params
  try {
    await deleteEntry(entryId)
    return new Response(null, { status: 204 })
  } catch {
    return NextResponse.json({ error: 'Entrée introuvable.' }, { status: 404 })
  }
}
```

- [ ] **Step 5: Vérifier le succès**

Run: `npm test`
Expected: PASS — toute la suite.

- [ ] **Step 6: Commit**

```bash
git add src/app/api src/lib/validate.ts test/api-library.test.ts
git commit -m "feat: routes API bibliothèque et recherche IGDB"
```

---

### Task 7: Layout, navigation et page « Tous les jeux »

**Files:**
- Create: `src/lib/status.ts`, `src/components/StatusBadge.tsx`, `src/components/LibraryFilterBar.tsx`
- Create: `src/app/jeux/page.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css` (si besoin), supprimer le contenu démo de `src/app/page.tsx` (remplacé en Task 10 ; en attendant, page minimale)
- Test: aucun nouveau test automatique (page serveur sans logique propre — la logique est dans `parseFilters`/`listLibrary`, déjà testée)

**Interfaces:**
- Consumes: `listLibrary`, `parseFilters`, `DEFAULT_USER_ID`, enums Prisma.
- Produces: `STATUS_LABELS: Record<EntryStatus, string>` (`@/lib/status`), composants `StatusBadge`, `LibraryFilterBar` ; navigation globale avec liens `/` (Accueil), `/jeux` (Tous les jeux), `/ajouter` (Ajouter). URL des filtres : `/jeux?status=&platform=&genre=&decade=&minRating=&q=&sort=&view=` (`view=grid` pour la grille).

- [ ] **Step 1: Libellés français des statuts**

Créer `src/lib/status.ts` :

```ts
import { EntryStatus } from '@prisma/client'

export const STATUS_LABELS: Record<EntryStatus, string> = {
  FINISHED: 'Terminé',
  PLAYING: 'En cours',
  DROPPED: 'Abandonné',
  PAUSED: 'En pause',
  WISHLIST: 'Souhaité',
  TO_SORT: 'À trier',
}

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [EntryStatus, string][]
```

- [ ] **Step 2: Layout et navigation**

Remplacer `src/app/layout.tsx` :

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'NextPlay',
  description: 'Ma bibliothèque de jeux de toute une vie',
}

const NAV = [
  { href: '/', label: 'Accueil' },
  { href: '/jeux', label: 'Tous les jeux' },
  { href: '/ajouter', label: 'Ajouter' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-emerald-400">
              NextPlay
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-zinc-300 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
```

Remplacer `src/app/page.tsx` par un placeholder (le vrai tableau de bord arrive en Task 10) :

```tsx
export default function HomePage() {
  return <p className="text-zinc-400">Tableau de bord — à venir.</p>
}
```

- [ ] **Step 3: Badge de statut**

Créer `src/components/StatusBadge.tsx` :

```tsx
import type { EntryStatus } from '@prisma/client'
import { STATUS_LABELS } from '@/lib/status'

const COLORS: Record<EntryStatus, string> = {
  FINISHED: 'bg-emerald-900 text-emerald-300',
  PLAYING: 'bg-sky-900 text-sky-300',
  DROPPED: 'bg-red-900 text-red-300',
  PAUSED: 'bg-amber-900 text-amber-300',
  WISHLIST: 'bg-purple-900 text-purple-300',
  TO_SORT: 'bg-zinc-800 text-zinc-300',
}

export function StatusBadge({ status }: { status: EntryStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
```

- [ ] **Step 4: Barre de filtres**

Formulaire GET pur (pas de JS client) : soumettre recharge `/jeux` avec les searchParams. Créer `src/components/LibraryFilterBar.tsx` :

```tsx
import { STATUS_OPTIONS } from '@/lib/status'
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
        <input name="platform" defaultValue={filters.platform ?? ''} placeholder="PC, PS2…" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
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
        Note min.
        <input name="minRating" type="number" min={0} max={10} defaultValue={filters.minRating ?? ''} className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
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
```

- [ ] **Step 5: Page « Tous les jeux » (liste dense + bascule grille)**

Créer `src/app/jeux/page.tsx` :

```tsx
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
```

- [ ] **Step 6: Vérification manuelle**

```bash
npm run db:up && npm run dev
```

Dans le navigateur sur `http://localhost:3000/jeux` : page vide avec message « Aucun jeu » et lien Ajouter. Insérer un jeu de test via la base :

```bash
docker compose -f docker-compose.dev.yml exec db psql -U nextplay -d nextplay -c "
INSERT INTO \"Game\" (id, title, \"releaseYear\", genres, themes, platforms) VALUES ('g1', 'Test Game', 1997, '{RPG}', '{}', '{}');
INSERT INTO \"LibraryEntry\" (id, \"userId\", \"gameId\", status, rating, \"platformsPlayed\", \"updatedAt\") VALUES ('e1', 'default-user', 'g1', 'FINISHED', 9, '{PlayStation}', now());"
```

Vérifier : le jeu apparaît dans la liste ; les filtres (statut Terminé, décennie 1990s, note min 9) le conservent ; un filtre non correspondant le masque ; la bascule Vue grille fonctionne. Puis `npm run lint && npm run build` sans erreur.

- [ ] **Step 7: Commit**

```bash
git add src/app src/components src/lib/status.ts
git commit -m "feat: layout, navigation et page Tous les jeux (liste dense, filtres, grille)"
```

---

### Task 8: Flux d'ajout — unitaire, manuel et mode série

**Files:**
- Create: `src/components/EntryForm.tsx`, `src/components/GameSearch.tsx`
- Create: `src/app/ajouter/page.tsx`, `src/components/AddGameFlow.tsx`
- Test: aucun nouveau test automatique (composants client ; la logique serveur est couverte par Task 6)

**Interfaces:**
- Consumes: `GET /api/igdb/search`, `POST /api/library` (contrats Task 6), `STATUS_OPTIONS`, type `IgdbGame`.
- Produces: composant réutilisable `EntryForm` (props : `initial?: Partial<EntryFormValues>`, `submitLabel: string`, `onSubmit(values: EntryFormValues)`) avec `EntryFormValues = { status: string; rating: string; review: string; platformsPlayed: string; playPeriod: string; estimatedHours: string }` (valeurs brutes de formulaire, converties avant POST). Réutilisé par la fiche jeu (Task 9).

- [ ] **Step 1: Formulaire de vécu personnel (réutilisable)**

Créer `src/components/EntryForm.tsx` :

```tsx
'use client'

import { useState } from 'react'
import { STATUS_OPTIONS } from '@/lib/status'

export type EntryFormValues = {
  status: string
  rating: string
  review: string
  platformsPlayed: string
  playPeriod: string
  estimatedHours: string
}

const EMPTY: EntryFormValues = {
  status: 'FINISHED', rating: '', review: '',
  platformsPlayed: '', playPeriod: '', estimatedHours: '',
}

// Convertit les valeurs brutes du formulaire vers le payload API `personal`.
export function toPersonalPayload(v: EntryFormValues) {
  return {
    status: v.status,
    rating: v.rating === '' ? null : Number(v.rating),
    review: v.review || null,
    platformsPlayed: v.platformsPlayed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    playPeriod: v.playPeriod || null,
    estimatedHours: v.estimatedHours === '' ? null : Number(v.estimatedHours),
  }
}

export function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  busy,
}: {
  initial?: Partial<EntryFormValues>
  submitLabel: string
  onSubmit: (values: EntryFormValues) => void
  busy?: boolean
}) {
  const [values, setValues] = useState<EntryFormValues>({ ...EMPTY, ...initial })
  const set = (field: keyof EntryFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value }))

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(values)
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          Statut
          <select value={values.status} onChange={set('status')} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Note (/10)
          <input type="number" min={0} max={10} value={values.rating} onChange={set('rating')} className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Plateformes jouées
          <input value={values.platformsPlayed} onChange={set('platformsPlayed')} placeholder="PC, PS2" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Période
          <input value={values.playPeriod} onChange={set('playPeriod')} placeholder="2003, vers 2010…" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Heures estimées
          <input type="number" min={0} value={values.estimatedHours} onChange={set('estimatedHours')} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        Avis
        <textarea value={values.review} onChange={set('review')} rows={3} placeholder="Mon avis personnel…" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
      </label>
      <button type="submit" disabled={busy} className="rounded bg-emerald-700 px-4 py-1.5 font-medium hover:bg-emerald-600 disabled:opacity-50">
        {busy ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Recherche IGDB (composant client)**

Créer `src/components/GameSearch.tsx` :

```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { IgdbGame } from '@/lib/igdb'

export function GameSearch({ onSelect }: { onSelect: (game: IgdbGame) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<IgdbGame[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error()
      setResults((await res.json()).results)
    } catch {
      setError('Recherche IGDB indisponible — vous pouvez créer une fiche manuelle ci-dessous.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un jeu (ex. Zelda)…"
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
          autoFocus
        />
        <button type="submit" disabled={loading} className="rounded bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600 disabled:opacity-50">
          {loading ? 'Recherche…' : 'Chercher'}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <ul className="divide-y divide-zinc-800">
        {results.map((game) => (
          <li key={game.igdbId}>
            <button
              type="button"
              onClick={() => onSelect(game)}
              className="flex w-full items-center gap-3 p-2 text-left hover:bg-zinc-900"
            >
              {game.coverUrl ? (
                <Image src={game.coverUrl} alt="" width={40} height={53} className="rounded" />
              ) : (
                <div className="h-[53px] w-[40px] rounded bg-zinc-800" />
              )}
              <span>
                <span className="font-medium">{game.title}</span>
                {game.releaseYear && <span className="ml-2 text-zinc-500">{game.releaseYear}</span>}
                <span className="block text-xs text-zinc-500">{game.genres.join(', ')}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Flux d'ajout complet (unitaire + manuel + mode série)**

Créer `src/components/AddGameFlow.tsx` :

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { IgdbGame } from '@/lib/igdb'
import { GameSearch } from '@/components/GameSearch'
import { EntryForm, toPersonalPayload, type EntryFormValues } from '@/components/EntryForm'

type Feedback = { kind: 'created' | 'merged'; title: string } | null

export function AddGameFlow() {
  const router = useRouter()
  const [selected, setSelected] = useState<IgdbGame | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualYear, setManualYear] = useState('')
  const [serieMode, setSerieMode] = useState(false)
  const [defaults, setDefaults] = useState({ platformsPlayed: '', status: 'FINISHED' })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(values: EntryFormValues) {
    setBusy(true)
    setError(null)
    const body = selected
      ? { igdbId: selected.igdbId, personal: toPersonalPayload(values) }
      : {
          manual: {
            title: manualTitle.trim(),
            releaseYear: manualYear === '' ? null : Number(manualYear),
          },
          personal: toPersonalPayload(values),
        }
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur inconnue')
      const title = selected?.title ?? manualTitle
      setFeedback({ kind: data.created ? 'created' : 'merged', title })
      setSelected(null)
      setManualTitle('')
      setManualYear('')
      if (!serieMode) router.push(`/jeux/${data.entryId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  const formInitial: Partial<EntryFormValues> = serieMode
    ? { platformsPlayed: defaults.platformsPlayed, status: defaults.status }
    : {}

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={serieMode} onChange={(e) => setSerieMode(e.target.checked)} />
        Mode série (enchaîner les ajouts avec des valeurs par défaut)
      </label>
      {serieMode && (
        <div className="flex gap-3 rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <label className="flex flex-col gap-1">
            Plateforme par défaut
            <input
              value={defaults.platformsPlayed}
              onChange={(e) => setDefaults((d) => ({ ...d, platformsPlayed: e.target.value }))}
              placeholder="PS2"
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Statut par défaut
            <select
              value={defaults.status}
              onChange={(e) => setDefaults((d) => ({ ...d, status: e.target.value }))}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            >
              <option value="FINISHED">Terminé</option>
              <option value="DROPPED">Abandonné</option>
              <option value="PAUSED">En pause</option>
              <option value="TO_SORT">À trier</option>
            </select>
          </label>
        </div>
      )}

      {feedback && (
        <p className="rounded bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          {feedback.kind === 'created'
            ? `« ${feedback.title} » ajouté à la bibliothèque.`
            : `« ${feedback.title} » était déjà présent : plateformes fusionnées.`}
        </p>
      )}
      {error && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {!selected && !manualMode && (
        <>
          <GameSearch onSelect={(g) => { setSelected(g); setFeedback(null) }} />
          <button type="button" onClick={() => setManualMode(true)} className="text-sm text-zinc-400 hover:text-white">
            Jeu introuvable ? Créer une fiche manuelle
          </button>
        </>
      )}

      {selected && (
        <div className="space-y-3 rounded border border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {selected.title}
              {selected.releaseYear && <span className="ml-2 text-zinc-500">{selected.releaseYear}</span>}
            </h2>
            <button type="button" onClick={() => setSelected(null)} className="text-sm text-zinc-400 hover:text-white">
              Changer de jeu
            </button>
          </div>
          <EntryForm initial={formInitial} submitLabel="Ajouter à ma bibliothèque" onSubmit={submit} busy={busy} />
        </div>
      )}

      {manualMode && (
        <div className="space-y-3 rounded border border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Fiche manuelle</h2>
            <button type="button" onClick={() => setManualMode(false)} className="text-sm text-zinc-400 hover:text-white">
              Retour à la recherche
            </button>
          </div>
          <div className="flex gap-3 text-sm">
            <label className="flex flex-1 flex-col gap-1">
              Titre *
              <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
            </label>
            <label className="flex flex-col gap-1">
              Année de sortie
              <input type="number" value={manualYear} onChange={(e) => setManualYear(e.target.value)} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
            </label>
          </div>
          <EntryForm initial={formInitial} submitLabel="Créer et ajouter" onSubmit={submit} busy={busy} />
        </div>
      )}
    </div>
  )
}
```

Créer `src/app/ajouter/page.tsx` :

```tsx
import { AddGameFlow } from '@/components/AddGameFlow'

export default function AjouterPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Ajouter un jeu</h1>
      <AddGameFlow />
    </div>
  )
}
```

- [ ] **Step 4: Vérification manuelle**

Prérequis : clés IGDB renseignées dans `.env`. `npm run dev`, puis sur `/ajouter` :

1. Chercher « Hades » → résultats avec jaquettes → sélectionner → remplir statut/note/avis → « Ajouter » → redirection vers la fiche (404 attendu tant que Task 9 n'existe pas : vérifier plutôt que le jeu apparaît dans `/jeux`).
2. Ré-ajouter « Hades » avec une autre plateforme → message « plateformes fusionnées », pas de doublon dans `/jeux`.
3. Cocher Mode série, plateforme par défaut « PS2 » → ajouter deux jeux d'affilée → le formulaire de recherche revient à chaque fois, la plateforme PS2 est pré-remplie, pas de redirection.
4. « Créer une fiche manuelle » → titre + année + statut → apparaît dans `/jeux`.
5. `npm run lint && npm run build` sans erreur.

- [ ] **Step 5: Commit**

```bash
git add src/app/ajouter src/components
git commit -m "feat: flux d'ajout (recherche IGDB, fiche manuelle, mode série)"
```

---

### Task 9: Fiche jeu — consultation, édition, suppression

**Files:**
- Create: `src/app/jeux/[entryId]/page.tsx`, `src/components/EntryDetail.tsx`
- Test: aucun nouveau test automatique (PATCH/DELETE couverts par Task 6)

**Interfaces:**
- Consumes: `getEntryWithGame` (Task 4), `EntryForm`/`toPersonalPayload` (Task 8), `PATCH`/`DELETE /api/library/:entryId` (Task 6), `StatusBadge` (Task 7).
- Produces: page `/jeux/[entryId]`.

- [ ] **Step 1: Composant client d'édition**

Créer `src/components/EntryDetail.tsx` :

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EntryForm, toPersonalPayload, type EntryFormValues } from '@/components/EntryForm'

export function EntryDetail({
  entryId,
  initial,
}: {
  entryId: string
  initial: EntryFormValues
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(values: EntryFormValues) {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/library/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personal: toPersonalPayload(values) }),
    })
    setBusy(false)
    if (!res.ok) {
      setError((await res.json()).error ?? 'Erreur lors de l’enregistrement.')
      return
    }
    setEditing(false)
    router.refresh()
  }

  async function remove() {
    if (!confirm('Supprimer ce jeu de la bibliothèque ?')) return
    const res = await fetch(`/api/library/${entryId}`, { method: 'DELETE' })
    if (res.ok) router.push('/jeux')
  }

  if (!editing) {
    return (
      <div className="flex gap-3">
        <button onClick={() => setEditing(true)} className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700">
          Modifier
        </button>
        <button onClick={remove} className="rounded bg-red-950 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900">
          Supprimer
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <EntryForm initial={initial} submitLabel="Enregistrer" onSubmit={save} busy={busy} />
      <button onClick={() => setEditing(false)} className="text-sm text-zinc-400 hover:text-white">
        Annuler
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Page fiche jeu**

Créer `src/app/jeux/[entryId]/page.tsx` :

```tsx
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getEntryWithGame } from '@/lib/library'
import { StatusBadge } from '@/components/StatusBadge'
import { EntryDetail } from '@/components/EntryDetail'

export const dynamic = 'force-dynamic'

export default async function FicheJeuPage({
  params,
}: {
  params: Promise<{ entryId: string }>
}) {
  const { entryId } = await params
  const entry = await getEntryWithGame(entryId)
  if (!entry) notFound()

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="shrink-0">
        {entry.game.coverUrl ? (
          <Image src={entry.game.coverUrl} alt={entry.game.title} width={264} height={374} className="rounded" />
        ) : (
          <div className="flex h-[374px] w-[264px] items-center justify-center rounded bg-zinc-800 p-4 text-center">
            {entry.game.title}
          </div>
        )}
      </div>
      <div className="flex-1 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">
            {entry.game.title}
            {entry.game.releaseYear && (
              <span className="ml-3 text-lg font-normal text-zinc-500">{entry.game.releaseYear}</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {entry.game.genres.join(', ')}
            {entry.game.igdbRating != null && ` · Note IGDB : ${Math.round(entry.game.igdbRating)}/100`}
          </p>
        </div>
        {entry.game.summary && <p className="text-sm text-zinc-300">{entry.game.summary}</p>}
        <hr className="border-zinc-800" />
        <div className="space-y-2">
          <h2 className="font-semibold">Mon vécu</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={entry.status} />
            <span>{entry.rating != null ? `Ma note : ${entry.rating}/10` : 'Pas encore noté'}</span>
            {entry.platformsPlayed.length > 0 && <span>Joué sur : {entry.platformsPlayed.join(', ')}</span>}
            {entry.playPeriod && <span>Période : {entry.playPeriod}</span>}
            {entry.estimatedHours != null && <span>≈ {entry.estimatedHours} h</span>}
          </div>
          {entry.review && (
            <blockquote className="rounded border-l-2 border-emerald-700 bg-zinc-900 p-3 text-sm">
              {entry.review}
            </blockquote>
          )}
          <EntryDetail
            entryId={entry.id}
            initial={{
              status: entry.status,
              rating: entry.rating?.toString() ?? '',
              review: entry.review ?? '',
              platformsPlayed: entry.platformsPlayed.join(', '),
              playPeriod: entry.playPeriod ?? '',
              estimatedHours: entry.estimatedHours?.toString() ?? '',
            }}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Vérification manuelle**

`npm run dev` : depuis `/jeux`, cliquer un titre → fiche complète (jaquette, métadonnées, vécu). « Modifier » → changer la note → « Enregistrer » → la fiche se rafraîchit. « Supprimer » → confirmation → retour à `/jeux`, jeu disparu. L'ajout unitaire (Task 8) redirige maintenant correctement vers la fiche. `npm run lint && npm run build` sans erreur.

- [ ] **Step 4: Commit**

```bash
git add src/app/jeux src/components/EntryDetail.tsx
git commit -m "feat: fiche jeu (consultation, édition, suppression)"
```

---

### Task 10: Tableau de bord (accueil)

**Files:**
- Create: `src/lib/dashboard.ts`, `src/components/GameRow.tsx`
- Modify: `src/app/page.tsx`
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Consumes: `prisma`, `DEFAULT_USER_ID`, `StatusBadge`, `STATUS_LABELS`.
- Produces:
  ```ts
  export type DashboardData = {
    total: number
    byStatus: Partial<Record<EntryStatus, number>>
    playing: EntryWithGame[]   // status PLAYING, max 10
    toSort: EntryWithGame[]    // status TO_SORT, max 10
    topRated: EntryWithGame[]  // note desc, max 10
    recent: EntryWithGame[]    // ajout récent, max 10
  }
  export async function getDashboard(userId: string): Promise<DashboardData>
  ```
  avec `type EntryWithGame = LibraryEntry & { game: Game }`.

- [ ] **Step 1: Test (échouant)**

Créer `test/dashboard.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addGameFromIgdb } from '@/lib/library'
import { getDashboard } from '@/lib/dashboard'
import type { IgdbGame } from '@/lib/igdb'

const USER = 'test-user'

function fakeGame(igdbId: number, title: string): IgdbGame {
  return {
    igdbId, title, releaseYear: 2020, genres: [],
    coverUrl: null, summary: null, themes: [], platforms: [], igdbRating: null,
  }
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
  await addGameFromIgdb(USER, fakeGame(1, 'A'), { status: 'PLAYING', rating: 7 })
  await addGameFromIgdb(USER, fakeGame(2, 'B'), { status: 'FINISHED', rating: 10 })
  await addGameFromIgdb(USER, fakeGame(3, 'C'), { status: 'TO_SORT' })
})

describe('getDashboard', () => {
  it('agrège total, compteurs par statut et rangées', async () => {
    const d = await getDashboard(USER)
    expect(d.total).toBe(3)
    expect(d.byStatus.PLAYING).toBe(1)
    expect(d.byStatus.FINISHED).toBe(1)
    expect(d.byStatus.TO_SORT).toBe(1)
    expect(d.playing.map((e) => e.game.title)).toEqual(['A'])
    expect(d.toSort.map((e) => e.game.title)).toEqual(['C'])
    expect(d.topRated[0].game.title).toBe('B')
    expect(d.recent).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- test/dashboard.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dashboard'`.

- [ ] **Step 3: Implémenter**

Créer `src/lib/dashboard.ts` :

```ts
import { prisma } from '@/lib/prisma'
import type { EntryStatus, Game, LibraryEntry } from '@prisma/client'

export type EntryWithGame = LibraryEntry & { game: Game }

export type DashboardData = {
  total: number
  byStatus: Partial<Record<EntryStatus, number>>
  playing: EntryWithGame[]
  toSort: EntryWithGame[]
  topRated: EntryWithGame[]
  recent: EntryWithGame[]
}

const ROW = { include: { game: true as const }, take: 10 }

export async function getDashboard(userId: string): Promise<DashboardData> {
  const [grouped, playing, toSort, topRated, recent] = await Promise.all([
    prisma.libraryEntry.groupBy({ by: ['status'], where: { userId }, _count: true }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId, status: 'PLAYING' }, orderBy: { updatedAt: 'desc' } }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId, status: 'TO_SORT' }, orderBy: { createdAt: 'desc' } }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId, rating: { not: null } }, orderBy: { rating: 'desc' } }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId }, orderBy: { createdAt: 'desc' } }),
  ])
  const byStatus: Partial<Record<EntryStatus, number>> = {}
  let total = 0
  for (const g of grouped) {
    byStatus[g.status] = g._count
    total += g._count
  }
  return { total, byStatus, playing, toSort, topRated, recent }
}
```

- [ ] **Step 4: Vérifier le succès**

Run: `npm test -- test/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Rangée de jaquettes réutilisable**

Créer `src/components/GameRow.tsx` :

```tsx
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
```

- [ ] **Step 6: Page d'accueil**

Remplacer `src/app/page.tsx` :

```tsx
import Link from 'next/link'
import { getDashboard } from '@/lib/dashboard'
import { DEFAULT_USER_ID } from '@/lib/user'
import { STATUS_LABELS } from '@/lib/status'
import { GameRow } from '@/components/GameRow'
import type { EntryStatus } from '@prisma/client'

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
        {(Object.entries(d.byStatus) as [EntryStatus, number][]).map(([status, count]) => (
          <Link
            key={status}
            href={`/jeux?status=${status}`}
            className="rounded border border-zinc-800 px-4 py-2 hover:border-zinc-600"
          >
            <p className="text-2xl font-bold">{count}</p>
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
```

- [ ] **Step 7: Vérification manuelle et suite complète**

`npm run dev` : l'accueil affiche les chiffres-clés (cliquables → `/jeux` pré-filtré) et les rangées ; avec une base vide, message de bienvenue. Puis :

```bash
npm test && npm run lint && npm run build
```

Expected: tout passe.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/lib/dashboard.ts src/components/GameRow.tsx test/dashboard.test.ts
git commit -m "feat: tableau de bord (chiffres-clés et rangées thématiques)"
```

---

## Fin du plan 1

À l'issue de ce plan, NextPlay tourne en local (`npm run db:up && npm run dev`) avec : tableau de bord, vue « Tous les jeux » filtrable liste/grille, ajout unitaire via IGDB, fiche manuelle, mode série, fiche jeu éditable, anti-duplication garantie par les tests.

**Plans suivants** (à écrire une fois celui-ci exécuté) :
- Plan 2 : import Steam + page Réglages (spec §5.4).
- Plan 3 : recommandations IA « À quoi jouer ? » (spec §5.5, modèles `Recommendation`).
- Plan 4 : Dockerfile, CI GitHub Actions, manifestes k8s dans le repo homelab (spec §9).
