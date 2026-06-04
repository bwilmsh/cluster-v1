import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { agentsRouter } from './routes/agents'
import { groupChatsRouter } from './routes/groupchats'
import { oauthRouter } from './routes/oauth'
import { oauthConfigRouter } from './routes/oauth-config'
import { widgetsRouter } from './routes/widgets'
import { clusterRouter } from './routes/cluster'
import { browseRouter } from './routes/browse'
import { credentialsRouter } from './routes/credentials'
import { appointmentsRouter } from './routes/appointments'
import { dueDatesRouter } from './routes/dueDates'
import { scheduledEmailsRouter } from './routes/scheduledEmails'
import { schedulerRouter } from './routes/scheduler'
import { memoriesRouter } from './routes/memories'
import { goalsRouter } from './routes/goals'
import { habitsRouter } from './routes/habits'
import { automationsRouter, loadAutomations } from './routes/automations'
import { workflowsRouter } from './routes/workflows'
import { activepiecesRouter } from './routes/activepieces'
import { authRouter } from './routes/auth'
import { dashboardRouter } from './routes/dashboard'
import { loadWorkflows } from './workflows/runner'
import { startScheduledEmailWorker } from './jobs/scheduledEmails'
import { startHabitsWorker } from './jobs/habits'
import { seedTemplates } from './automations/seeder'
import { ensureHabitEventSchema } from './routes/habits'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/agents', agentsRouter)
app.use('/api/groupchats', groupChatsRouter)
app.use('/api/oauth', oauthRouter)
app.use('/api/oauth-config', oauthConfigRouter)
app.use('/api/widgets', widgetsRouter)
app.use('/api/cluster', clusterRouter)
app.use('/api/browse', browseRouter)
app.use('/api/credentials', credentialsRouter)
app.use('/api/appointments', appointmentsRouter)
app.use('/api/due-dates', dueDatesRouter)
app.use('/api/scheduled-emails', scheduledEmailsRouter)
app.use('/api/scheduler', schedulerRouter)
app.use('/api/memories', memoriesRouter)
app.use('/api/goals', goalsRouter)
app.use('/api/habits', habitsRouter)
app.use('/api/automations', automationsRouter)
app.use('/api/workflows', workflowsRouter)
app.use('/api/activepieces', activepiecesRouter)
app.use('/api/auth', authRouter)
app.use('/api/dashboard', dashboardRouter)

const PORT = process.env.BACKEND_PORT ?? 3001

async function bootstrap() {
  await ensureHabitEventSchema()
  app.listen(PORT, async () => {
    console.log(`Backend running on port ${PORT}`)
    await seedTemplates()
    await loadAutomations()
    await loadWorkflows()
    startScheduledEmailWorker()
    startHabitsWorker()
  })
}

void bootstrap()

export { app }
