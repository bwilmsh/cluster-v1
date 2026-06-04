import cron from 'node-cron'
import { prisma, getDefaultUser } from '../db'
import { sendGmailMessage } from '../lib/gmail'

type ScheduledTask = ReturnType<typeof cron.schedule>

let worker: ScheduledTask | null = null
let isProcessing = false

type ScheduledEmailRow = {
  id: string
  userId: string
  to: string
  subject: string
  body: string
  sendAt: Date
}

async function loadDueScheduledEmails(userId: string): Promise<ScheduledEmailRow[]> {
  const scheduledEmailDelegate = (prisma as any).scheduledEmail
  if (scheduledEmailDelegate?.findMany) {
    return scheduledEmailDelegate.findMany({
      where: {
        userId,
        status: 'scheduled',
        sendAt: { lte: new Date() },
      },
      orderBy: { sendAt: 'asc' },
      take: 25,
    })
  }

  return prisma.$queryRaw<ScheduledEmailRow[]>`
    SELECT id, "userId", "to", subject, body, "sendAt"
    FROM "ScheduledEmail"
    WHERE "userId" = ${userId}
      AND status = 'scheduled'
      AND "sendAt" <= ${new Date()}
    ORDER BY "sendAt" ASC
    LIMIT 25
  `
}

async function claimScheduledEmail(id: string): Promise<boolean> {
  const scheduledEmailDelegate = (prisma as any).scheduledEmail
  if (scheduledEmailDelegate?.updateMany) {
    const result = await scheduledEmailDelegate.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'sending', updatedAt: new Date(), error: null },
    })
    return result.count > 0
  }

  const result = await prisma.$executeRaw`
    UPDATE "ScheduledEmail"
    SET status = 'sending', "updatedAt" = ${new Date()}, error = NULL
    WHERE id = ${id} AND status = 'scheduled'
  `
  return result > 0
}

async function markScheduledEmailFailed(id: string, details: string) {
  const scheduledEmailDelegate = (prisma as any).scheduledEmail
  if (scheduledEmailDelegate?.update) {
    await scheduledEmailDelegate.update({
      where: { id },
      data: {
        status: 'failed',
        error: details,
        updatedAt: new Date(),
      },
    })
    return
  }

  await prisma.$executeRaw`
    UPDATE "ScheduledEmail"
    SET status = 'failed', error = ${details}, "updatedAt" = ${new Date()}
    WHERE id = ${id}
  `
}

async function markScheduledEmailSent(id: string, messageId: string | null) {
  const scheduledEmailDelegate = (prisma as any).scheduledEmail
  if (scheduledEmailDelegate?.update) {
    await scheduledEmailDelegate.update({
      where: { id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        gmailMessageId: messageId || null,
        error: null,
        updatedAt: new Date(),
      },
    })
    return
  }

  await prisma.$executeRaw`
    UPDATE "ScheduledEmail"
    SET status = 'sent', "sentAt" = ${new Date()}, "gmailMessageId" = ${messageId || null}, error = NULL, "updatedAt" = ${new Date()}
    WHERE id = ${id}
  `
}

async function processDueScheduledEmails() {
  if (isProcessing) return
  isProcessing = true

  try {
    const user = await getDefaultUser().catch(() => null)
    if (!user) return

    const dueEmails = await loadDueScheduledEmails(user.id)

    for (const email of dueEmails) {
      const claimed = await claimScheduledEmail(email.id)
      if (!claimed) continue

      const result = await sendGmailMessage(user.id, {
        to: email.to,
        subject: email.subject,
        body: email.body,
      })

      if (!result.ok) {
        await markScheduledEmailFailed(email.id, result.details)
        continue
      }

      await markScheduledEmailSent(email.id, result.messageId || null)
    }
  } catch (error) {
    console.error('Scheduled email worker error:', error)
  } finally {
    isProcessing = false
  }
}

export function startScheduledEmailWorker() {
  if (worker) return

  void processDueScheduledEmails()
  worker = cron.schedule('* * * * *', () => {
    void processDueScheduledEmails()
  })

  console.log('Scheduled emails worker started')
}