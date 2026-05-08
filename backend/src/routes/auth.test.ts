import request from 'supertest'
import { app } from '../index'
import { prisma } from '../db'

const TEST_EMAIL = 'authtest@cluster.ai'

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.$disconnect()
})

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.email).toBe(TEST_EMAIL)
    expect(res.body.user.plan).toBe('FREE')
  })

  it('rejects duplicate email with 409', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    expect(res.status).toBe(409)
  })

  it('rejects missing fields with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  it('returns token for valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'password123' })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
  })

  it('rejects wrong password with 401', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrongpassword' })
    expect(res.status).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('returns user for valid token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: TEST_EMAIL, password: 'password123' })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe(TEST_EMAIL)
  })

  it('returns 401 with no token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })
})
