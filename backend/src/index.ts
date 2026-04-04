import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { agentsRouter } from './routes/agents'
import { groupChatsRouter } from './routes/groupchats'
import { oauthRouter } from './routes/oauth'
import { integrationsRouter } from './routes/integrations'
import { oauthConfigRouter } from './routes/oauth-config'
import { widgetsRouter } from './routes/widgets'
import { clusterRouter } from './routes/cluster'
import { browseRouter } from './routes/browse'
import { credentialsRouter } from './routes/credentials'
import { schedulerRouter, loadAllActiveTasks } from './routes/scheduler'

dotenv.config({ path: '../.env' })

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/agents', agentsRouter)
app.use('/api/groupchats', groupChatsRouter)
app.use('/api/oauth', oauthRouter)
app.use('/api/integrations', integrationsRouter)
app.use('/api/oauth-config', oauthConfigRouter)
app.use('/api/widgets', widgetsRouter)
app.use('/api/cluster', clusterRouter)
app.use('/api/browse', browseRouter)
app.use('/api/credentials', credentialsRouter)
app.use('/api/scheduler', schedulerRouter)

const PORT = process.env.BACKEND_PORT ?? 3001
app.listen(PORT, async () => {
  console.log(`Backend running on port ${PORT}`)
  await loadAllActiveTasks()
})

export { app }
