import { Router, Request, Response } from 'express'
import multer from 'multer'
import { prisma } from '../db'

export const filesRouter = Router({ mergeParams: true })

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 }, // 100 KB
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/csv']
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('Only CSV files are supported'))
    }
  },
})

// GET /api/agents/:id/files
filesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const files = await prisma.agentFile.findMany({
      where: { agentId: req.params.id as string },
      select: { id: true, fileName: true, fileType: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(files)
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/agents/:id/files
filesRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const rawContent = req.file.buffer.toString('utf-8')
    // Limit content to ~12k chars (~3k tokens)
    const content = rawContent.slice(0, 12000)

    const file = await prisma.agentFile.create({
      data: {
        agentId: req.params.id as string,
        fileName: req.file.originalname,
        fileType: 'csv',
        content,
      },
    })

    res.status(201).json({ id: file.id, fileName: file.fileName, fileType: file.fileType, createdAt: file.createdAt })
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? 'Upload failed' })
  }
})

// DELETE /api/agents/:id/files/:fileId
filesRouter.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    await prisma.agentFile.delete({ where: { id: req.params.fileId as string } })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' })
  }
})
