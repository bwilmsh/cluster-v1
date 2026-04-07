import { prisma } from '../db'
import { loadAllTemplates } from './templateLoader'

export async function seedTemplates(): Promise<void> {
  const templates = loadAllTemplates()
  if (templates.length === 0) {
    console.log('Automations: no prebuilt templates found to seed')
    return
  }

  for (const t of templates) {
    await prisma.automationTemplate.upsert({
      where: { id: t.id },
      update: {
        name: t.name,
        description: t.description,
        category: t.category,
        icon: t.icon,
        isOfficial: true,
        isApproved: true,
        definition: t as any,
      },
      create: {
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        icon: t.icon,
        isOfficial: true,
        isApproved: true,
        definition: t as any,
      },
    })
  }

  console.log(`Automations: seeded ${templates.length} prebuilt templates`)
}
