import fs from 'fs'
import path from 'path'

export interface TemplateVariable {
  key: string
  label: string
  type: 'select' | 'text' | 'number'
  options?: string[]
  default?: string | number
  required?: boolean
  placeholder?: string
}

export interface TemplateStep {
  id: number
  type: 'browse' | 'api' | 'extract' | 'report' | 'send_email' | 'write_sheet' | 'post_slack' | 'notify_chat' | 'alert'
  action: string
  url?: string
  instructions?: string
  credentials_key?: string
  target?: string
  source?: 'browse_result' | 'api_result'
  format?: string
  include?: string[]
  to?: string
  subject_template?: string
  sheet_id_variable?: string
  range?: string
  channel_variable?: string
  condition?: string
  threshold_variable?: string
  provider?: string
  endpoint?: string
  method?: string
  params?: Record<string, string>
}

export interface AutomationTemplateDefinition {
  id: string
  name: string
  description: string
  category: 'social_media' | 'email' | 'analytics' | 'content' | 'alerts'
  icon: string
  requires: string[]
  variables: TemplateVariable[]
  steps: TemplateStep[]
  delivery_options: Array<'chat' | 'group_chat' | 'email' | 'sheets' | 'slack'>
  estimated_duration: string
  ai_recovery: boolean
}

const PREBUILTS_DIR = path.join(__dirname, 'prebuilts')

const cache = new Map<string, AutomationTemplateDefinition>()

export function loadTemplate(id: string): AutomationTemplateDefinition | null {
  if (cache.has(id)) return cache.get(id)!
  const filePath = path.join(PREBUILTS_DIR, `${id}.json`)
  if (!fs.existsSync(filePath)) return null
  try {
    const def = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AutomationTemplateDefinition
    cache.set(id, def)
    return def
  } catch {
    return null
  }
}

export function loadAllTemplates(): AutomationTemplateDefinition[] {
  if (!fs.existsSync(PREBUILTS_DIR)) return []
  return fs.readdirSync(PREBUILTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const id = f.replace('.json', '')
      return loadTemplate(id)
    })
    .filter(Boolean) as AutomationTemplateDefinition[]
}

/** Replace {{variable}} placeholders in a string with resolved values. */
export function interpolate(str: string, variables: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`)
}

/** Resolve all variable defaults + user overrides into a flat key→value map. */
export function resolveVariables(
  template: AutomationTemplateDefinition,
  userVariables: Record<string, string | number>,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const v of template.variables) {
    const val = userVariables[v.key] ?? v.default ?? ''
    resolved[v.key] = String(val)
  }
  return resolved
}
