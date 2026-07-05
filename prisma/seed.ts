import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.user.upsert({
    where: { id: 'default-user' },
    update: {},
    create: { id: 'default-user', name: 'Romain' },
  })
  console.log('Utilisateur par défaut seedé.')
}

main().finally(() => prisma.$disconnect())
