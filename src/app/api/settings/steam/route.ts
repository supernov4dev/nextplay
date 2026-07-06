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
