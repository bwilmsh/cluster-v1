import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { agentsRouter } from './routes/agents'
import { groupChatsRouter } from './routes/groupchats'

dotenv.config({ path: '../.env' })

const app = express()
app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/agents', agentsRouter)
app.use('/api/groupchats', groupChatsRouter)

const PORT = process.env.BACKEND_PORT ?? 3001
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`))

export { app }
