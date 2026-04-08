"""Tool definitions and execution for agent integrations."""

import json
import os
import re
import httpx

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")

# ─── Tool schemas (passed to Claude) ─────────────────────────────────────────

BROWSE_WEBSITE_TOOL = {
    "name": "browse_website",
    "description": (
        "Visit any website using a real browser, read its content, click buttons, "
        "fill forms, and extract data. Use when you need to interact with a site or "
        "when read_page_content fails on JavaScript-heavy pages. "
        "Returns the page text. Examples: check prices, read dashboards, submit forms."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full URL to visit"},
            "instructions": {"type": "string", "description": "What to do or extract — be specific"},
            "screenshot": {"type": "boolean", "description": "Capture a screenshot (default false)"},
        },
        "required": ["url", "instructions"],
    },
}

# Anthropic native web search — executed server-side, no API key needed
WEB_SEARCH_NATIVE_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
}

READ_PAGE_CONTENT_TOOL = {
    "name": "read_page_content",
    "description": (
        "Fetch and return the text content of a URL without a full browser. "
        "Fast and lightweight — use for articles, documentation, and static pages. "
        "For JS-heavy sites or pages requiring login, use browse_website instead."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "Full URL to fetch"},
        },
        "required": ["url"],
    },
}

SEND_EMAIL_TOOL = {
    "name": "send_email",
    "description": "Send an email on behalf of the user.",
    "input_schema": {
        "type": "object",
        "properties": {
            "to": {"type": "string", "description": "Recipient email address"},
            "subject": {"type": "string", "description": "Email subject line"},
            "body": {"type": "string", "description": "Plain text email body"},
        },
        "required": ["to", "subject", "body"],
    },
}

FILL_FORM_TOOL = {
    "name": "fill_form",
    "description": (
        "Navigate to a URL and fill in form fields using CSS selectors, then optionally submit. "
        "Use this to automate any web form — contact forms, login flows, data entry, etc."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL of the page with the form"},
            "fields": {
                "type": "object",
                "description": "Map of CSS selector → value, e.g. {'input[name=email]': 'user@example.com'}",
                "additionalProperties": {"type": "string"},
            },
            "submit_selector": {
                "type": "string",
                "description": "CSS selector of the submit button (optional)",
            },
        },
        "required": ["url", "fields"],
    },
}

CLICK_ELEMENT_TOOL = {
    "name": "click_element",
    "description": "Navigate to a URL and click a specific element identified by CSS selector.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL of the page"},
            "selector": {"type": "string", "description": "CSS selector of the element to click"},
        },
        "required": ["url", "selector"],
    },
}

SCREENSHOT_PAGE_TOOL = {
    "name": "screenshot_page",
    "description": "Take a screenshot of a webpage and return it as a base64 image.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to screenshot"},
        },
        "required": ["url"],
    },
}

UPLOAD_TO_YOUTUBE_TOOL = {
    "name": "upload_to_youtube",
    "description": (
        "Upload a video to YouTube using the user's stored YouTube credentials. "
        "videoUrl can be an https URL to download or a local server file path. "
        "Requires youtube.com credentials saved in the Credentials page."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "video_url": {"type": "string", "description": "URL or local path of the video file"},
            "title": {"type": "string", "description": "Video title"},
            "description": {"type": "string", "description": "Video description"},
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of tags",
            },
        },
        "required": ["video_url", "title"],
    },
}

POST_TO_INSTAGRAM_TOOL = {
    "name": "post_to_instagram",
    "description": (
        "Post an image to Instagram using the user's stored credentials. "
        "imageUrl can be an https URL or local server file path. "
        "Requires instagram.com credentials saved in the Credentials page."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "image_url": {"type": "string", "description": "URL or local path of the image"},
            "caption": {"type": "string", "description": "Post caption"},
        },
        "required": ["image_url", "caption"],
    },
}

POST_TO_TIKTOK_TOOL = {
    "name": "post_to_tiktok",
    "description": (
        "Post a video to TikTok using the user's stored credentials. "
        "videoUrl can be an https URL or local server file path. "
        "Requires tiktok.com credentials saved in the Credentials page."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "video_url": {"type": "string", "description": "URL or local path of the video"},
            "caption": {"type": "string", "description": "Video caption/description"},
        },
        "required": ["video_url", "caption"],
    },
}

RUN_SCHEDULED_SUMMARY_TOOL = {
    "name": "run_scheduled_summary",
    "description": (
        "Format collected data into a clean, structured summary. "
        "Call this at the end of a scheduled task to present findings clearly."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Summary heading"},
            "findings": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Key findings or data points, one per item",
            },
            "conclusion": {"type": "string", "description": "Overall takeaway or recommendation (optional)"},
        },
        "required": ["title", "findings"],
    },
}

LIST_GMAIL_MESSAGES_TOOL = {
    "name": "list_gmail_messages",
    "description": (
        "List recent Gmail messages with subject, sender, date, and preview. "
        "Use this to check unread emails, find important threads, or get an inbox overview for a morning report. "
        "Returns a list with message IDs you can pass to read_gmail_message."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": (
                    "Gmail search query. Examples: 'is:unread', 'is:important', "
                    "'newer_than:1d', 'from:client@example.com'. Leave empty for recent inbox."
                ),
            },
            "max_results": {
                "type": "integer",
                "description": "Number of emails to return (default 15, max 30)",
            },
        },
        "required": [],
    },
}

READ_GMAIL_MESSAGE_TOOL = {
    "name": "read_gmail_message",
    "description": (
        "Read the full text content of a specific Gmail message. "
        "Get message IDs from list_gmail_messages first."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "message_id": {"type": "string", "description": "Gmail message ID from list_gmail_messages"},
        },
        "required": ["message_id"],
    },
}

READ_SHEET_TOOL = {
    "name": "read_sheet",
    "description": "Read data from a Google Sheet. Returns the cell values as CSV text.",
    "input_schema": {
        "type": "object",
        "properties": {
            "sheet_id": {"type": "string", "description": "The Google Sheet ID or full URL"},
            "range": {"type": "string", "description": "Cell range, e.g. 'Sheet1!A1:D20'"},
        },
        "required": ["sheet_id"],
    },
}

WRITE_SHEET_TOOL = {
    "name": "write_sheet",
    "description": "Write or append rows to a Google Sheet.",
    "input_schema": {
        "type": "object",
        "properties": {
            "sheet_id": {"type": "string", "description": "The Google Sheet ID or full URL"},
            "range": {"type": "string", "description": "Target range, e.g. 'Sheet1!A1'"},
            "values": {
                "type": "array",
                "items": {"type": "array"},
                "description": "2D array of values to write",
            },
        },
        "required": ["sheet_id", "range", "values"],
    },
}

CREATE_CALENDAR_EVENT_TOOL = {
    "name": "create_calendar_event",
    "description": "Create a Google Calendar event.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "start": {"type": "string", "description": "ISO 8601 datetime, e.g. '2025-06-01T14:00:00'"},
            "end": {"type": "string", "description": "ISO 8601 datetime"},
            "description": {"type": "string"},
            "timezone": {"type": "string", "description": "IANA timezone, e.g. 'America/New_York'"},
        },
        "required": ["title", "start", "end"],
    },
}

SEND_SLACK_MESSAGE_TOOL = {
    "name": "send_slack_message",
    "description": "Send a message to a Slack channel.",
    "input_schema": {
        "type": "object",
        "properties": {
            "channel": {"type": "string", "description": "Channel name (e.g. #general) or channel ID"},
            "message": {"type": "string", "description": "Message text"},
        },
        "required": ["channel", "message"],
    },
}

CREATE_NOTION_PAGE_TOOL = {
    "name": "create_notion_page",
    "description": "Create a new page in a Notion database.",
    "input_schema": {
        "type": "object",
        "properties": {
            "database_id": {"type": "string", "description": "Notion database ID"},
            "title": {"type": "string", "description": "Page title"},
            "content": {"type": "string", "description": "Page body content (plain text)"},
        },
        "required": ["database_id", "title"],
    },
}


# ─── Tool registry ────────────────────────────────────────────────────────────

def get_available_tools(integrations: dict) -> list:
    """Return tool definitions based on available integrations and env config."""
    # Always available — no OAuth or credentials required
    tools = [
        WEB_SEARCH_NATIVE_TOOL,
        BROWSE_WEBSITE_TOOL,
        READ_PAGE_CONTENT_TOOL,
        FILL_FORM_TOOL,
        CLICK_ELEMENT_TOOL,
        SCREENSHOT_PAGE_TOOL,
        UPLOAD_TO_YOUTUBE_TOOL,
        POST_TO_INSTAGRAM_TOOL,
        POST_TO_TIKTOK_TOOL,
        RUN_SCHEDULED_SUMMARY_TOOL,
    ]

    # Email: SMTP (env vars) or Google OAuth
    if os.environ.get("GMAIL_USER") or integrations.get("google_access_token"):
        tools.append(SEND_EMAIL_TOOL)

    # Google OAuth tools
    if integrations.get("google_access_token"):
        tools.extend([
            LIST_GMAIL_MESSAGES_TOOL,
            READ_GMAIL_MESSAGE_TOOL,
            READ_SHEET_TOOL,
            WRITE_SHEET_TOOL,
            CREATE_CALENDAR_EVENT_TOOL,
        ])

    if integrations.get("slack_token"):
        tools.append(SEND_SLACK_MESSAGE_TOOL)

    if integrations.get("notion_token"):
        tools.append(CREATE_NOTION_PAGE_TOOL)

    return tools


# ─── Tool execution ───────────────────────────────────────────────────────────

def execute_tool(name: str, inputs: dict, integrations: dict) -> str:
    """Execute a tool by name and return a concise string result."""
    try:
        # Native tools are executed server-side by Anthropic — nothing to do client-side
        if name == "web_search":
            return ""

        # Core browser tools
        if name == "browse_website":
            return _browse_website(inputs, integrations)
        elif name == "read_page_content":
            return _read_page_content(inputs)
        elif name == "fill_form":
            return _fill_form(inputs)
        elif name == "click_element":
            return _click_element(inputs)
        elif name == "screenshot_page":
            return _screenshot_page(inputs)

        # Social media automation
        elif name == "upload_to_youtube":
            return _upload_to_youtube(inputs)
        elif name == "post_to_instagram":
            return _post_to_instagram(inputs)
        elif name == "post_to_tiktok":
            return _post_to_tiktok(inputs)

        # Utility
        elif name == "run_scheduled_summary":
            return _run_scheduled_summary(inputs)

        # Email
        elif name == "send_email":
            if os.environ.get("GMAIL_USER"):
                return _send_email_smtp(inputs)
            elif integrations.get("google_access_token"):
                return _send_email_oauth(inputs, integrations["google_access_token"])
            else:
                return "Email not configured. Set GMAIL_USER and GMAIL_PASSWORD in .env, or connect Google."

        # Google OAuth tools
        elif name == "list_gmail_messages":
            return _list_gmail_messages(inputs, integrations["google_access_token"])
        elif name == "read_gmail_message":
            return _read_gmail_message(inputs, integrations["google_access_token"])
        elif name == "read_sheet":
            return _read_sheet(inputs, integrations["google_access_token"])
        elif name == "write_sheet":
            return _write_sheet(inputs, integrations["google_access_token"])
        elif name == "create_calendar_event":
            return _create_calendar_event(inputs, integrations["google_access_token"])

        # Messaging
        elif name == "send_slack_message":
            return _send_slack_message(inputs, integrations["slack_token"])
        elif name == "create_notion_page":
            return _create_notion_page(inputs, integrations["notion_token"])

        else:
            return f"Unknown tool: {name}"
    except Exception as e:
        return f"Tool error ({name}): {str(e)[:300]}"


# ─── Executor implementations ─────────────────────────────────────────────────

def _browse_website(inputs: dict, integrations: dict) -> str:
    payload = {
        "url": inputs["url"],
        "instructions": inputs["instructions"],
        "screenshot": inputs.get("screenshot", False),
        "agent_id": integrations.get("agent_id"),
        "agent_name": integrations.get("agent_name"),
    }
    r = httpx.post(f"{BACKEND_URL}/api/browse", json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        return f"Browse failed: {data.get('error', 'Unknown error')}"
    content = data.get("content", "")
    return f"[Page content from {inputs['url']}]\n\n{content}" if content else "Page loaded but no text content found."


def _read_page_content(inputs: dict) -> str:
    from bs4 import BeautifulSoup
    url = inputs["url"]
    # Realistic browser headers to avoid basic bot detection
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
    }
    r = httpx.get(url, headers=headers, timeout=20, follow_redirects=True)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    # Detect Cloudflare / bot-protection pages
    bot_indicators = ["cf-browser-verification", "Just a moment", "DDoS protection by Cloudflare",
                      "Please enable JavaScript", "Enable JavaScript and cookies to continue",
                      "Access denied", "Bot detection", "Ray ID"]
    is_bot_page = any(phrase in r.text for phrase in bot_indicators)

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if is_bot_page:
        if text and len(text) > 100:
            return f"[Warning: Bot protection detected at {url}. Partial content below — use browse_website for full access]\n\n{text[:4000]}"
        return f"Bot/Cloudflare protection at {url}. Use browse_website tool instead, which runs a full browser."

    if not text:
        return f"No readable text content found at {url}"
    return f"[Content from {url}]\n\n{text[:4000]}"


def _fill_form(inputs: dict) -> str:
    payload = {
        "url": inputs["url"],
        "fields": inputs["fields"],
        "submitSelector": inputs.get("submit_selector"),
    }
    r = httpx.post(f"{BACKEND_URL}/api/browse/fill-form", json=payload, timeout=40)
    r.raise_for_status()
    data = r.json()
    return data.get("message", "Form action completed") if data.get("success") else f"Error: {data.get('message')}"


def _click_element(inputs: dict) -> str:
    payload = {"url": inputs["url"], "selector": inputs["selector"]}
    r = httpx.post(f"{BACKEND_URL}/api/browse/click-element", json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data.get("message", "Click completed") if data.get("success") else f"Error: {data.get('message')}"


def _screenshot_page(inputs: dict) -> str:
    payload = {"url": inputs["url"]}
    r = httpx.post(f"{BACKEND_URL}/api/browse/screenshot", json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        return f"Screenshot failed: {data.get('error')}"
    b64 = data.get("screenshotBase64", "")
    return f"[Screenshot captured — base64 length: {len(b64)} chars]" if b64 else "Screenshot taken but no image returned."


def _upload_to_youtube(inputs: dict) -> str:
    payload = {
        "videoUrl": inputs["video_url"],
        "title": inputs["title"],
        "description": inputs.get("description", ""),
        "tags": inputs.get("tags", []),
    }
    r = httpx.post(f"{BACKEND_URL}/api/browse/youtube-upload", json=payload, timeout=120)
    r.raise_for_status()
    data = r.json()
    return data.get("message", "YouTube upload completed") if data.get("success") else f"YouTube upload failed: {data.get('message')}"


def _post_to_instagram(inputs: dict) -> str:
    payload = {"imageUrl": inputs["image_url"], "caption": inputs["caption"]}
    r = httpx.post(f"{BACKEND_URL}/api/browse/instagram-post", json=payload, timeout=90)
    r.raise_for_status()
    data = r.json()
    return data.get("message", "Instagram post completed") if data.get("success") else f"Instagram post failed: {data.get('message')}"


def _post_to_tiktok(inputs: dict) -> str:
    payload = {"videoUrl": inputs["video_url"], "caption": inputs["caption"]}
    r = httpx.post(f"{BACKEND_URL}/api/browse/tiktok-post", json=payload, timeout=120)
    r.raise_for_status()
    data = r.json()
    return data.get("message", "TikTok post completed") if data.get("success") else f"TikTok post failed: {data.get('message')}"


def _run_scheduled_summary(inputs: dict) -> str:
    title = inputs["title"]
    findings = inputs.get("findings", [])
    conclusion = inputs.get("conclusion", "")
    lines = [f"# {title}", ""]
    for i, finding in enumerate(findings, 1):
        lines.append(f"{i}. {finding}")
    if conclusion:
        lines.extend(["", f"Conclusion: {conclusion}"])
    return "\n".join(lines)


def _send_email_smtp(inputs: dict) -> str:
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    gmail_user = os.environ["GMAIL_USER"]
    gmail_password = os.environ["GMAIL_PASSWORD"]

    msg = MIMEMultipart()
    msg["From"] = gmail_user
    msg["To"] = inputs["to"]
    msg["Subject"] = inputs["subject"]
    msg.attach(MIMEText(inputs["body"], "plain"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, gmail_password)
        server.send_message(msg)

    return f"Email sent to {inputs['to']} — subject: {inputs['subject']}"


def _send_email_oauth(inputs: dict, access_token: str) -> str:
    import base64
    from email.mime.text import MIMEText

    msg = MIMEText(inputs["body"])
    msg["To"] = inputs["to"]
    msg["Subject"] = inputs["subject"]
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    r = httpx.post(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json={"raw": raw},
        timeout=15,
    )
    r.raise_for_status()
    return f"Email sent to {inputs['to']} — subject: {inputs['subject']}"


def _extract_gmail_body(payload: dict) -> str:
    """Recursively extract plain text from a Gmail message payload."""
    import base64
    mime_type = payload.get("mimeType", "")

    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")

    if mime_type.startswith("multipart/"):
        parts = payload.get("parts", [])
        # Prefer plain text
        for part in parts:
            if part.get("mimeType") == "text/plain":
                result = _extract_gmail_body(part)
                if result.strip():
                    return result
        # Fall back to HTML
        for part in parts:
            if part.get("mimeType") == "text/html":
                result = _extract_gmail_body(part)
                if result.strip():
                    return result
        # Recurse into nested multipart
        for part in parts:
            result = _extract_gmail_body(part)
            if result.strip():
                return result

    if mime_type == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            html = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            try:
                from bs4 import BeautifulSoup
                return BeautifulSoup(html, "html.parser").get_text(separator="\n")
            except Exception:
                return re.sub(r"<[^>]+>", " ", html)

    return ""


def _list_gmail_messages(inputs: dict, access_token: str) -> str:
    query = inputs.get("query", "")
    max_results = min(int(inputs.get("max_results", 15)), 30)

    params: dict = {"maxResults": max_results}
    if query:
        params["q"] = query

    r = httpx.get(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
        headers=_google_headers(access_token),
        params=params,
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()

    messages = data.get("messages", [])
    if not messages:
        return "No messages found."

    results = []
    for msg in messages[:15]:
        try:
            r2 = httpx.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg['id']}",
                headers=_google_headers(access_token),
                params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
                timeout=10,
            )
            r2.raise_for_status()
            md = r2.json()
            hdrs = {h["name"]: h["value"] for h in md.get("payload", {}).get("headers", [])}
            snippet = md.get("snippet", "")[:150]
            results.append(
                f"[{msg['id']}] {hdrs.get('Date', '')}\n"
                f"  From: {hdrs.get('From', 'Unknown')}\n"
                f"  Subject: {hdrs.get('Subject', '(no subject)')}\n"
                f"  Preview: {snippet}"
            )
        except Exception:
            results.append(f"[{msg['id']}] (could not load)")

    total = data.get("resultSizeEstimate", len(messages))
    return f"{total} message(s) found:\n\n" + "\n\n".join(results)


def _read_gmail_message(inputs: dict, access_token: str) -> str:
    message_id = inputs["message_id"]
    r = httpx.get(
        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}",
        headers=_google_headers(access_token),
        params={"format": "full"},
        timeout=15,
    )
    r.raise_for_status()
    msg = r.json()

    payload = msg.get("payload", {})
    hdrs = {h["name"]: h["value"] for h in payload.get("headers", [])}
    body = _extract_gmail_body(payload).strip()

    result = (
        f"From: {hdrs.get('From', 'Unknown')}\n"
        f"Subject: {hdrs.get('Subject', '(no subject)')}\n"
        f"Date: {hdrs.get('Date', '')}\n\n"
        f"{body[:2500]}"
    )
    return result if body else result + "(no readable body)"


def _extract_sheet_id(sheet_id_or_url: str) -> str:
    if "/spreadsheets/d/" in sheet_id_or_url:
        part = sheet_id_or_url.split("/spreadsheets/d/")[1]
        return part.split("/")[0]
    return sheet_id_or_url


def _google_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


def _read_sheet(inputs: dict, access_token: str) -> str:
    sheet_id = _extract_sheet_id(inputs["sheet_id"])
    range_str = inputs.get("range", "Sheet1!A1:Z100")
    r = httpx.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_str}",
        headers=_google_headers(access_token),
        timeout=15,
    )
    r.raise_for_status()
    rows = r.json().get("values", [])
    if not rows:
        return "Sheet is empty or range has no data"
    return "\n".join(",".join(str(c) for c in row) for row in rows)[:3000]


def _write_sheet(inputs: dict, access_token: str) -> str:
    sheet_id = _extract_sheet_id(inputs["sheet_id"])
    range_str = inputs.get("range", "Sheet1!A1")
    r = httpx.put(
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_str}",
        headers=_google_headers(access_token),
        params={"valueInputOption": "USER_ENTERED"},
        json={"range": range_str, "majorDimension": "ROWS", "values": inputs["values"]},
        timeout=15,
    )
    r.raise_for_status()
    updated = r.json().get("updatedCells", "?")
    return f"Wrote {updated} cells to {range_str}"


def _create_calendar_event(inputs: dict, access_token: str) -> str:
    timezone = inputs.get("timezone", "UTC")
    event = {
        "summary": inputs["title"],
        "description": inputs.get("description", ""),
        "start": {"dateTime": inputs["start"], "timeZone": timezone},
        "end": {"dateTime": inputs["end"], "timeZone": timezone},
    }
    r = httpx.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        headers=_google_headers(access_token),
        json=event,
        timeout=15,
    )
    r.raise_for_status()
    return f"Calendar event created: '{inputs['title']}' on {inputs['start'][:10]}"


def _send_slack_message(inputs: dict, token: str) -> str:
    channel = inputs["channel"]
    if not channel.startswith("#") and not channel.startswith("C"):
        channel = f"#{channel}"
    r = httpx.post(
        "https://slack.com/api/chat.postMessage",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"channel": channel, "text": inputs["message"]},
        timeout=15,
    )
    data = r.json()
    if not data.get("ok"):
        raise Exception(data.get("error", "Slack error"))
    return f"Message sent to {channel}"


def _create_notion_page(inputs: dict, token: str) -> str:
    r = httpx.post(
        "https://api.notion.com/v1/pages",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
        },
        json={
            "parent": {"database_id": inputs["database_id"]},
            "properties": {
                "title": {"title": [{"type": "text", "text": {"content": inputs["title"]}}]}
            },
            "children": [
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [{"type": "text", "text": {"content": (inputs.get("content") or "")[:2000]}}]
                    },
                }
            ] if inputs.get("content") else [],
        },
        timeout=15,
    )
    r.raise_for_status()
    return f"Notion page created: '{inputs['title']}'"
