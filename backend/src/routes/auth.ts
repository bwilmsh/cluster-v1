import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../db'

export const authRouter = Router()

const JWT_SECRET = process.env.JWT_SECRET ?? 'cluster-dev-secret'

function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' })
}

export function verifyToken(token: string): { sub: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string }
}

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Email already registered' })
    return
  }
  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { email, name: email.split('@')[0], passwordHash },
    select: { id: true, email: true, plan: true, createdAt: true },
  })
  const token = signToken(user.id)
  res.status(201).json({ token, user })
})

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' })
    return
  }
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }
  const token = signToken(user.id)
  res.json({
    token,
    user: { id: user.id, email: user.email, plan: user.plan, createdAt: user.createdAt },
  })
})

authRouter.get('/me', async (req: Request, res: Response) => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' })
    return
  }
  try {
    const payload = verifyToken(header.slice(7))
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, plan: true, createdAt: true },
    })
    if (!user) { res.status(401).json({ error: 'User not found' }); return }
    res.json(user)
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
})
