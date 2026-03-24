import request from 'supertest'
import { app } from '../src/index'

jest.mock('../src/db', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', email: 'user@cluster.local', name: 'Default User' }),
    },
    groupChat: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'gc-1', name: 'Test Group', members: [] },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'gc-1',
        name: 'Test Group',
        members: [],
      }),
      create: jest.fn().mockResolvedValue({ id: 'gc-1', name: 'Test Group', members: [] }),
    },
    groupChatMember: {
      create: jest.fn().mockResolvedValue({ id: 'member-1', groupChatId: 'gc-1', agentId: 'agent-1', type: 'agent' }),
    },
    groupChatMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    },
  },
}))

describe('GET /api/groupchats', () => {
  it('lists group chats', async () => {
    const res = await request(app).get('/api/groupchats')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/groupchats', () => {
  it('creates a group chat', async () => {
    const res = await request(app).post('/api/groupchats').send({ name: 'Test Group', agentIds: [] })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Test Group')
  })

  it('returns 400 if name is missing', async () => {
    const res = await request(app).post('/api/groupchats').send({})
    expect(res.status).toBe(400)
  })
})

describe('POST /api/groupchats/:id/members', () => {
  it('adds a member', async () => {
    const res = await request(app)
      .post('/api/groupchats/gc-1/members')
      .send({ agentId: 'agent-1', type: 'agent' })
    expect(res.status).toBe(201)
  })
})

describe('GET /api/groupchats/:id/messages', () => {
  it('returns messages array', async () => {
    const res = await request(app).get('/api/groupchats/gc-1/messages')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })
})

describe('POST /api/groupchats/:id/message', () => {
  it('returns 404 when group chat not found', async () => {
    const { prisma } = require('../src/db')
    prisma.groupChat.findUnique.mockResolvedValueOnce(null)
    const res = await request(app)
      .post('/api/groupchats/nonexistent/message')
      .send({ message: 'hello' })
    expect(res.status).toBe(404)
  })
})
