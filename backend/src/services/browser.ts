import { chromium, Browser, BrowserContext } from 'playwright'

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
    // Navigate with a reasonable timeout
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    // If credentials were provided and there's a login form, attempt auto-login
    if (opts.credentials) {
      await tryAutoLogin(page, opts.credentials)
    }

    // Wait for content to settle
    await page.waitForTimeout(1500)

    // Extract readable text content
    const content = await page.evaluate(() => {
      // Remove scripts and styles
      const cloned = document.cloneNode(true) as Document
      cloned.querySelectorAll('script, style, noscript, svg').forEach((el) => el.remove())
      const body = cloned.querySelector('body')
      if (!body) return ''
      // Get text with reasonable whitespace
      return body.innerText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join('\n')
        .slice(0, 8000)
    })

    // Take screenshot if requested
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
    // Look for common login form patterns
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

    // Submit the form
    const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first()
    if (await submitBtn.count() > 0) {
      await submitBtn.click()
    } else {
      await page.locator(passwordSelector).first().press('Enter')
    }

    // Wait for navigation after login
    await page.waitForTimeout(2000)
  } catch {
    // Auto-login is best-effort; ignore failures
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close()
    browser = null
    browserContext = null
  }
}
