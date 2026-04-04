import { chromium, Browser, BrowserContext } from 'playwright'
import os from 'os'
import fs from 'fs'
import path from 'path'

let browser: Browser | null = null
let browserContext: BrowserContext | null = null

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    browserContext = null
  }
  return browser
}

async function getContext(): Promise<BrowserContext> {
  const b = await getBrowser()
  if (!browserContext) {
    browserContext = await b.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    })
  }
  return browserContext
}

/** Download a URL to a temp file; returns path + cleanup fn. Passes local paths through unchanged. */
async function resolveFile(urlOrPath: string): Promise<{ filePath: string; cleanup: () => void }> {
  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return { filePath: urlOrPath, cleanup: () => {} }
  }
  const response = await fetch(urlOrPath)
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  const ext = path.extname(new URL(urlOrPath).pathname) || '.bin'
  const filePath = path.join(os.tmpdir(), `cluster_${Date.now()}${ext}`)
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()))
  return { filePath, cleanup: () => { try { fs.unlinkSync(filePath) } catch {} } }
}

export interface BrowseOptions {
  url: string
  instructions: string
  screenshot?: boolean
  credentials?: { username: string; password: string } | null
}

export interface BrowseResult {
  content: string
  screenshotBase64?: string
  error?: string
}

export async function browseWebsite(opts: BrowseOptions): Promise<BrowseResult> {
  const ctx = await getContext()
  const page = await ctx.newPage()

  try {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    if (opts.credentials) {
      await tryAutoLogin(page, opts.credentials)
    }

    await page.waitForTimeout(1500)

    const content = await page.evaluate(() => {
      const cloned = document.cloneNode(true) as Document
      cloned.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove())
      const body = cloned.querySelector('body')
      if (!body) return ''
      return body.innerText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join('\n')
        .slice(0, 8000)
    })

    let screenshotBase64: string | undefined
    if (opts.screenshot) {
      const buf = await page.screenshot({ type: 'png', fullPage: false })
      screenshotBase64 = buf.toString('base64')
    }

    return { content, screenshotBase64 }
  } catch (err) {
    return { content: '', error: (err as Error).message }
  } finally {
    await page.close()
  }
}

async function tryAutoLogin(
  page: import('playwright').Page,
  creds: { username: string; password: string }
) {
  try {
    const usernameSelector =
      'input[type="email"], input[type="text"][name*="user"], input[type="text"][name*="email"], input[name="login"], input[id*="user"], input[id*="email"]'
    const passwordSelector = 'input[type="password"]'

    const hasPasswordField = await page.locator(passwordSelector).count() > 0
    if (!hasPasswordField) return

    const usernameField = page.locator(usernameSelector).first()
    const hasUsernameField = await usernameField.count() > 0
    if (!hasUsernameField) return

    await usernameField.fill(creds.username)
    await page.locator(passwordSelector).first().fill(creds.password)

    const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first()
    if (await submitBtn.count() > 0) {
      await submitBtn.click()
    } else {
      await page.locator(passwordSelector).first().press('Enter')
    }

    await page.waitForTimeout(2000)
  } catch {
    // Best-effort; ignore failures
  }
}

// ─── Generic browser actions ──────────────────────────────────────────────────

/** Fill form fields on a page and optionally submit. fields is { cssSelector: value }. */
export async function fillForm(opts: {
  url: string
  fields: Record<string, string>
  submitSelector?: string
  credentials?: { username: string; password: string } | null
}): Promise<{ success: boolean; message: string }> {
  const ctx = await getContext()
  const page = await ctx.newPage()
  try {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (opts.credentials) await tryAutoLogin(page, opts.credentials)
    await page.waitForTimeout(1000)

    for (const [selector, value] of Object.entries(opts.fields)) {
      const el = page.locator(selector).first()
      if (await el.count() > 0) {
        await el.fill(value)
      } else {
        return { success: false, message: `Field not found: ${selector}` }
      }
    }

    if (opts.submitSelector) {
      const btn = page.locator(opts.submitSelector).first()
      if (await btn.count() > 0) {
        await btn.click()
        await page.waitForTimeout(2000)
      } else {
        return { success: false, message: `Submit element not found: ${opts.submitSelector}` }
      }
    }

    return { success: true, message: `Form filled on ${opts.url}` }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  } finally {
    await page.close()
  }
}

/** Navigate to a URL and click a CSS selector. */
export async function clickElement(opts: {
  url: string
  selector: string
  credentials?: { username: string; password: string } | null
}): Promise<{ success: boolean; message: string }> {
  const ctx = await getContext()
  const page = await ctx.newPage()
  try {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (opts.credentials) await tryAutoLogin(page, opts.credentials)
    await page.waitForTimeout(1000)

    const el = page.locator(opts.selector).first()
    if (await el.count() === 0) {
      return { success: false, message: `Element not found: ${opts.selector}` }
    }
    await el.click()
    await page.waitForTimeout(1000)
    return { success: true, message: `Clicked: ${opts.selector} on ${opts.url}` }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  } finally {
    await page.close()
  }
}

/** Take a screenshot of a URL and return it as base64. */
export async function screenshotPage(opts: {
  url: string
  credentials?: { username: string; password: string } | null
}): Promise<{ screenshotBase64?: string; error?: string }> {
  const ctx = await getContext()
  const page = await ctx.newPage()
  try {
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    if (opts.credentials) await tryAutoLogin(page, opts.credentials)
    await page.waitForTimeout(1500)
    const buf = await page.screenshot({ type: 'png', fullPage: false })
    return { screenshotBase64: buf.toString('base64') }
  } catch (err) {
    return { error: (err as Error).message }
  } finally {
    await page.close()
  }
}

// ─── Social media automation ──────────────────────────────────────────────────
// Each function creates an isolated browser context so sessions don't bleed.
// Credentials come from the database (passed in by the route handler).

/** Upload a video to YouTube Studio. videoUrl may be an https URL or local server path. */
export async function uploadToYouTube(opts: {
  videoUrl: string
  title: string
  description?: string
  tags?: string[]
  credentials: { username: string; password: string }
}): Promise<{ success: boolean; message: string }> {
  const b = await getBrowser()
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await ctx.newPage()
  const { filePath, cleanup } = await resolveFile(opts.videoUrl)

  try {
    // Google sign-in
    await page.goto('https://accounts.google.com/signin/v2/identifier', { waitUntil: 'networkidle', timeout: 30000 })
    await page.fill('input[type="email"]', opts.credentials.username)
    await page.click('#identifierNext, button:has-text("Next")')
    await page.waitForSelector('input[type="password"]', { timeout: 12000 })
    await page.fill('input[type="password"]', opts.credentials.password)
    await page.click('#passwordNext, button:has-text("Next")')
    await page.waitForTimeout(4000)

    // Navigate to YouTube Studio upload
    await page.goto('https://studio.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // Open upload dialog via the Create button
    await page.click('ytcp-button#create-icon, button:has-text("Create"), [aria-label*="Create"]')
    await page.waitForTimeout(1000)
    const uploadOption = page.locator('tp-yt-paper-item:has-text("Upload"), [test-id="upload-beta-button"]').first()
    if (await uploadOption.count() > 0) await uploadOption.click()
    await page.waitForTimeout(1500)

    // Set file on the hidden input
    const fileInput = await page.$('input[type="file"]')
    if (!fileInput) return { success: false, message: 'YouTube upload input not found — Studio UI may have changed' }
    await fileInput.setInputFiles(filePath)
    await page.waitForTimeout(4000) // wait for upload dialog

    // Title
    const titleField = page.locator('#textbox[aria-label*="Title"], ytcp-mention-textbox[label*="Title"] #textbox').first()
    if (await titleField.count() > 0) {
      await titleField.click({ clickCount: 3 })
      await titleField.fill(opts.title)
    }

    // Description
    if (opts.description) {
      const descField = page.locator('#textbox[aria-label*="Description"], ytcp-mention-textbox[label*="Description"] #textbox').first()
      if (await descField.count() > 0) {
        await descField.click()
        await descField.fill(opts.description)
      }
    }

    // Click Next x3 to get past all wizard steps
    for (let i = 0; i < 3; i++) {
      const nextBtn = page.locator('#next-button, ytcp-button:has-text("Next")').first()
      if (await nextBtn.count() > 0) {
        await nextBtn.click()
        await page.waitForTimeout(1500)
      }
    }

    // Publish / Save
    const publishBtn = page.locator('#done-button, ytcp-button:has-text("Publish"), ytcp-button:has-text("Save")').first()
    if (await publishBtn.count() > 0) {
      await publishBtn.click()
      await page.waitForTimeout(5000)
      return { success: true, message: `Video "${opts.title}" submitted to YouTube` }
    }

    return { success: false, message: 'Could not find Publish button — video may still be uploading or processing' }
  } catch (err) {
    return { success: false, message: `YouTube upload error: ${(err as Error).message}` }
  } finally {
    cleanup()
    await page.close()
    await ctx.close()
  }
}

/** Post an image to Instagram. imageUrl may be an https URL or local server path. */
export async function postToInstagram(opts: {
  imageUrl: string
  caption: string
  credentials: { username: string; password: string }
}): Promise<{ success: boolean; message: string }> {
  const b = await getBrowser()
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await ctx.newPage()
  const { filePath, cleanup } = await resolveFile(opts.imageUrl)

  try {
    await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)

    await page.fill('input[name="username"]', opts.credentials.username)
    await page.fill('input[name="password"]', opts.credentials.password)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(4000)

    // Dismiss any "Save your login info?" dialog
    const notNow = page.locator('button:has-text("Not now"), button:has-text("Not Now")').first()
    if (await notNow.count() > 0) { await notNow.click(); await page.waitForTimeout(1000) }

    // Click New Post (the + icon or Create button)
    const createBtn = page.locator('svg[aria-label="New post"], a[href="/create/style/"], [aria-label*="New post"]').first()
    if (await createBtn.count() === 0) return { success: false, message: 'Instagram new post button not found' }
    await createBtn.click()
    await page.waitForTimeout(1500)

    // File upload input
    const fileInput = await page.$('input[type="file"]')
    if (!fileInput) return { success: false, message: 'Instagram file input not found' }
    await fileInput.setInputFiles(filePath)
    await page.waitForTimeout(2000)

    // Next → Next → caption → Share
    for (let i = 0; i < 2; i++) {
      const nextBtn = page.locator('button:has-text("Next")').first()
      if (await nextBtn.count() > 0) { await nextBtn.click(); await page.waitForTimeout(1500) }
    }

    const captionBox = page.locator('textarea[placeholder*="caption"], div[role="textbox"][aria-label*="caption"]').first()
    if (await captionBox.count() > 0) await captionBox.fill(opts.caption)

    const shareBtn = page.locator('button:has-text("Share")').first()
    if (await shareBtn.count() > 0) {
      await shareBtn.click()
      await page.waitForTimeout(4000)
      return { success: true, message: 'Posted to Instagram' }
    }

    return { success: false, message: 'Share button not found — post may have been submitted' }
  } catch (err) {
    return { success: false, message: `Instagram post error: ${(err as Error).message}` }
  } finally {
    cleanup()
    await page.close()
    await ctx.close()
  }
}

/** Post a video to TikTok. videoUrl may be an https URL or local server path. */
export async function postToTikTok(opts: {
  videoUrl: string
  caption: string
  credentials: { username: string; password: string }
}): Promise<{ success: boolean; message: string }> {
  const b = await getBrowser()
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await ctx.newPage()
  const { filePath, cleanup } = await resolveFile(opts.videoUrl)

  try {
    // Login via email
    await page.goto('https://www.tiktok.com/login/phone-or-email/email', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    await page.fill('input[name="username"]', opts.credentials.username)
    await page.fill('input[type="password"]', opts.credentials.password)
    await page.click('button[type="submit"], button:has-text("Log in")')
    await page.waitForTimeout(5000)

    // TikTok Studio upload page
    await page.goto('https://www.tiktok.com/upload', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    const fileInput = await page.$('input[type="file"]')
    if (!fileInput) return { success: false, message: 'TikTok upload input not found' }
    await fileInput.setInputFiles(filePath)
    await page.waitForTimeout(6000) // video processing

    // Caption field (TikTok uses contenteditable)
    const captionField = page.locator('[contenteditable="true"]').first()
    if (await captionField.count() > 0) {
      await captionField.click({ clickCount: 3 })
      await captionField.fill(opts.caption)
    }

    const postBtn = page.locator('button[data-e2e="post_video_button"], button:has-text("Post")').first()
    if (await postBtn.count() > 0) {
      await postBtn.click()
      await page.waitForTimeout(5000)
      return { success: true, message: 'Posted to TikTok' }
    }

    return { success: false, message: 'TikTok Post button not found — video may still be processing' }
  } catch (err) {
    return { success: false, message: `TikTok post error: ${(err as Error).message}` }
  } finally {
    cleanup()
    await page.close()
    await ctx.close()
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close()
    browser = null
    browserContext = null
  }
}
