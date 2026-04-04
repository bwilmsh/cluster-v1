"""Tool definitions and execution for agent integrations."""

import json
import os
import re
import httpx
from urllib.parse import quote_plus

# ─── Tool schemas (passed to Claude) ─────────────────────────────────────────

SEND_EMAIL_TOOL = {
    "name": "send_email",
    "description": "Send an email via Gmail on behalf of the user.",
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

BROWSE_WEBSITE_TOOL = {
    "name": "browse_website",
    "description": (
        "Visit any website, read its content, click buttons, fill forms, and extract data. "
        "Use this when you need to get information from a website or take actions on a website "
        "on behalf of the user. Returns the page text content. "
        "Examples: check prices, read news, pull analytics, submit forms, check order status."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Full URL to visit, e.g. https://example.com/dashboard",
            },
            "instructions": {
                "type": "string",
                "description": "What to do or extract from the page — be specific",
            },
            "screenshot": {
                "type": "boolean",
                "description": "Whether to capture a screenshot of the page (default false)",
            },
        },
        "required": ["url", "instructions"],
    },
}


SEARCH_WEB_TOOL = {
    "name": "search_web",
    "description": (
        "Search the web and return the top results with titles, URLs, and descriptions. "
        "Use this to find current information, news, prices, or anything that requires "
        "a web search rather than visiting a specific URL."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query, e.g. 'best running shoes 2025' or 'Python asyncio tutorial'",
            },
        },
        "required": ["query"],
    },
}

READ_PAGE_CONTENT_TOOL = {
    "name": "read_page_content",
    "description": (
        "Fetch and return the text content of a URL without a full browser. "
        "Fast and lightweight — use for articles, documentation, and static pages. "
        "For JavaScript-heavy sites, pages that require login, or when you need to "
        "click/fill forms, use browse_website instead."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Full URL to fetch, e.g. https://example.com/article",
            },
        },
        "required": ["url"],
    },
}

RUN_SCHEDULED_SUMMARY_TOOL = {
    "name": "run_scheduled_summary",
    "description": (
        "Format collected data into a clean, structured summary. "
        "Use this at the end of a scheduled task to present your findings clearly "
        "before the response is saved."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Summary heading, e.g. 'TikTok Analytics — 14 Jun 2025'",
            },
            "findings": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Key findings or data points, one per item",
            },
            "conclusion": {
                "type": "string",
                "description": "Overall takeaway or recommendation (optional)",
            },
        },
        "required": ["title", "findings"],
    },
}


def get_available_tools(integrations: dict) -> list:
    """Return tool definitions based on available integrations."""
    # Always available — no OAuth required
    tools = [BROWSE_WEBSITE_TOOL, SEARCH_WEB_TOOL, READ_PAGE_CONTENT_TOOL, RUN_SCHEDULED_SUMMARY_TOOL]
    if integrations.get("google_access_token"):
        tools.extend([SEND_EMAIL_TOOL, READ_SHEET_TOOL, WRITE_SHEET_TOOL, CREATE_CALENDAR_EVENT_TOOL])
    if integrations.get("slack_token"):
        tools.append(SEND_SLACK_MESSAGE_TOOL)
    if integrations.get("notion_token"):
        tools.append(CREATE_NOTION_PAGE_TOOL)
    return tools


# ─── Tool execution ───────────────────────────────────────────────────────────

def _extract_sheet_id(sheet_id_or_url: str) -> str:
    """Extract sheet ID from URL or return as-is."""
    if "/spreadsheets/d/" in sheet_id_or_url:
        part = sheet_id_or_url.split("/spreadsheets/d/")[1]
        return part.split("/")[0]
    return sheet_id_or_url


def _google_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


def execute_tool(name: str, inputs: dict, integrations: dict) -> str:
    """Execute a tool and return a concise string result."""
    try:
        if name == "browse_website":
            return _browse_website(inputs, integrations)
        elif name == "search_web":
            return _search_web(inputs)
        elif name == "read_page_content":
            return _read_page_content(inputs)
        elif name == "run_scheduled_summary":
            return _run_scheduled_summary(inputs)
        elif name == "send_email":
            return _send_email(inputs, integrations["google_access_token"])
        elif name == "read_sheet":
            return _read_sheet(inputs, integrations["google_access_token"])
        elif name == "write_sheet":
            return _write_sheet(inputs, integrations["google_access_token"])
        elif name == "create_calendar_event":
            return _create_calendar_event(inputs, integrations["google_access_token"])
        elif name == "send_slack_message":
            return _send_slack_message(inputs, integrations["slack_token"])
        elif name == "create_notion_page":
            return _create_notion_page(inputs, integrations["notion_token"])
        else:
            return f"Unknown tool: {name}"
    except Exception as e:
        return f"Tool error: {str(e)[:200]}"


def _browse_website(inputs: dict, integrations: dict) -> str:
    backend_url = os.environ.get("BACKEND_URL", "http://localhost:3001")
    payload = {
        "url": inputs["url"],
        "instructions": inputs["instructions"],
        "screenshot": inputs.get("screenshot", False),
        "agent_id": integrations.get("agent_id"),
        "agent_name": integrations.get("agent_name"),
    }
    r = httpx.post(
        f"{backend_url}/api/browse",
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        return f"Browse failed: {data.get('error', 'Unknown error')}"
    content = data.get("content", "")
    if not content:
        return "Page loaded but no text content was found."
    return f"[Page content from {inputs['url']}]\n\n{content}"


def _search_web(inputs: dict) -> str:
    """Search DuckDuckGo and return top results."""
    from bs4 import BeautifulSoup

    query = inputs["query"]
    url = f"https://lite.duckduckgo.com/lite/?q={quote_plus(query)}"
    r = httpx.get(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ClusterAgent/1.0)"},
        timeout=15,
        follow_redirects=True,
    )
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")
    results = []

    links = soup.find_all("a", class_="result-link")
    snippets = soup.find_all("td", class_="result-snippet")

    for i, (link, snippet) in enumerate(zip(links, snippets)):
        if i >= 6:
            break
        title = link.get_text(strip=True)
        href = link.get("href", "")
        text = snippet.get_text(strip=True)
        results.append(f"{i + 1}. {title}\n   {href}\n   {text}")

    if not results:
        return f"No results found for: {query}"

    return f"Search results for '{query}':\n\n" + "\n\n".join(results)


def _read_page_content(inputs: dict) -> str:
    """Fetch a URL and return its text content (no full browser)."""
    from bs4 import BeautifulSoup

    url = inputs["url"]
    r = httpx.get(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ClusterAgent/1.0)"},
        timeout=15,
        follow_redirects=True,
    )
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")

    # Remove noise elements
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if not text:
        return f"No readable text content found at {url}"

    return f"[Content from {url}]\n\n{text[:4000]}"


def _run_scheduled_summary(inputs: dict) -> str:
    """Format a structured summary from collected data."""
    title = inputs["title"]
    findings = inputs.get("findings", [])
    conclusion = inputs.get("conclusion", "")

    lines = [f"# {title}", ""]
    for i, finding in enumerate(findings, 1):
        lines.append(f"{i}. {finding}")
    if conclusion:
        lines.extend(["", f"Conclusion: {conclusion}"])

    return "\n".join(lines)


def _send_email(inputs: dict, access_token: str) -> str:
    import base64
    from email.mime.text import MIMEText

    msg = MIMEText(inputs["body"])
    msg["To"] = inputs["to"]
    msg["Subject"] = inputs["subject"]
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    r = httpx.post(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        headers=_google_headers(access_token),
        json={"raw": raw},
        timeout=15,
    )
    r.raise_for_status()
    return f"Email sent to {inputs['to']} — subject: {inputs['subject']}"


def _read_sheet(inputs: dict, access_token: str) -> str:
    sheet_id = _extract_sheet_id(inputs["sheet_id"])
    range_str = inputs.get("range", "Sheet1!A1:Z100")
    r = httpx.get(
        f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_str}",
        headers=_google_headers(access_token),
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    rows = data.get("values", [])
    if not rows:
        return "Sheet is empty or range has no data"
    # Return as CSV, truncate to 3000 chars
    csv_text = "\n".join(",".join(str(c) for c in row) for row in rows)
    return csv_text[:3000]


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
    result = r.json()
    updated = result.get("updatedCells", "?")
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
    result = r.json()
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
                "title": {
                    "title": [{"type": "text", "text": {"content": inputs["title"]}}]
                }
            },
            "children": [
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {
                        "rich_text": [
                            {"type": "text", "text": {"content": (inputs.get("content") or "")[:2000]}}
                        ]
                    },
                }
            ] if inputs.get("content") else [],
        },
        timeout=15,
    )
    r.raise_for_status()
    return f"Notion page created: '{inputs['title']}'"
