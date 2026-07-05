import { NextResponse } from 'next/server'
import { getGameById } from '@/lib/igdb'
import { translateSummary } from '@/lib/translate'

// Résumé IGDB traduit en français pour l'écran d'ajout. La traduction est
// mise en cache par jeu : l'ajout en bibliothèque réutilisera le même texte.
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('igdbId')
  const igdbId = Number(raw)
  if (!raw || !Number.isInteger(igdbId))
    return NextResponse.json({ error: 'igdbId entier requis.' }, { status: 400 })
  try {
    const game = await getGameById(igdbId)
    if (!game)
      return NextResponse.json({ error: 'Jeu introuvable sur IGDB.' }, { status: 404 })
    if (!game.summary) return NextResponse.json({ summary: null })
    return NextResponse.json({ summary: await translateSummary(igdbId, game.summary) })
  } catch {
    return NextResponse.json({ error: 'IGDB est indisponible.' }, { status: 502 })
  }
}
