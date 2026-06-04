import { RRule } from 'rrule'

export function expandRRule(rruleString: string, options?: { after?: Date; before?: Date; count?: number }) {
  try {
    const rule = RRule.fromString(rruleString)
    const after = options?.after
    const before = options?.before
    const count = options?.count

    if (count) {
      return rule.all((date, i) => i < count)
    }

    return rule.between(after ?? new Date(0), before ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365))
  } catch (e) {
    return [] as Date[]
  }
}
