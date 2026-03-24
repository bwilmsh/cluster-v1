import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: 'user@cluster.local' } })
  if (!existing) {
    await prisma.user.create({
      data: {
        email: 'user@cluster.local',
        name: 'Default User',
      },
    })
    console.log('Seeded default user')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
