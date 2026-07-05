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
