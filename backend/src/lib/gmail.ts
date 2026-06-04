import { getUserIntegrationContext } from './integrationContext'

type GmailSendInput = {
  to: string
  subject: string
  body: string
}

function toBase64Url(value: string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function getGoogleAccessToken(userId: string): Promise<string | null> {
  const context = await getUserIntegrationContext(userId).catch(() => ({ tokens: {} }))
  const token = context.tokens.google_access_token
  return typeof token === 'string' && token.trim() ? token : null
}

export async function sendGmailMessage(
  userId: string,
  input: GmailSendInput,
): Promise<{ ok: true; messageId: string } | { ok: false; status: number; details: string }> {
  const token = await getGoogleAccessToken(userId)
  if (!token) {
    return { ok: false as const, status: 503, details: 'Google is not connected.' }
  }

  const mimeMessage = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    input.body,
  ].join('\r\n')

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: toBase64Url(mimeMessage) }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    return { ok: false as const, status: response.status, details: details || 'Failed to send Gmail message' }
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string }
  return { ok: true as const, messageId: typeof payload.id === 'string' ? payload.id : '' }
}