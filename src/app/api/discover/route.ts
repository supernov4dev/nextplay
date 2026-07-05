import { NextResponse } from 'next/server'
import { discoverGames } from '@/lib/igdb'
import { igdbPlatformIds } from '@/lib/platforms'
import { prisma } from '@/lib/prisma'
import { DEFAULT_USER_ID } from '@/lib/user'

const BATCH = 20

// Deck de découverte : jeux IGDB de la plateforme, moins ceux déjà en
// bibliothèque et ceux marqués « je n'y ai pas joué ».
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  const platform = params.get('platform') ?? ''
  const platformIds = igdbPlatformIds(platform)
  if (platformIds.length === 0)
    return NextResponse.json({ error: 'Plateforme inconnue.' }, { status: 400 })
  const decadeRaw = params.get('decade')
  const decade = decadeRaw ? Number(decadeRaw) : undefined
  if (decade !== undefined && !Number.isInteger(decade))
    return NextResponse.json({ error: 'Décennie invalide.' }, { status: 400 })
  const offset = Math.max(0, Number(params.get('offset')) || 0)

  try {
    const batch = await discoverGames({ platformIds, decade, offset, limit: BATCH })
    const igdbIds = batch.map((g) => g.igdbId)
    const [inLibrary, excluded] = await Promise.all([
      prisma.game.findMany({
        where: {
          igdbId: { in: igdbIds },
          entries: { some: { userId: DEFAULT_USER_ID } },
        },
        select: { igdbId: true },
      }),
      prisma.discoveryExclusion.findMany({
        where: { userId: DEFAULT_USER_ID, igdbId: { in: igdbIds } },
        select: { igdbId: true },
      }),
    ])
    const hidden = new Set([
      ...inLibrary.map((g) => g.igdbId),
      ...excluded.map((e) => e.igdbId),
    ])
    return NextResponse.json({
      results: batch.filter((g) => !hidden.has(g.igdbId)),
      // fin du catalogue quand IGDB renvoie moins qu'un lot complet
      nextOffset: batch.length < BATCH ? null : offset + BATCH,
    })
  } catch (err) {
    console.error('Découverte IGDB en échec :', err)
    return NextResponse.json({ error: 'IGDB est indisponible.' }, { status: 502 })
  }
}
