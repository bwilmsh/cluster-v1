"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const index_1 = require("../src/index");
// Mock Prisma
jest.mock('../src/db', () => ({
    prisma: {
        user: {
            findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', email: 'user@cluster.local', name: 'Default User' }),
            findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'user@cluster.local', name: 'Default User' }),
        },
        agent: {
            findMany: jest.fn().mockResolvedValue([{ id: 'agent-1', name: 'Test Agent', status: 'active', createdAt: new Date() }]),
            findUnique: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Test Agent', setupAnswers: null, memory: null }),
            create: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Test Agent', status: 'setting_up', createdAt: new Date() }),
            update: jest.fn().mockResolvedValue({ id: 'agent-1', name: 'Test Agent', setupAnswers: { q1: 'A' }, status: 'active' }),
            delete: jest.fn().mockResolvedValue({ id: 'agent-1' }),
        },
        message: {
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({ id: 'msg-1', role: 'user', content: 'hello' }),
        },
    },
}));
describe('GET /api/agents', () => {
    it('lists agents', async () => {
        const res = await (0, supertest_1.default)(index_1.app).get('/api/agents');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
describe('POST /api/agents', () => {
    it('creates an agent', async () => {
        const res = await (0, supertest_1.default)(index_1.app).post('/api/agents').send({ name: 'Test Agent' });
        expect(res.status).toBe(201);
        expect(res.body.name).toBe('Test Agent');
    });
    it('returns 400 if name is missing', async () => {
        const res = await (0, supertest_1.default)(index_1.app).post('/api/agents').send({});
        expect(res.status).toBe(400);
    });
});
describe('PATCH /api/agents/:id', () => {
    it('updates setup answers', async () => {
        const res = await (0, supertest_1.default)(index_1.app).patch('/api/agents/agent-1').send({ setupAnswers: { q1: 'A' } });
        expect(res.status).toBe(200);
    });
});
describe('GET /api/agents/:id/messages', () => {
    it('returns messages array', async () => {
        const res = await (0, supertest_1.default)(index_1.app).get('/api/agents/agent-1/messages');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
describe('DELETE /api/agents/:id', () => {
    it('deletes agent', async () => {
        const res = await (0, supertest_1.default)(index_1.app).delete('/api/agents/agent-1');
        expect(res.status).toBe(204);
    });
});
describe('POST /api/agents/generate-questions', () => {
    it('returns 400 if agentName is missing', async () => {
        const res = await (0, supertest_1.default)(index_1.app).post('/api/agents/generate-questions').send({});
        expect(res.status).toBe(400);
    });
});
describe('POST /api/agents/:id/chat', () => {
    it('returns 404 when agent not found', async () => {
        // Override agent mock to return null for this test
        const { prisma } = require('../src/db');
        prisma.agent.findUnique.mockResolvedValueOnce(null);
        const res = await (0, supertest_1.default)(index_1.app).post('/api/agents/nonexistent/chat').send({ message: 'hello' });
        expect(res.status).toBe(404);
    });
});
