import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { updateEntry, deleteEntry } from '@/lib/library'
import { validatePersonalPartial } from '@/lib/validate'

type Ctx = { params: Promise<{ entryId: string }> }

// P2025 ("record not found") est la seule erreur Prisma qu'on traduit en 404 ;
// toute autre erreur (DB indisponible, contrainte, etc.) reste une 500.
function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { entryId } = await params
  const body = await req.json().catch(() => null)
  const personal = validatePersonalPartial(body?.personal)
  if (!personal.ok) return NextResponse.json({ error: personal.error }, { status: 400 })
  try {
    await updateEntry(entryId, personal.value)
    return NextResponse.json({ entryId })
  } catch (err) {
    if (isRecordNotFound(err))
      return NextResponse.json({ error: 'Entrée introuvable.' }, { status: 404 })
    return NextResponse.json({ error: 'Erreur serveur inattendue.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { entryId } = await params
  try {
    await deleteEntry(entryId)
    return new Response(null, { status: 204 })
  } catch (err) {
    if (isRecordNotFound(err))
      return NextResponse.json({ error: 'Entrée introuvable.' }, { status: 404 })
    return NextResponse.json({ error: 'Erreur serveur inattendue.' }, { status: 500 })
  }
}
