"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const index_1 = require("../src/index");
// Mock Prisma so PrismaClient is never instantiated without a real DB
jest.mock('../src/db', () => ({
    prisma: {},
}));
describe('GET /api/health', () => {
    it('returns ok status', async () => {
        const res = await (0, supertest_1.default)(index_1.app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.timestamp).toBeDefined();
    });
});
