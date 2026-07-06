// Import Steam : configuration (page Réglages) et orchestration.
// La clé Web API vit en base (app solo auto-hébergée) et ne quitte jamais
// le serveur : getSteamConfig n'expose que l'état, jamais la clé.

import { prisma } from '@/lib/prisma'

export type SteamConfigView = {
  configured: boolean
  accountId: string | null
  lastImportAt: Date | null
}

async function findSource(userId: string) {
  return prisma.importSource.findUnique({
    where: { userId_provider: { userId, provider: 'STEAM' } },
  })
}

export async function getSteamConfig(userId: string): Promise<SteamConfigView> {
  const source = await findSource(userId)
  return {
    configured: source !== null,
    accountId: source?.accountId ?? null,
    lastImportAt: source?.lastImportAt ?? null,
  }
}

const STEAM_ID64_RE = /^\d{17}$/

export async function saveSteamConfig(
  userId: string,
  input: { apiKey?: unknown; accountId: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : ''
  if (!STEAM_ID64_RE.test(accountId))
    return { ok: false, error: 'Le SteamID64 doit comporter 17 chiffres.' }
  const newKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  const existing = await findSource(userId)
  // Clé absente = on conserve l'existante (l'UI ne renvoie jamais la clé stockée)
  const apiKey = newKey || existing?.apiKey
  if (!apiKey) return { ok: false, error: 'La clé Web API est requise.' }
  await prisma.importSource.upsert({
    where: { userId_provider: { userId, provider: 'STEAM' } },
    update: { apiKey, accountId },
    create: { userId, provider: 'STEAM', apiKey, accountId },
  })
  return { ok: true }
}
