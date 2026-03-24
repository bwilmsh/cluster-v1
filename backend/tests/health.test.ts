import request from 'supertest'
import { app } from '../src/index'

// Mock Prisma so PrismaClient is never instantiated without a real DB
jest.mock('../src/db', () => ({
  prisma: {},
}))

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.timestamp).toBeDefined()
  })
})
