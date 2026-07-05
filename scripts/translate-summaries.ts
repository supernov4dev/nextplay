// Traduction par lot des résumés de jeux (anglais → français) via Claude Code
// en mode non-interactif (`claude -p`) — couvert par l'abonnement, zéro coût API.
//
// Usage : npm run translate:fr
// Prérequis : la commande `claude` dans le PATH (Claude Code connecté),
// la base de dev démarrée (npm run db:up).

import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'
import { chunk, buildPrompt, parseTranslations } from '../src/lib/batch-translate'

const prisma = new PrismaClient()
const BATCH_SIZE = 10

function callClaude(prompt: string): string {
  return execFileSync('claude', ['-p', '--output-format', 'text'], {
    input: prompt,
    encoding: 'utf8',
    timeout: 300_000, // 5 min par lot, large
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function main() {
  const games = await prisma.game.findMany({
    where: { summaryTranslated: false, summary: { not: null } },
    select: { id: true, title: true, summary: true },
    orderBy: { createdAt: 'asc' },
  })
  const todo = games.flatMap((g) =>
    g.summary?.trim() ? [{ id: g.id, title: g.title, summary: g.summary }] : [],
  )
  if (todo.length === 0) {
    console.log('Rien à traduire : tous les résumés sont déjà en français.')
    return
  }

  console.log(`${todo.length} résumé(s) à traduire, par lots de ${BATCH_SIZE}…`)
  let done = 0
  for (const lot of chunk(todo, BATCH_SIZE)) {
    const raw = callClaude(buildPrompt(lot.map(({ id, summary }) => ({ id, summary }))))
    const translations = parseTranslations(raw)
    for (const game of lot) {
      const fr = translations.get(game.id)
      if (!fr) {
        console.warn(`  ⚠ pas de traduction reçue pour « ${game.title} » — ignoré`)
        continue
      }
      await prisma.game.update({
        where: { id: game.id },
        data: { summary: fr, summaryTranslated: true },
      })
      done++
      console.log(`  ✓ ${game.title} (${done}/${todo.length})`)
    }
  }
  console.log(`Terminé : ${done}/${todo.length} résumé(s) traduits.`)
}

main()
  .catch((err: unknown) => {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(
        'Commande `claude` introuvable — installe Claude Code ou vérifie le PATH.',
      )
    } else {
      console.error(err)
    }
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
