import { Router, Request, Response } from 'express'
import { prisma, getDefaultUser } from '../db'
import {
  browseWebsite,
  fillForm,
  clickElement,
  screenshotPage,
  uploadToYouTube,
  postToInstagram,
  postToTikTok,
} from '../services/browser'
import { decrypt } from '../lib/crypto'

export const browseRouter = Router()

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

/** Look up stored credentials for a site domain. Returns decrypted creds or null. */
async function getCredentialsForDomain(userId: string, domain: string) {
  const creds = await prisma.webCredential.findFirst({
    where: { userId, siteUrl: { contains: domain } },
  })
  if (!creds) return null
  return { username: creds.username, password: decrypt(creds.password) }
}

// POST /api/browse — agent calls this to visit a URL with full browser
browseRouter.post('/', async (req: Request, res: Response) => {
  const { url, instructions, screenshot = false, agent_id, agent_name } = req.body

  if (!url || !instructions) {
    return res.status(400).json({ error: 'url and instructions are required' })
  }

  let user: any
  try {
    user = await getDefaultUser()
  } catch {
    return res.status(500).json({ error: 'User not found' })
  }

  const domain = extractDomain(url)
  let credentials = null
  try {
    credentials = await getCredentialsForDomain(user.id, domain)
  } catch {
    // No credentials — continue without
  }

  const result = await browseWebsite({ url, instructions, screenshot, credentials })

  try {
    await prisma.browseActivity.create({
      data: {
        userId: user.id,
        agentId: agent_id ?? null,
        agentName: agent_name ?? null,
        url,
        domain,
        summary: instructions.slice(0, 200),
      },
    })
  } catch {
    // Log failure is non-fatal
  }

  if (result.error) {
    return res.status(200).json({ success: false, error: result.error, content: '' })
  }

  return res.json({ success: true, content: result.content, screenshotBase64: result.screenshotBase64 })
})

// POST /api/browse/fill-form — fill fields on a page and optionally submit
browseRouter.post('/fill-form', async (req: Request, res: Response) => {
  const { url, fields, submitSelector } = req.body
  if (!url || !fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'url and fields (object) are required' })
  }
  try {
    const user = await getDefaultUser()
    const domain = extractDomain(url)
    const credentials = await getCredentialsForDomain(user.id, domain).catch(() => null)
    const result = await fillForm({ url, fields, submitSelector, credentials })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message })
  }
})

// POST /api/browse/click-element — navigate to URL and click a CSS selector
browseRouter.post('/click-element', async (req: Request, res: Response) => {
  const { url, selector } = req.body
  if (!url || !selector) {
    return res.status(400).json({ error: 'url and selector are required' })
  }
  try {
    const user = await getDefaultUser()
    const domain = extractDomain(url)
    const credentials = await getCredentialsForDomain(user.id, domain).catch(() => null)
    const result = await clickElement({ url, selector, credentials })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message })
  }
})

// POST /api/browse/screenshot — take a screenshot and return base64
browseRouter.post('/screenshot', async (req: Request, res: Response) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })
  try {
    const user = await getDefaultUser()
    const domain = extractDomain(url)
    const credentials = await getCredentialsForDomain(user.id, domain).catch(() => null)
    const result = await screenshotPage({ url, credentials })
    if (result.error) return res.json({ success: false, error: result.error })
    res.json({ success: true, screenshotBase64: result.screenshotBase64 })
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message })
  }
})

// POST /api/browse/youtube-upload — upload a video to YouTube using stored credentials
browseRouter.post('/youtube-upload', async (req: Request, res: Response) => {
  const { videoUrl, title, description, tags } = req.body
  if (!videoUrl || !title) {
    return res.status(400).json({ error: 'videoUrl and title are required' })
  }
  try {
    const user = await getDefaultUser()
    const credentials = await getCredentialsForDomain(user.id, 'youtube.com')
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: 'No YouTube credentials found. Add them in the Credentials page (site: youtube.com).',
      })
    }
    const result = await uploadToYouTube({ videoUrl, title, description, tags, credentials })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message })
  }
})

// POST /api/browse/instagram-post — post an image to Instagram using stored credentials
browseRouter.post('/instagram-post', async (req: Request, res: Response) => {
  const { imageUrl, caption } = req.body
  if (!imageUrl || !caption) {
    return res.status(400).json({ error: 'imageUrl and caption are required' })
  }
  try {
    const user = await getDefaultUser()
    const credentials = await getCredentialsForDomain(user.id, 'instagram.com')
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: 'No Instagram credentials found. Add them in the Credentials page (site: instagram.com).',
      })
    }
    const result = await postToInstagram({ imageUrl, caption, credentials })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message })
  }
})

// POST /api/browse/tiktok-post — post a video to TikTok using stored credentials
browseRouter.post('/tiktok-post', async (req: Request, res: Response) => {
  const { videoUrl, caption } = req.body
  if (!videoUrl || !caption) {
    return res.status(400).json({ error: 'videoUrl and caption are required' })
  }
  try {
    const user = await getDefaultUser()
    const credentials = await getCredentialsForDomain(user.id, 'tiktok.com')
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: 'No TikTok credentials found. Add them in the Credentials page (site: tiktok.com).',
      })
    }
    const result = await postToTikTok({ videoUrl, caption, credentials })
    res.json(result)
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message })
  }
})

// GET /api/browse/activity — recent browse history
browseRouter.get('/activity', async (_req, res: Response) => {
  try {
    const user = await getDefaultUser()
    const activities = await prisma.browseActivity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json(activities)
  } catch {
    res.status(500).json({ error: 'Internal server error' })
  }
})
