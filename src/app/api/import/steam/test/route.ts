import { NextResponse } from 'next/server'
import { testSteamConnection, steamErrorToHttp } from '@/lib/import-steam'
import { DEFAULT_USER_ID } from '@/lib/user'

export async function POST() {
  try {
    return NextResponse.json({ gameCount: await testSteamConnection(DEFAULT_USER_ID) })
  } catch (err) {
    const { status, error } = steamErrorToHttp(err)
    return NextResponse.json({ error }, { status })
  }
}
