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
