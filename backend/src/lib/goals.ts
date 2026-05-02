import { prisma } from '../db'

export type GoalRecord = {
  id: string
  goal_text: string
  is_active: boolean
  visible_agent_ids: string[]
  created_at: string
  updated_at: string
}

export type GoalVisibilityContext = {
  goal_text: string
  is_active: boolean
  visible_agent_ids: string[]
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function mapGoal(goal: {
  id: string
  goalText: string
  isActive: boolean
  visibleAgentIds: unknown
  createdAt: Date
  updatedAt: Date
}): GoalRecord {
  return {
    id: goal.id,
    goal_text: goal.goalText,
    is_active: goal.isActive,
    visible_agent_ids: toStringArray(goal.visibleAgentIds),
    created_at: goal.createdAt.toISOString(),
    updated_at: goal.updatedAt.toISOString(),
  }
}

export async function listGoals(userId: string, limit = 20): Promise<GoalRecord[]> {
  const rows = await prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  })

  return rows.map(mapGoal)
}

export async function getCurrentGoal(userId: string): Promise<GoalRecord | null> {
  const row = await prisma.goal.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  return row ? mapGoal(row) : null
}

export async function createCurrentGoal(userId: string, goalText: string, visibleAgentIds: string[]) {
  await prisma.goal.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  })

  const goal = await prisma.goal.create({
    data: {
      userId,
      goalText,
      isActive: true,
      visibleAgentIds,
    },
  })

  return mapGoal(goal)
}

export async function clearCurrentGoals(userId: string) {
  const result = await prisma.goal.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  })

  return result.count
}

export function goalVisibleToAgent(goal: { visibleAgentIds?: unknown }, agentId: string) {
  const ids = toStringArray(goal.visibleAgentIds)
  return ids.length === 0 || ids.includes(agentId)
}

export async function getVisibleGoalsForAgent(userId: string, agentId: string): Promise<GoalVisibilityContext[]> {
  const rows = await prisma.goal.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  return rows
    .filter((goal) => goalVisibleToAgent(goal, agentId))
    .map((goal) => ({
      goal_text: goal.goalText,
      is_active: goal.isActive,
      visible_agent_ids: toStringArray(goal.visibleAgentIds),
    }))
}

export async function getAllGoalsSummary(userId: string, agents: Array<{ id: string; name: string }>) {
  const rows = await prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]))

  return rows.map((goal) => {
    const visibleAgentIds = toStringArray(goal.visibleAgentIds)
    const visibleTo = visibleAgentIds.length === 0
      ? 'all AIs'
      : visibleAgentIds.map((id) => agentNameById.get(id) ?? id).join(', ')

    return {
      goalText: goal.goalText,
      isActive: goal.isActive,
      visibleTo,
      createdAt: goal.createdAt.toISOString(),
    }
  })
}
