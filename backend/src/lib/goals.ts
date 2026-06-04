import { prisma } from '../db'

export type GoalRecord = {
  id: string
  user_id: string
  goal_text: string
  deadline: string | null
  is_active: boolean
  visible_agent_ids: string[]
  created_at: string
  updated_at: string
}

export type GoalVisibilityContext = {
  goal_text: string
  deadline: string | null
  is_active: boolean
  visible_agent_ids: string[]
}

const goalDelegate = prisma.goal as any

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

function isPrismaFieldMismatch(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Unknown argument') || message.includes('Unknown field') || message.includes('Invalid `prisma.goal')
}

function goalHasField(fieldName: string) {
  const model = (prisma as any)?._runtimeDataModel?.models?.Goal
  const fields = Array.isArray(model?.fields) ? model.fields : []
  return fields.some((field: { name?: string }) => field?.name === fieldName)
}

function mapGoal(goal: any): GoalRecord {
  const userId = String(goal.userId ?? goal.user_id ?? '')
  const goalText = String(goal.goalText ?? goal.goal_text ?? '')
  const deadline = goal.deadline ?? null
  const isActive = Boolean(goal.isActive ?? goal.is_active)
  const visibleAgentIds = goal.visibleAgentIds ?? goal.visible_agent_ids
  const createdAt = goal.createdAt ?? goal.created_at
  const updatedAt = goal.updatedAt ?? goal.updated_at

  return {
    id: goal.id,
    user_id: userId,
    goal_text: goalText,
    deadline: deadline ? toIso(deadline) : null,
    is_active: isActive,
    visible_agent_ids: toStringArray(visibleAgentIds),
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt),
  }
}

export async function listGoals(userId: string, limit = 20): Promise<GoalRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100)
  let rows: any[] = []

  try {
    rows = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error
    rows = await goalDelegate.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: safeLimit,
    })
  }

  return rows.map(mapGoal)
}

export async function getCurrentGoal(userId: string): Promise<GoalRecord | null> {
  let row: any = null

  try {
    row = await prisma.goal.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error
    row = await goalDelegate.findFirst({
      where: { user_id: userId, is_active: true },
      orderBy: { created_at: 'desc' },
    })
  }

  return row ? mapGoal(row) : null
}

export async function getGoalById(userId: string, goalId: string): Promise<GoalRecord | null> {
  let row: any = null

  try {
    row = await prisma.goal.findFirst({
      where: { userId, id: goalId },
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error
    row = await goalDelegate.findFirst({
      where: { user_id: userId, id: goalId },
    })
  }

  return row ? mapGoal(row) : null
}

export async function createCurrentGoal(userId: string, goalText: string, visibleAgentIds: string[], deadline: Date | null = null) {
  try {
    await prisma.goal.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    })

    const createData: Record<string, unknown> = {
      userId,
      goalText,
      isActive: true,
      visibleAgentIds,
    }
    if (deadline && goalHasField('deadline')) {
      createData.deadline = deadline
    }

    const goal = await goalDelegate.create({ data: createData })

    return mapGoal(goal)
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error

    await goalDelegate.updateMany({
      where: { user_id: userId, is_active: true },
      data: { is_active: false },
    })

    const legacyData: Record<string, unknown> = {
      user_id: userId,
      goal_text: goalText,
      is_active: true,
      visible_agent_ids: visibleAgentIds,
    }
    if (deadline && goalHasField('deadline')) {
      legacyData.deadline = deadline
    }

    const legacyGoal = await goalDelegate.create({ data: legacyData })

    return mapGoal(legacyGoal)
  }
}

export async function updateGoal(userId: string, goalId: string, updates: { goalText?: string; deadline?: Date | null }) {
  let goal: any = null

  try {
    goal = await prisma.goal.findFirst({
      where: { userId, id: goalId },
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error
    goal = await goalDelegate.findFirst({
      where: { user_id: userId, id: goalId },
    })
  }

  if (!goal) return null

  let updated: any
  try {
    const updateData: Record<string, unknown> = {
      ...(updates.goalText !== undefined ? { goalText: updates.goalText } : {}),
    }
    if (updates.deadline !== undefined && goalHasField('deadline')) {
      updateData.deadline = updates.deadline
    }

    updated = await prisma.goal.update({
      where: { id: goalId },
      data: updateData as any,
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error

    const legacyUpdateData: Record<string, unknown> = {
      ...(updates.goalText !== undefined ? { goal_text: updates.goalText } : {}),
    }
    if (updates.deadline !== undefined && goalHasField('deadline')) {
      legacyUpdateData.deadline = updates.deadline
    }

    updated = await goalDelegate.update({
      where: { id: goalId },
      data: legacyUpdateData,
    })
  }

  return mapGoal(updated)
}

export async function clearCurrentGoals(userId: string) {
  let result: { count: number }

  try {
    result = await prisma.goal.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error
    result = await goalDelegate.updateMany({
      where: { user_id: userId, is_active: true },
      data: { is_active: false },
    })
  }

  return result.count
}

export function goalVisibleToAgent(goal: { visibleAgentIds?: unknown }, agentId: string) {
  const ids = toStringArray(goal.visibleAgentIds)
  return ids.length === 0 || ids.includes(agentId)
}

export async function getVisibleGoalsForAgent(userId: string, agentId: string): Promise<GoalVisibilityContext[]> {
  let rows: any[] = []
  try {
    rows = await prisma.goal.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error
    rows = await goalDelegate.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: { created_at: 'desc' },
    })
  }

  return rows
    .filter((goal) => goalVisibleToAgent(goal, agentId))
    .map((goal) => ({
      goal_text: goal.goalText,
      deadline: goal.deadline ? goal.deadline.toISOString() : null,
      is_active: goal.isActive,
      visible_agent_ids: toStringArray(goal.visibleAgentIds),
    }))
}

export async function getAllGoalsSummary(userId: string, agents: Array<{ id: string; name: string }>) {
  let rows: any[] = []
  try {
    rows = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  } catch (error) {
    if (!isPrismaFieldMismatch(error)) throw error
    rows = await goalDelegate.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    })
  }

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
