import { prisma } from '@/lib/prisma'
import type { EntryStatus, Game, LibraryEntry } from '@prisma/client'

export type EntryWithGame = LibraryEntry & { game: Game }

export type DashboardData = {
  total: number
  byStatus: Partial<Record<EntryStatus, number>>
  playing: EntryWithGame[]
  toSort: EntryWithGame[]
  topRated: EntryWithGame[]
  recent: EntryWithGame[]
}

const ROW = { include: { game: true as const }, take: 10 }

export async function getDashboard(userId: string): Promise<DashboardData> {
  const [grouped, playing, toSort, topRated, recent] = await Promise.all([
    prisma.libraryEntry.groupBy({ by: ['status'], where: { userId }, _count: true }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId, status: 'PLAYING' }, orderBy: { updatedAt: 'desc' } }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId, status: 'TO_SORT' }, orderBy: { createdAt: 'desc' } }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId, rating: { not: null } }, orderBy: { rating: 'desc' } }),
    prisma.libraryEntry.findMany({ ...ROW, where: { userId }, orderBy: { createdAt: 'desc' } }),
  ])
  const byStatus: Partial<Record<EntryStatus, number>> = {}
  let total = 0
  for (const g of grouped) {
    byStatus[g.status] = g._count
    total += g._count
  }
  return { total, byStatus, playing, toSort, topRated, recent }
}
