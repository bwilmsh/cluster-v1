/**
 * Reads an SSE stream and yields parsed event payloads.
 * Handles both agent chat and group chat SSE formats.
 */
export async function* readSSE(
  url: string,
  body: Record<string, unknown>
): AsyncGenerator<{
  delta?: string
  type?: string
  agentName?: string
  agentId?: string
  error?: string
  from?: string
  to?: string
}> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok || !res.body) {
    throw new Error(`SSE request failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') return
        try {
          yield JSON.parse(payload)
        } catch {
          // skip malformed
        }
      }
    }
  } finally {
    reader.cancel()
  }
}
