import { PrismaClient } from '@prisma/client'

// Singleton : évite d'épuiser les connexions avec le hot-reload de Next.js
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
