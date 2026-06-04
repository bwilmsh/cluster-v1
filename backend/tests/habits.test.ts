import request from 'supertest'
import { app } from '../src/index'
import { prisma } from '../src/db'

// Mock Prisma to avoid real DB connection in tests
jest.mock('../src/db', () => ({
  prisma: {
    habit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    habitEntry: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    event: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    automationTemplate: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    automation: {
      findMany: jest.fn(),
    },
  },
  getDefaultUser: jest.fn().mockResolvedValue({ id: 'test-user-id' }),
}))

// Mock the seeding process to avoid DB access
jest.mock('../src/automations/seeder', () => ({
  seedTemplates: jest.fn().mockResolvedValue(undefined),
}))

describe('Habits API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.habitEntry.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.habitEntry.upsert as jest.Mock).mockResolvedValue({
      id: 'habit-entry-1',
      habitId: 'habit-1',
      scheduledDate: new Date(),
      scheduledStart: new Date(),
      scheduledEnd: new Date(),
      status: 'SCHEDULED',
      wasRescheduled: false,
      createdAt: new Date(),
    })
    ;(prisma.event.findFirst as jest.Mock).mockResolvedValue(null)
  })

  describe('POST /api/habits', () => {
    it('creates a habit with materialize enabled by default', async () => {
      const mockHabit = {
        id: 'habit-1',
        userId: 'test-user-id',
        name: 'Morning meditation',
        description: '10 minutes of meditation',
        durationMinutes: 10,
        frequency: 'DAILY',
        idealTime: 'MORNING',
        timeRangeStart: '08:00',
        timeRangeEnd: '08:10',
        daysOfWeek: [],
        isActive: true,
        autoReschedule: true,
        keywords: [],
        priorityLevel: 'MEDIUM',
        cadence: 'daily',
        timeOfDay: '08:00',
        endTime: '08:10',
        timezone: 'UTC',
        color: '#4fb8a8',
        active: true,
        materialize: true,
        rrule: null,
        lastCompleted: null,
        streak: 0,
        longestStreak: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(prisma.habit.create as jest.Mock).mockResolvedValue(mockHabit)
      ;(prisma.event.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.event.create as jest.Mock).mockResolvedValue({ id: 'event-1' })

      const res = await request(app)
        .post('/api/habits')
        .send({
          name: 'Morning meditation',
          description: '10 minutes of meditation',
          durationMinutes: 10,
          cadence: 'daily',
          timeOfDay: '08:00',
          endTime: '08:10',
          timezone: 'UTC',
          color: '#4fb8a8',
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.materialize).toBe(true)
      expect(prisma.habit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Morning meditation',
            materialize: true,
          }),
        })
      )
      expect(prisma.habitEntry.upsert).toHaveBeenCalled()
      expect(prisma.event.create).toHaveBeenCalled()
    })

    it('creates a habit with materialize disabled when specified', async () => {
      const mockHabit = {
        id: 'habit-2',
        userId: 'test-user-id',
        name: 'Evening review',
        description: '15 minutes review',
        durationMinutes: 15,
        frequency: 'DAILY',
        idealTime: 'EVENING',
        timeRangeStart: '21:00',
        timeRangeEnd: '21:15',
        daysOfWeek: [],
        isActive: true,
        autoReschedule: false,
        keywords: [],
        priorityLevel: 'MEDIUM',
        cadence: 'daily',
        timeOfDay: '21:00',
        endTime: '21:15',
        timezone: 'UTC',
        color: '#f59e0b',
        active: true,
        materialize: false,
        rrule: null,
        lastCompleted: null,
        streak: 0,
        longestStreak: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(prisma.habit.create as jest.Mock).mockResolvedValue(mockHabit)

      const res = await request(app)
        .post('/api/habits')
        .send({
          name: 'Evening review',
          description: '15 minutes review',
            durationMinutes: 15,
          cadence: 'daily',
          timeOfDay: '21:00',
          endTime: '21:15',
          materialize: false,
        })

      expect(res.status).toBe(201)
      expect(res.body.data.materialize).toBe(false)
      expect(prisma.habitEntry.upsert).not.toHaveBeenCalled()
      expect(prisma.event.create).not.toHaveBeenCalled()
    })

    it('creates events with habitId when materialize is true', async () => {
      const mockHabit = {
        id: 'habit-3',
        userId: 'test-user-id',
        name: 'Exercise',
        description: 'Daily exercise',
        durationMinutes: 30,
        frequency: 'DAILY',
        idealTime: 'MORNING',
        timeRangeStart: '06:00',
        timeRangeEnd: '06:45',
        daysOfWeek: [],
        isActive: true,
        autoReschedule: true,
        keywords: [],
        priorityLevel: 'HIGH',
        cadence: 'daily',
        timeOfDay: '06:00',
        endTime: '06:45',
        timezone: 'UTC',
        color: '#6366f1',
        active: true,
        materialize: true,
        rrule: null,
        lastCompleted: null,
        streak: 0,
        longestStreak: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      ;(prisma.habit.create as jest.Mock).mockResolvedValue(mockHabit)
      ;(prisma.event.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.event.create as jest.Mock).mockResolvedValue({ id: 'event-2' })

      await request(app)
        .post('/api/habits')
        .send({
          name: 'Exercise',
          description: 'Daily exercise',
            durationMinutes: 30,
          cadence: 'daily',
          timeOfDay: '06:00',
          endTime: '06:45',
          materialize: true,
        })

      expect(prisma.habitEntry.upsert).toHaveBeenCalled()
      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemType: 'habit',
            habitId: 'habit-3',
            habitEntryId: 'habit-entry-1',
          }),
        })
      )
    })
  })

  describe('PATCH /api/habits/:id', () => {
    it('toggles materialize from false to true', async () => {
      const existingHabit = {
        id: 'habit-4',
        userId: 'test-user-id',
        name: 'Reading',
        durationMinutes: 30,
        frequency: 'DAILY',
        idealTime: 'EVENING',
        timeRangeStart: '19:00',
        timeRangeEnd: '19:30',
        daysOfWeek: [],
        isActive: true,
        autoReschedule: true,
        keywords: [],
        priorityLevel: 'MEDIUM',
        materialize: false,
        cadence: 'daily',
        timeOfDay: '19:00',
        endTime: '19:30',
      }

      const updatedHabit = {
        ...existingHabit,
        materialize: true,
      }

      ;(prisma.habit.findFirst as jest.Mock).mockResolvedValue(existingHabit)
      ;(prisma.habit.update as jest.Mock).mockResolvedValue(updatedHabit)
      ;(prisma.event.findMany as jest.Mock).mockResolvedValue([])
      ;(prisma.event.create as jest.Mock).mockResolvedValue({ id: 'event-3' })

      const res = await request(app)
        .patch('/api/habits/habit-4')
        .send({
          materialize: true,
        })

      expect(res.status).toBe(200)
      expect(res.body.data.materialize).toBe(true)
      expect(prisma.habitEntry.upsert).toHaveBeenCalled()
      expect(prisma.event.create).toHaveBeenCalled()
    })

    it('toggles materialize from true to false and deletes events', async () => {
      const existingHabit = {
        id: 'habit-5',
        userId: 'test-user-id',
        name: 'Meditation',
        durationMinutes: 10,
        frequency: 'DAILY',
        idealTime: 'MORNING',
        timeRangeStart: '08:00',
        timeRangeEnd: '08:10',
        daysOfWeek: [],
        isActive: true,
        autoReschedule: true,
        keywords: [],
        priorityLevel: 'MEDIUM',
        materialize: true,
        cadence: 'daily',
        timeOfDay: '08:00',
        endTime: '08:10',
      }

      const updatedHabit = {
        ...existingHabit,
        materialize: false,
      }

      ;(prisma.habit.findFirst as jest.Mock).mockResolvedValue(existingHabit)
      ;(prisma.habit.update as jest.Mock).mockResolvedValue(updatedHabit)
      ;(prisma.event.deleteMany as jest.Mock).mockResolvedValue({ count: 30 })
      ;(prisma.habitEntry.deleteMany as jest.Mock).mockResolvedValue({ count: 30 })

      const res = await request(app)
        .patch('/api/habits/habit-5')
        .send({
          materialize: false,
        })

      expect(res.status).toBe(200)
      expect(res.body.data.materialize).toBe(false)
      expect(prisma.event.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { habitId: 'habit-5' },
        })
      )
      expect(prisma.habitEntry.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { habitId: 'habit-5' },
        })
      )
    })

    it('returns 404 if habit not found', async () => {
      ;(prisma.habit.findFirst as jest.Mock).mockResolvedValue(null)

      const res = await request(app)
        .patch('/api/habits/non-existent')
        .send({
          materialize: false,
        })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Habit not found')
    })
  })

  describe('GET /api/habits', () => {
    it('returns list of habits with materialize field', async () => {
      const mockHabits = [
        {
          id: 'habit-1',
          name: 'Morning meditation',
          materialize: true,
          userId: 'test-user-id',
        },
        {
          id: 'habit-2',
          name: 'Evening review',
          materialize: false,
          userId: 'test-user-id',
        },
      ]

      ;(prisma.habit.findMany as jest.Mock).mockResolvedValue(mockHabits)

      const res = await request(app).get('/api/habits')

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(2)
      expect(res.body.data[0].materialize).toBe(true)
      expect(res.body.data[1].materialize).toBe(false)
    })
  })

  describe('POST /api/habits/:id/complete', () => {
    it('marks habit complete and creates event with habitId', async () => {
      const existingHabit = {
        id: 'habit-6',
        userId: 'test-user-id',
        name: 'Drink water',
        streak: 0,
        longestStreak: 0,
        durationMinutes: 5,
        frequency: 'DAILY',
        idealTime: 'MORNING',
        materialize: true,
      }

      const updatedHabit = {
        ...existingHabit,
        lastCompleted: new Date(),
        streak: 1,
        longestStreak: 1,
      }

      ;(prisma.habit.findFirst as jest.Mock).mockResolvedValue(existingHabit)
      ;(prisma.habit.update as jest.Mock).mockResolvedValue(updatedHabit)
      ;(prisma.event.create as jest.Mock).mockResolvedValue({
        id: 'event-123',
        habitId: 'habit-6',
        status: 'done',
      })

      const res = await request(app)
        .post('/api/habits/habit-6/complete')
        .send({
          occurrence_date: new Date().toISOString(),
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(prisma.habit.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            streak: 1,
            longestStreak: 1,
          }),
        })
      )
      expect(prisma.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            habitId: 'habit-6',
            status: 'done',
          }),
        })
      )
    })
  })
})
