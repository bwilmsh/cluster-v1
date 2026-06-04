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
  mode?: string
  agentName?: string
  agentId?: string
  error?: string
  from?: string
  to?: string
}> {
  console.log('[SSE] Starting SSE request to:', url, 'with body:', body)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  console.log('[SSE] Response received:', res.status, res.statusText)
  if (!res.ok || !res.body) {
    console.error('[SSE] Failed: status', res.status, 'body:', res.body)
    throw new Error(`SSE request failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let eventCount = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log('[SSE] Stream ended, received', eventCount, 'events')
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') {
          console.log('[SSE] Received [DONE]')
          return
        }
        try {
          const parsed = JSON.parse(payload)
          eventCount++
          console.log('[SSE] Event #' + eventCount + ':', parsed)
          yield parsed
        } catch (err) {
          console.error('[SSE] Failed to parse payload:', payload, err)
        }
      }
    }
  } finally {
    reader.cancel()
  }
}
