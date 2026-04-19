import { Router, Request, Response } from 'express'

export const memoriesRouter = Router()

type SupabaseMemory = {
  id: number
  customer_id: number
  preference_text: string
  created_at: string
  customers?: { name?: string } | null
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY
  return { supabaseUrl, supabaseKey }
}

memoriesRouter.get('/', async (req: Request, res: Response) => {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig()
  if (!supabaseUrl || !supabaseKey) {
    return res.json({
      data: [],
      warning: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env.',
    })
  }

  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 8), 1), 50)

    const query = new URLSearchParams({
      select: 'id,customer_id,preference_text,created_at,customers(name)',
      order: 'created_at.desc',
      limit: String(limit),
    })

    const response = await fetch(`${supabaseUrl}/rest/v1/memories?${query.toString()}`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const details = await response.text()
      return res.status(response.status).json({
        error: 'Failed to fetch memories from Supabase',
        details,
      })
    }

    const rows = (await response.json()) as SupabaseMemory[]
    const data = rows.map((row) => ({
      id: row.id,
      customer_id: row.customer_id,
      customer_name: row.customers?.name ?? null,
      preference_text: row.preference_text,
      created_at: row.created_at,
    }))

    return res.json(data)
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: 'Internal server error', details })
  }
})
