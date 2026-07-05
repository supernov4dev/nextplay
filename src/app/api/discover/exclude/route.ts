import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEFAULT_USER_ID } from '@/lib/user'

// « Je n'y ai pas joué » : exclut définitivement le jeu des decks de découverte.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const igdbId = body?.igdbId
  if (!Number.isInteger(igdbId))
    return NextResponse.json({ error: 'igdbId entier requis.' }, { status: 400 })
  await prisma.discoveryExclusion.upsert({
    where: { userId_igdbId: { userId: DEFAULT_USER_ID, igdbId } },
    update: {},
    create: { userId: DEFAULT_USER_ID, igdbId },
  })
  return NextResponse.json({ igdbId }, { status: 201 })
}
