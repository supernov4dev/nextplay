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

  if (body.igdbId !== undefined) {
    if (!Number.isInteger(body.igdbId))
      return NextResponse.json({ error: 'igdbId doit être un entier.' }, { status: 400 })
    let igdb
    try {
      igdb = await getGameById(body.igdbId)
    } catch (err) {
      console.error('Recherche IGDB en échec :', err)
      return NextResponse.json(
        { error: 'IGDB est indisponible — réessayez plus tard.' },
        { status: 502 },
      )
    }
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
