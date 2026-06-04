"""Tool definitions and execution for agent integrations."""

import json
import os
import re
import warnings
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import httpx
import certifi
import requests
from supabase import create_client, Client

from tool_registry import ToolRegistry

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3001")
MIN_CAL_API_VERSION = "2026-02-25"
SUPABASE_MEMORY_TABLE = os.environ.get("SUPABASE_MEMORY_TABLE", "memories")
SUPABASE_DOCUMENTS_TABLE = os.environ.get("SUPABASE_DOCUMENTS_TABLE", "documents")
SUPABASE_DOCUMENTS_BUCKET = os.environ.get("SUPABASE_DOCUMENTS_BUCKET", "user_docs")

TOOL_REGISTRY = ToolRegistry()


def _cal_api_base_url() -> str:
    return os.environ.get("CAL_API_BASE_URL", "https://api.cal.com").rstrip("/")


def _cal_api_version() -> str:
    configured = (os.environ.get("CAL_API_VERSION") or "").strip()
    if not configured:
        return MIN_CAL_API_VERSION

    # Cal API versions use YYYY-MM-DD; lexicographic order is valid for comparisons.
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", configured) or configured < MIN_CAL_API_VERSION:
        warnings.warn(
            f"CAL_API_VERSION '{configured}' is not supported; using {MIN_CAL_API_VERSION} instead.",
            RuntimeWarning,
        )
        return MIN_CAL_API_VERSION

    return configured

# ─── Tool schemas ─────────────────────────────────────────────────────────────

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

# Native web search — executed server-side, no API key needed
WEB_SEARCH_NATIVE_TOOL = {
    "type": "web_search_20250305",
    "name": "web_search",
}

SEARCH_WEB_TOOL = {
    "name": "search_web",
    "description": "Use this tool to look up real-time information, news, or local recommendations that aren't in your training data.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
        },
        "required": ["query"],
    },
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

READ_DOCUMENT_CONTENT_TOOL = {
    "name": "read_document_content",
    "description": (
        "Use this tool to fetch a PDF document from Supabase Storage by document_id, extract the text, "
        "and return the first 2000 words to the model."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "document_id": {
                "type": "string",
                "description": "The document_id returned when the file was uploaded",
            },
        },
        "required": ["document_id"],
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

MANAGE_BOOKING_TOOL = {
    "name": "manage_booking",
    "description": (
        "Create a Cal.com booking for a customer. "
        "Use this when the user asks to book or schedule an appointment."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "customer_name": {"type": "string", "description": "Customer full name"},
            "customer_email": {"type": "string", "description": "Customer email"},
            "start_time": {
                "type": "string",
                "description": "Appointment start time in ISO 8601 format",
            },
            "category": {
                "type": "string",
                "description": "Event category: business, chore, or personal",
                "enum": ["business", "chore", "personal"],
            },
            "service": {
                "type": "string",
                "description": "Optional service label such as 'haircut'",
            },
            "request_text": {
                "type": "string",
                "description": "Original user request text for category inference when category is omitted",
            },
        },
        "required": ["customer_name", "customer_email", "start_time"],
    },
}

SAVE_EVENT_TOOL = {
    "name": "save_event",
    "description": (
        "Save a calendar event by creating a booking. "
        "Use this for appointment/event scheduling and include a category when possible."
    ),
    "input_schema": MANAGE_BOOKING_TOOL["input_schema"],
}

SEARCH_CUSTOMER_MEMORIES_TOOL = {
    "name": "search_customer_memories",
    "description": (
        "Search the memories table for AI-extracted customer preferences. "
        "Use this when asked about a customer preference, profile, or past likes/dislikes."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Keyword or phrase to search in preference_text",
            },
            "customer_id": {
                "type": "integer",
                "description": "Optional customer ID filter",
            },
            "limit": {
                "type": "integer",
                "description": "Max results to return (default 5, max 10)",
            },
        },
        "required": ["query"],
    },
}

READ_AGENT_MEMORY_TOOL = {
    "name": "read_agent_memory",
    "description": (
        "Read another agent's memory by name. "
        "Use only when the user explicitly asks to compare or inspect another agent's memory."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "agent_name": {
                "type": "string",
                "description": "Exact agent name to read memory for",
            },
        },
        "required": ["agent_name"],
    },
}

SET_GOAL_TOOL = {
    "name": "set_goal",
    "description": (
        "Create an active goal from chat so the agent can plan around it. "
        "Use this when the user says what they want to achieve. "
        "After saving it, ask: 'How do you want to achieve this goal?' so the plan can be remembered too."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "goal_text": {
                "type": "string",
                "description": "The goal the user wants to achieve",
            },
            "how_to_achieve": {
                "type": "string",
                "description": "Optional plan or approach the user already gave",
            },
            "visible_agent_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of agent IDs that should be able to see this goal",
            },
        },
        "required": ["goal_text"],
    },
}

GET_CALENDAR_EVENTS_TOOL = {
    "name": "get_calendar_events",
    "description": (
        "Use this tool to check the Supabase database for the user's events and chores. "
        "You MUST use this before saying information is unavailable."
    ),
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}

ADD_CALENDAR_EVENT_TOOL = {
    "name": "add_calendar_event",
    "description": (
        "Create a calendar item in Supabase events table. "
        "Use this when the user asks to add or schedule something on the calendar, including tasks."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Event title. If the user did not provide one, infer it from context or use a short generic title.",
            },
            "start_time": {
                "type": "string",
                "description": "Event start time in ISO 8601 format",
            },
            "category": {
                "type": "string",
                "description": "Event category",
                "enum": ["business", "chore", "personal"],
            },
            "description": {
                "type": "string",
                "description": "Optional event description",
            },
        },
        "required": ["start_time", "category", "description"],
    },
}

UPDATE_CALENDAR_EVENT_TOOL = {
    "name": "update_calendar_event",
    "description": (
        "Edit an existing calendar event in Supabase events table by ID. "
        "Use this when the user asks to reschedule or change an event."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {
                "type": "integer",
                "description": "ID of the event to update",
            },
            "title": {
                "type": "string",
                "description": "Updated event title",
            },
            "start_time": {
                "type": "string",
                "description": "Updated event start time in ISO 8601 format",
            },
            "category": {
                "type": "string",
                "description": "Updated event category",
                "enum": ["business", "chore", "personal"],
            },
            "description": {
                "type": "string",
                "description": "Updated event description",
            },
        },
        "required": ["event_id"],
    },
}

LIST_AUTOMATIONS_TOOL = {
    "name": "list_automations",
    "description": (
        "List all automation flows the user has set up in Activepieces. "
        "Use this to see what automations exist before suggesting to run or create one."
    ),
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}

TRIGGER_AUTOMATION_TOOL = {
    "name": "trigger_automation",
    "description": (
        "Trigger one of the user's Activepieces automation flows by name or ID. "
        "Use list_automations first to find the right flow name."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "flow_name": {
                "type": "string",
                "description": "The name of the flow to trigger (partial match is fine)",
            },
            "payload": {
                "type": "object",
                "description": "Optional data to pass to the flow (if it has a webhook trigger)",
            },
        },
        "required": ["flow_name"],
    },
}

CREATE_AUTOMATION_TOOL = {
    "name": "create_automation",
    "description": (
        "Create a fully configured automation flow in Activepieces — trigger + all steps with real data filled in. "
        "IMPORTANT: You must collect ALL required parameter values from the user BEFORE calling this tool. "
        "Never call this with empty or placeholder params — every field must have a real value. "
        "The user only needs to do OAuth (connect the service) once in Activepieces. "
        "Always call list_automations first to avoid duplicates.\n\n"
        "REQUIRED params by service+action:\n"
        "  gmail / send_email          → to (email address), subject (string), body_text (string)\n"
        "  gmail / send_email_html     → to, subject, body_html (HTML string)\n"
        "  slack / send_message_to_channel → channel (e.g. #general), text (message body)\n"
        "  notion / create_page        → databaseId (notion DB id), title (string), content (string)\n"
        "  http  / send_http_request   → method (GET/POST), url (full URL), body (JSON string, optional)\n"
        "  sheets/ append_row          → spreadsheetId, sheetName, values (comma-separated)\n"
        "  openai/ ask_ai              → model (gpt-4o), prompt (string)\n\n"
        "Collect missing values by asking the user. Do not guess or leave fields empty."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Short clear name (e.g. 'Weekly Sunday Summary Email')",
            },
            "trigger": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["schedule", "webhook", "instant"],
                    },
                    "cron": {
                        "type": "string",
                        "description": (
                            "Cron expression for schedule triggers. "
                            "Every Sunday 6pm: '0 18 * * 0' | Every Monday 9am: '0 9 * * 1' | "
                            "Every day 8am: '0 8 * * *' | Every weekday 10am: '0 10 * * 1-5'"
                        ),
                    },
                    "label": {"type": "string"},
                },
                "required": ["type"],
            },
            "actions": {
                "type": "array",
                "description": (
                    "Steps to run. Every params field must be filled with real values — "
                    "no placeholders, no empty strings."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "service": {
                            "type": "string",
                            "description": "gmail | slack | notion | sheets | calendar | http | code | openai",
                        },
                        "action": {
                            "type": "string",
                            "description": (
                                "Exact Activepieces action name: "
                                "send_email (gmail), send_message_to_channel (slack), "
                                "create_page (notion), send_http_request (http), append_row (sheets)"
                            ),
                        },
                        "params": {
                            "type": "object",
                            "description": (
                                "All required fields for the action with real values. "
                                "See tool description for the exact keys per service. "
                                "For fields that accept multiple values (like 'to' in gmail), "
                                "pass a comma-separated string: 'a@x.com, b@x.com'"
                            ),
                            "additionalProperties": True,
                        },
                        "label": {"type": "string", "description": "Human-readable step name"},
                    },
                    "required": ["service", "action", "params"],
                },
                "minItems": 1,
            },
        },
        "required": ["name", "trigger", "actions"],
    },
}

CHECK_AP_CONNECTIONS_TOOL = {
    "name": "check_ap_connections",
    "description": (
        "Check which services (Gmail, Slack, Notion, etc.) the user has already connected "
        "in Activepieces. Use this before creating an automation to know if OAuth is needed."
    ),
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
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

LIST_WORKFLOWS_TOOL = {
    "name": "list_workflows",
    "description": (
        "List all saved workflows for this user. "
        "Call this before building a new workflow to check if one already exists. "
        "Returns workflow IDs, names, descriptions, and status."
    ),
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
    },
}

GET_WORKFLOW_TOOL = {
    "name": "get_workflow",
    "description": (
        "Get the full details of a specific workflow including all its nodes and edges. "
        "Use this to read an existing workflow before modifying it."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "workflow_id": {"type": "string", "description": "The workflow ID from list_workflows"},
        },
        "required": ["workflow_id"],
    },
}

BUILD_WORKFLOW_TOOL = {
    "name": "build_workflow",
    "description": (
        "Create a new workflow from a graph of nodes. "
        "Call this after proposing the workflow to the user and getting confirmation. "
        "Each node has: id (string), type (trigger|check|action|notify|decision|memory_read|memory_write), "
        "label (what it does), capability (optional tool name like 'calendar.create_event'), "
        "parameters (optional dict of values). "
        "Edges connect nodes: each edge has source and target node IDs. "
        "Returns the created workflow with its ID and a URL to open it in the canvas."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Short descriptive name for the workflow"},
            "description": {"type": "string", "description": "What this workflow does"},
            "nodes": {
                "type": "array",
                "description": "The workflow nodes",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string", "enum": ["trigger", "check", "action", "notify", "decision", "memory_read", "memory_write"]},
                        "label": {"type": "string"},
                        "capability": {"type": "string"},
                        "parameters": {"type": "object"},
                    },
                    "required": ["id", "type", "label"],
                },
            },
            "edges": {
                "type": "array",
                "description": "Connections between nodes",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "source": {"type": "string"},
                        "target": {"type": "string"},
                        "label": {"type": "string"},
                    },
                    "required": ["id", "source", "target"],
                },
            },
        },
        "required": ["name", "nodes", "edges"],
    },
}

UPDATE_WORKFLOW_TOOL = {
    "name": "update_workflow",
    "description": (
        "Update an existing workflow's nodes, edges, name, or status. "
        "Use this to modify a workflow the user wants to change — "
        "e.g. change a reminder time, add a step, or activate/pause it."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "workflow_id": {"type": "string", "description": "The workflow ID to update"},
            "name": {"type": "string", "description": "New name (optional)"},
            "description": {"type": "string", "description": "New description (optional)"},
            "nodes": {"type": "array", "description": "Replacement node array (optional)"},
            "edges": {"type": "array", "description": "Replacement edge array (optional)"},
            "status": {"type": "string", "enum": ["draft", "active", "paused"], "description": "New status (optional)"},
        },
        "required": ["workflow_id"],
    },
}


# ─── Calendar AI tool schemas (calendar page only) ────────────────────────────

CALENDAR_CREATE_EVENT_TOOL = {
    "name": "create_calendar_event",
    "description": (
        "Create a new calendar event. Applied immediately — no confirmation needed. "
        "The tool result will contain [CALENDAR_REFRESH] on success."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Event title"},
            "date": {
                "type": "string",
                "description": "Event date, e.g. 'today', 'tomorrow', weekday name, or YYYY-MM-DD",
            },
            "start_time": {
                "type": "string",
                "description": "Start time — ISO 8601 or natural language like 'tomorrow at 9am'",
            },
            "end_time": {
                "type": "string",
                "description": "End time — ISO 8601 or natural language. Optional; defaults to 1 hour after start.",
            },
            "category": {
                "type": "string",
                "enum": ["business", "personal", "chore"],
                "description": "Event category. Default: personal",
            },
        },
        "required": ["title", "start_time"],
    },
}

CALENDAR_GET_EVENTS_TOOL = {
    "name": "get_calendar_events",
    "description": (
        "Fetch calendar events for a specific date or range. "
        "Use to confirm event IDs before move/delete, or to load a day before plan_day."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "start_date": {
                "type": "string",
                "description": "Start of range — ISO 'YYYY-MM-DD', 'today', 'tomorrow', or weekday name",
            },
            "end_date": {
                "type": "string",
                "description": "End of range (inclusive). Defaults to start_date.",
            },
        },
        "required": ["start_date"],
    },
}

CALENDAR_MOVE_EVENT_TOOL = {
    "name": "move_event",
    "description": (
        "Move a calendar event to a new start time. "
        "Call with confirmed=false first — show the user what will change and ask yes/no. "
        "Call with confirmed=true only after the user confirms."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "ID of the event to move"},
            "new_start_time": {
                "type": "string",
                "description": "New start time — ISO 8601 or natural language",
            },
            "confirmed": {
                "type": "boolean",
                "description": "Set true only after the user has confirmed. Default false.",
            },
        },
        "required": ["event_id", "new_start_time"],
    },
}

CALENDAR_RENAME_EVENT_TOOL = {
    "name": "rename_event",
    "description": "Rename a calendar event. Applied immediately — no confirmation needed.",
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "ID of the event to rename"},
            "new_title": {"type": "string", "description": "New title for the event"},
        },
        "required": ["event_id", "new_title"],
    },
}

CALENDAR_EXTEND_EVENT_TOOL = {
    "name": "extend_event",
    "description": (
        "Change the end time of a calendar event (extend or shorten it). "
        "Call with confirmed=false first — show what will change and ask yes/no. "
        "Call with confirmed=true only after the user confirms."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "ID of the event"},
            "new_end_time": {
                "type": "string",
                "description": "New end time — ISO 8601 or natural language",
            },
            "confirmed": {
                "type": "boolean",
                "description": "Set true only after the user has confirmed. Default false.",
            },
        },
        "required": ["event_id", "new_end_time"],
    },
}

CALENDAR_DELETE_EVENT_TOOL = {
    "name": "delete_event",
    "description": (
        "Delete a calendar event. "
        "Call with confirmed=false first — show what will be deleted and ask yes/no. "
        "Call with confirmed=true only after the user confirms."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "event_id": {"type": "string", "description": "ID of the event to delete"},
            "confirmed": {
                "type": "boolean",
                "description": "Set true only after the user has confirmed. Default false.",
            },
        },
        "required": ["event_id"],
    },
}

CALENDAR_PLAN_DAY_TOOL = {
    "name": "plan_day",
    "description": (
        "Fetch all events for a given day with their times and free gaps. "
        "Use the result to draft a time-blocked schedule, show it to the user, "
        "then use create_calendar_event for each new block after the user confirms."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "date": {
                "type": "string",
                "description": "Date to plan — 'today', 'tomorrow', ISO 'YYYY-MM-DD', or weekday name",
            },
        },
        "required": ["date"],
    },
}

CALENDAR_AI_TOOLS: list[dict] = [
    CALENDAR_CREATE_EVENT_TOOL,
    CALENDAR_GET_EVENTS_TOOL,
    CALENDAR_MOVE_EVENT_TOOL,
    CALENDAR_RENAME_EVENT_TOOL,
    CALENDAR_EXTEND_EVENT_TOOL,
    CALENDAR_DELETE_EVENT_TOOL,
    CALENDAR_PLAN_DAY_TOOL,
]


def get_calendar_ai_tools() -> list[dict]:
    """Return the calendar-only tool definitions for use in calendar AI mode."""
    return CALENDAR_AI_TOOLS


# ─── Calendar AI executor helpers ─────────────────────────────────────────────

def _fmt_time(dt: datetime) -> str:
    local = dt.astimezone(_get_agent_timezone())
    month_day = local.strftime("%B %d").replace(" 0", " ")
    hour = local.strftime("%I").lstrip("0") or "0"
    minute = local.strftime("%M")
    am_pm = local.strftime("%p").lower()
    return f"{month_day} at {hour}:{minute}{am_pm}"


def _resolve_date_midnight(value: str) -> datetime:
    """Resolve a date description to midnight in the local timezone."""
    from datetime import timedelta
    agent_tz = _get_agent_timezone()
    now_local = datetime.now(agent_tz)
    text = value.strip().lower()

    if text == "today":
        d = now_local.date()
        return datetime(d.year, d.month, d.day, tzinfo=agent_tz)
    if text == "tomorrow":
        d = (now_local + timedelta(days=1)).date()
        return datetime(d.year, d.month, d.day, tzinfo=agent_tz)

    weekday_map = {
        "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
        "friday": 4, "saturday": 5, "sunday": 6,
    }
    if text in weekday_map:
        target = weekday_map[text]
        days_ahead = (target - now_local.weekday()) % 7 or 7
        d = (now_local + timedelta(days=days_ahead)).date()
        return datetime(d.year, d.month, d.day, tzinfo=agent_tz)

    iso_match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
    if iso_match:
        return datetime(int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3)), tzinfo=agent_tz)

    raise ValueError(f"Cannot resolve date: {value!r}")


def _fetch_all_appointments() -> list[dict]:
    r = httpx.get(f"{BACKEND_URL}/api/appointments?limit=500", timeout=15)
    r.raise_for_status()
    data = r.json()
    raw = data.get("data") or data if isinstance(data, list) else []
    if isinstance(data, dict):
        raw = data.get("data", [])
    return raw if isinstance(raw, list) else []


def _fetch_all_habits() -> list[dict]:
    r = httpx.get(f"{BACKEND_URL}/api/habits", timeout=15)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict):
        raw = data.get("data", [])
    else:
        raw = data
    return raw if isinstance(raw, list) else []


def _find_calendar_event(event_id: str) -> dict | None:
    try:
        events = _fetch_all_appointments()
    except Exception:
        return None
    for ev in events:
        if str(ev.get("id", "")) == event_id:
            return ev
    return None


def _calendar_event_title(ev: dict | None) -> str:
    if not ev:
        return "event"
    return str(ev.get("customer_name") or ev.get("title") or ev.get("note") or "event").strip() or "event"


def _calendar_event_range(ev: dict | None) -> str:
    if not ev:
        return "its current time"
    start_raw = ev.get("start_time") or ev.get("event_time") or ""
    end_raw = ev.get("end_time") or ""
    try:
        start_label = _fmt_time(_parse_event_time(str(start_raw)))
    except ValueError:
        return "its current time"
    if not end_raw:
        return start_label
    try:
        return f"{start_label} to {_fmt_time(_parse_event_time(str(end_raw)))}"
    except ValueError:
        return start_label


def _parse_calendar_datetime(date_raw: str, time_raw: str) -> datetime:
    date_text = date_raw.strip()
    time_text = time_raw.strip()
    clock_only = bool(re.fullmatch(r"\d{1,2}(?::\d{2})?\s*(?:am|pm)", time_text.lower())) or bool(
        re.fullmatch(r"(?:[01]?\d|2[0-3]):[0-5]\d", time_text)
    )
    if date_text and clock_only:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date_text):
            return _parse_event_time(f"{date_text} {time_text}")
        return _parse_event_time(f"{date_text} at {time_text}")
    return _parse_event_time(time_text)


# ─── Calendar AI executors ────────────────────────────────────────────────────

def _calendar_create_event(inputs: dict) -> str:
    from datetime import timedelta
    title = str(inputs.get("title", "")).strip()
    date_raw = str(inputs.get("date", "")).strip()
    start_raw = str(inputs.get("start_time", "")).strip()
    end_raw = str(inputs.get("end_time", "")).strip()
    category = str(inputs.get("category", "personal")).strip().lower()

    if not title:
        return "create_calendar_event failed: title is required."
    if not start_raw:
        return "create_calendar_event failed: start_time is required."
    if category not in {"business", "personal", "chore"}:
        category = "personal"

    try:
        parsed_start = _parse_calendar_datetime(date_raw, start_raw)
    except ValueError:
        return f"create_calendar_event failed: could not parse start_time '{start_raw}'."

    if end_raw:
        try:
            parsed_end = _parse_calendar_datetime(date_raw, end_raw)
        except ValueError:
            return f"create_calendar_event failed: could not parse end_time '{end_raw}'."
    else:
        parsed_end = parsed_start + timedelta(hours=1)

    iso_start = _to_utc_iso_z(parsed_start)
    iso_end = _to_utc_iso_z(parsed_end)

    try:
        r = httpx.post(
            f"{BACKEND_URL}/api/appointments",
            json={"title": title, "start_time": iso_start, "end_time": iso_end, "category": category},
            timeout=15,
        )
        r.raise_for_status()
    except Exception as exc:
        return f"create_calendar_event failed: {exc}"

    appt = r.json().get("appointment") or {}
    event_id = appt.get("id", "?")
    return f"Created '{title}' on {_fmt_time(parsed_start)} (id: {event_id}). [CALENDAR_REFRESH]"


def _calendar_get_events(inputs: dict) -> str:
    start_raw = str(inputs.get("start_date", "")).strip()
    end_raw = str(inputs.get("end_date", "")).strip()

    if not start_raw:
        return "get_calendar_events failed: start_date is required."

    try:
        start_midnight = _resolve_date_midnight(start_raw)
    except ValueError:
        return f"get_calendar_events failed: could not parse start_date '{start_raw}'."

    if end_raw:
        try:
            end_midnight = _resolve_date_midnight(end_raw)
        except ValueError:
            return f"get_calendar_events failed: could not parse end_date '{end_raw}'."
    else:
        end_midnight = start_midnight

    from datetime import timedelta
    end_exclusive = end_midnight + timedelta(days=1)

    try:
        events = _fetch_all_appointments()
    except Exception as exc:
        return f"get_calendar_events failed: {exc}"

    agent_tz = _get_agent_timezone()
    matching = []
    for ev in events:
        raw_start = ev.get("start_time") or ev.get("event_time") or ""
        if not raw_start:
            continue
        try:
            parsed = _parse_event_time(str(raw_start))
        except ValueError:
            continue
        local = parsed.astimezone(agent_tz)
        local_midnight = datetime(local.year, local.month, local.day, tzinfo=agent_tz)
        if start_midnight <= local_midnight < end_exclusive:
            title = (ev.get("customer_name") or ev.get("title") or ev.get("note") or "Untitled").strip()
            end_raw_val = ev.get("end_time") or ""
            end_label = ""
            if end_raw_val:
                try:
                    end_label = f" – {_fmt_time(_parse_event_time(str(end_raw_val)))}"
                except ValueError:
                    pass
            matching.append(f"[id:{ev.get('id')}] {_fmt_time(parsed)}{end_label}: {title}")

    if not matching:
        return f"No events found between {start_raw} and {end_raw or start_raw}."
    return "\n".join(matching)


def _calendar_move_event(inputs: dict) -> str:
    from datetime import timedelta
    event_id = str(inputs.get("event_id", "")).strip()
    new_start_raw = str(inputs.get("new_start_time", "")).strip()
    confirmed = bool(inputs.get("confirmed", False))

    if not event_id:
        return "move_event failed: event_id is required."
    if not new_start_raw:
        return "move_event failed: new_start_time is required."

    try:
        parsed_start = _parse_event_time(new_start_raw)
    except ValueError:
        return f"move_event failed: could not parse new_start_time '{new_start_raw}'."

    current_event = _find_calendar_event(event_id)
    if not confirmed:
        title = _calendar_event_title(current_event)
        current_range = _calendar_event_range(current_event)
        return (
            f"PENDING CONFIRMATION: Move '{title}' from {current_range} to {_fmt_time(parsed_start)}? "
            f"Call move_event again with confirmed=true after the user says yes."
        )

    # Try to preserve duration
    iso_start = _to_utc_iso_z(parsed_start)
    payload: dict = {"start_time": iso_start}
    try:
        if current_event:
            s_raw = current_event.get("start_time") or ""
            e_raw = current_event.get("end_time") or ""
            if s_raw and e_raw:
                orig_start = _parse_event_time(str(s_raw))
                orig_end = _parse_event_time(str(e_raw))
                duration = orig_end - orig_start
                payload["end_time"] = _to_utc_iso_z(parsed_start + duration)
    except Exception:
        pass

    try:
        r = httpx.patch(f"{BACKEND_URL}/api/appointments/{event_id}", json=payload, timeout=15)
        r.raise_for_status()
    except Exception as exc:
        return f"move_event failed: {exc}"

    return f"Moved event {event_id} to {_fmt_time(parsed_start)}. [CALENDAR_REFRESH]"


def _calendar_rename_event(inputs: dict) -> str:
    event_id = str(inputs.get("event_id", "")).strip()
    new_title = str(inputs.get("new_title", "")).strip()

    if not event_id:
        return "rename_event failed: event_id is required."
    if not new_title:
        return "rename_event failed: new_title is required."

    try:
        r = httpx.patch(
            f"{BACKEND_URL}/api/appointments/{event_id}",
            json={"title": new_title},
            timeout=15,
        )
        r.raise_for_status()
    except Exception as exc:
        return f"rename_event failed: {exc}"

    return f"Renamed event {event_id} to '{new_title}'. [CALENDAR_REFRESH]"


def _calendar_extend_event(inputs: dict) -> str:
    event_id = str(inputs.get("event_id", "")).strip()
    new_end_raw = str(inputs.get("new_end_time", "")).strip()
    confirmed = bool(inputs.get("confirmed", False))

    if not event_id:
        return "extend_event failed: event_id is required."
    if not new_end_raw:
        return "extend_event failed: new_end_time is required."

    try:
        parsed_end = _parse_event_time(new_end_raw)
    except ValueError:
        return f"extend_event failed: could not parse new_end_time '{new_end_raw}'."

    current_event = _find_calendar_event(event_id)
    if not confirmed:
        title = _calendar_event_title(current_event)
        current_range = _calendar_event_range(current_event)
        return (
            f"PENDING CONFIRMATION: Change '{title}' from {current_range} to end at {_fmt_time(parsed_end)}? "
            f"Call extend_event again with confirmed=true after the user says yes."
        )

    payload = {"end_time": _to_utc_iso_z(parsed_end)}
    if current_event and current_event.get("start_time"):
        payload["start_time"] = _to_utc_iso_z(_parse_event_time(str(current_event.get("start_time"))))

    try:
        r = httpx.patch(
            f"{BACKEND_URL}/api/appointments/{event_id}",
            json=payload,
            timeout=15,
        )
        r.raise_for_status()
    except Exception as exc:
        return f"extend_event failed: {exc}"

    return f"Updated end time of event {event_id} to {_fmt_time(parsed_end)}. [CALENDAR_REFRESH]"


def _calendar_delete_event(inputs: dict) -> str:
    event_id = str(inputs.get("event_id", "")).strip()
    confirmed = bool(inputs.get("confirmed", False))

    if not event_id:
        return "delete_event failed: event_id is required."

    current_event = _find_calendar_event(event_id)
    if not confirmed:
        title = _calendar_event_title(current_event)
        current_range = _calendar_event_range(current_event)
        return (
            f"PENDING CONFIRMATION: Delete '{title}' at {current_range}? "
            f"Call delete_event again with confirmed=true after the user says yes."
        )

    try:
        r = httpx.delete(f"{BACKEND_URL}/api/appointments/{event_id}", timeout=15)
        r.raise_for_status()
    except Exception as exc:
        return f"delete_event failed: {exc}"

    return f"Deleted event {event_id}. [CALENDAR_REFRESH]"


def _calendar_plan_day(inputs: dict) -> str:
    date_raw = str(inputs.get("date", "")).strip()
    if not date_raw:
        return "plan_day failed: date is required."

    try:
        day_start = _resolve_date_midnight(date_raw)
    except ValueError:
        return f"plan_day failed: could not parse date '{date_raw}'."

    from datetime import timedelta
    day_end = day_start + timedelta(days=1)
    agent_tz = _get_agent_timezone()

    try:
        events = _fetch_all_appointments()
    except Exception as exc:
        return f"plan_day failed: could not fetch events: {exc}"

    try:
        habits = _fetch_all_habits()
    except Exception:
        habits = []

    day_events = []
    for ev in events:
        raw_start = ev.get("start_time") or ev.get("event_time") or ""
        if not raw_start:
            continue
        try:
            parsed = _parse_event_time(str(raw_start))
        except ValueError:
            continue
        local = parsed.astimezone(agent_tz)
        local_midnight = datetime(local.year, local.month, local.day, tzinfo=agent_tz)
        if day_start <= local_midnight < day_end:
            title = (ev.get("customer_name") or ev.get("title") or ev.get("note") or "Untitled").strip()
            end_raw = ev.get("end_time") or ""
            end_dt = None
            if end_raw:
                try:
                    end_dt = _parse_event_time(str(end_raw))
                except ValueError:
                    pass
            if not end_dt:
                end_dt = parsed + timedelta(hours=1)
            day_events.append({"title": title, "start": parsed, "end": end_dt, "id": ev.get("id")})

    day_events.sort(key=lambda x: x["start"])

    day_label = day_start.strftime("%A %B %d").replace(" 0", " ")
    lines = [f"Day: {day_label}"]
    lines.append("")

    if day_events:
        lines.append("Existing events:")
        for e in day_events:
            start_local = e["start"].astimezone(agent_tz)
            end_local = e["end"].astimezone(agent_tz)
            s_hour = start_local.strftime("%I").lstrip("0") or "0"
            s_min = start_local.strftime("%M")
            s_am = start_local.strftime("%p").lower()
            e_hour = end_local.strftime("%I").lstrip("0") or "0"
            e_min = end_local.strftime("%M")
            e_am = end_local.strftime("%p").lower()
            lines.append(f"  [id:{e['id']}] {s_hour}:{s_min}{s_am} – {e_hour}:{e_min}{e_am}: {e['title']}")
    else:
        lines.append("No events scheduled yet.")

    active_habits = []
    weekday_name = day_start.strftime("%A").lower()
    weekday_short = day_start.strftime("%a").lower()
    weekday_index = str(day_start.weekday())
    for habit in habits:
        if habit.get("isActive") is False or habit.get("active") is False:
            continue
        days = habit.get("daysOfWeek")
        if isinstance(days, str):
            try:
                parsed_days = json.loads(days)
                days = parsed_days if isinstance(parsed_days, list) else [days]
            except Exception:
                days = [part.strip() for part in days.split(",") if part.strip()]
        if isinstance(days, list) and days:
            normalized_days = {str(day).strip().lower() for day in days}
            if not ({weekday_name, weekday_short, weekday_index} & normalized_days):
                continue
        name = str(habit.get("name") or "Habit").strip()
        try:
            duration_minutes = int(habit.get("durationMinutes") or habit.get("duration_minutes") or 30)
        except Exception:
            duration_minutes = 30
        duration_minutes = min(max(duration_minutes, 5), 240)
        window_start = str(habit.get("timeRangeStart") or habit.get("timeOfDay") or "09:00").strip()
        window_end = str(habit.get("timeRangeEnd") or habit.get("endTime") or "").strip()
        if not window_end:
            try:
                hour = int((window_start or "09:00").split(":", 1)[0])
            except Exception:
                hour = 9
            window_end = "12:00" if hour < 12 else "17:00" if hour < 17 else "22:00"
        active_habits.append({
            "name": name,
            "duration": duration_minutes,
            "window_start": window_start or "09:00",
            "window_end": window_end,
            "priority": habit.get("priority") or 3,
        })

    if active_habits:
        lines.append("")
        lines.append("Habits to place:")
        for habit in sorted(active_habits, key=lambda h: int(h.get("priority") or 3), reverse=True):
            lines.append(
                f"  {habit['name']} ({habit['duration']}m, window {habit['window_start']} - {habit['window_end']})"
            )

    # Calculate free blocks (9am – 10pm window)
    work_start = day_start.replace(hour=9)
    work_end = day_start.replace(hour=22)
    busy = [(e["start"].astimezone(agent_tz), e["end"].astimezone(agent_tz)) for e in day_events]
    busy.sort(key=lambda x: x[0])

    free_blocks = []
    cursor = work_start
    for b_start, b_end in busy:
        if b_start > cursor and (b_start - cursor).seconds >= 1800:
            free_blocks.append((cursor, b_start))
        if b_end > cursor:
            cursor = b_end
    if cursor < work_end and (work_end - cursor).seconds >= 1800:
        free_blocks.append((cursor, work_end))

    if free_blocks:
        lines.append("")
        lines.append("Free time (9am–10pm):")
        for fb_start, fb_end in free_blocks:
            s_hour = fb_start.strftime("%I").lstrip("0") or "0"
            s_min = fb_start.strftime("%M")
            s_am = fb_start.strftime("%p").lower()
            e_hour = fb_end.strftime("%I").lstrip("0") or "0"
            e_min = fb_end.strftime("%M")
            e_am = fb_end.strftime("%p").lower()
            dur_min = int((fb_end - fb_start).seconds / 60)
            dur_label = f"{dur_min // 60}h {dur_min % 60}m" if dur_min % 60 else f"{dur_min // 60}h"
            lines.append(f"  {s_hour}:{s_min}{s_am} – {e_hour}:{e_min}{e_am} ({dur_label})")

    lines.append("")
    lines.append("Drafting instructions:")
    lines.append("- Draft a full time-blocked schedule using the free time above.")
    lines.append("- Include active habits in suitable gaps when possible.")
    lines.append("- Show the full draft to the user and ask yes/no before creating any new blocks.")
    lines.append("- After confirmation, create each accepted block with create_calendar_event.")

    return "\n".join(lines)


_CALENDAR_AI_EXECUTORS: dict[str, object] = {
    "create_calendar_event": _calendar_create_event,
    "get_calendar_events": _calendar_get_events,
    "get_calendar_events_range": _calendar_get_events,
    "move_event": _calendar_move_event,
    "rename_event": _calendar_rename_event,
    "extend_event": _calendar_extend_event,
    "delete_event": _calendar_delete_event,
    "plan_day": _calendar_plan_day,
}


def execute_calendar_tool(name: str, inputs: dict) -> str:
    """Execute a calendar AI tool by name and return its string result."""
    handler = _CALENDAR_AI_EXECUTORS.get(name)
    if handler is None:
        return f"Unknown calendar tool: {name}"
    try:
        return handler(inputs)  # type: ignore[operator]
    except Exception as exc:
        return f"Calendar tool error ({name}): {str(exc)[:300]}"


# ─── Tool registry ────────────────────────────────────────────────────────────

def get_available_tools(integrations: dict) -> list:
    """Return tool definitions based on available integrations and env config."""
    return TOOL_REGISTRY.get_tool_definitions(integrations)


# ─── Tool execution ───────────────────────────────────────────────────────────

def execute_tool(name: str, inputs: dict, integrations: dict) -> str:
    """Execute a tool by name and return a concise string result."""
    return TOOL_REGISTRY.execute(name, inputs, integrations)


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


def search_web(query: str) -> str:
    clean_query = query.strip()
    if not clean_query:
        return "Web search failed: query is required."

    tavily_api_key = (os.environ.get("TAVILY_API_KEY") or "").strip()
    if not tavily_api_key:
        return "Web search unavailable: missing TAVILY_API_KEY environment variable."

    payload = {
        "api_key": tavily_api_key,
        "query": clean_query,
        "search_depth": "advanced",
        "include_answer": True,
        "max_results": 5,
    }

    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json=payload,
            timeout=20,
        )
    except requests.RequestException as exc:
        return f"Web search failed: network error contacting Tavily: {exc}"

    if not response.ok:
        return f"Web search failed: Tavily returned {response.status_code}: {response.text[:300]}"

    try:
        data = response.json()
    except ValueError:
        return "Web search failed: Tavily returned invalid JSON."

    answer = str(data.get("answer") or "").strip()
    results = data.get("results") or []

    if not answer and not results:
        return "No web results found for that query."

    lines = []
    if answer:
        lines.append(f"Answer: {answer}")

    if results:
        lines.append("Sources:")
        for item in results[:5]:
            title = str(item.get("title") or "Untitled")
            url = str(item.get("url") or "")
            content = str(item.get("content") or "").replace("\n", " ").strip()
            snippet = content[:220] + ("..." if len(content) > 220 else "")
            if url:
                lines.append(f"- {title} ({url})")
            else:
                lines.append(f"- {title}")
            if snippet:
                lines.append(f"  {snippet}")

    return "\n".join(lines)[:4000]


def _manage_booking(inputs: dict) -> str:
    inferred_category = _infer_event_category(
        request_text=str(inputs.get("request_text", "")),
        customer_name=str(inputs.get("customer_name", "")),
        service=str(inputs.get("service", "")),
        explicit_category=str(inputs.get("category", "")),
    )
    return book_calendar_appointment(
        customer_name=inputs["customer_name"],
        customer_email=inputs["customer_email"],
        start_time=inputs["start_time"],
        category=inferred_category,
    )


def _normalize_event_category(value: str) -> str:
    lowered = value.strip().lower()
    if lowered in {"business", "chore", "personal"}:
        return lowered
    return ""


def _infer_event_category(request_text: str, customer_name: str, service: str, explicit_category: str) -> str:
    explicit = _normalize_event_category(explicit_category)
    if explicit:
        return explicit

    text = f"{request_text} {service}".strip().lower()

    chore_keywords = [
        "walk the dog",
        "pick up milk",
        "take out the trash",
        "laundry",
        "grocery",
        "groceries",
        "clean",
        "chore",
    ]
    if any(keyword in text for keyword in chore_keywords):
        return "chore"

    business_keywords = [
        "client",
        "customer",
        "haircut",
        "service",
        "consultation",
    ]
    if any(keyword in text for keyword in business_keywords):
        return "business"

    candidate_name = customer_name.strip().lower()
    if candidate_name and request_text.strip():
        if candidate_name in request_text.strip().lower() and candidate_name not in {"me", "myself", "i"}:
            return "business"

    return "personal"


def _search_customer_memories(inputs: dict) -> str:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        return "Memory lookup unavailable: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY."

    query = str(inputs.get("query", "")).strip()
    if not query:
        return "Memory lookup failed: query is required."

    limit = min(max(int(inputs.get("limit", 5)), 1), 10)
    params: dict[str, str] = {
        "select": "id,customer_id,preference_text,created_at",
        "order": "created_at.desc",
        "limit": str(limit),
        "preference_text": f"ilike.*{query}*",
    }

    if inputs.get("customer_id") is not None:
        params["customer_id"] = f"eq.{int(inputs['customer_id'])}"

    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/{SUPABASE_MEMORY_TABLE}",
            headers={
                "apikey": supabase_key,
                "Authorization": f"Bearer {supabase_key}",
                "Accept": "application/json",
            },
            params=params,
            timeout=15,
        )
    except requests.RequestException as exc:
        return f"Memory lookup failed: network error contacting Supabase: {exc}"

    if not r.ok:
        if r.status_code == 404 and SUPABASE_MEMORY_TABLE != "memories":
            return f"Memory lookup failed: Supabase table '{SUPABASE_MEMORY_TABLE}' was not found. Set SUPABASE_MEMORY_TABLE to the correct exposed table name."
        if r.status_code == 404:
            return "Memory lookup failed: the Supabase memories table was not found. Check that the table exists and is exposed via PostgREST, or set SUPABASE_MEMORY_TABLE to the correct table name."
        return f"Memory lookup failed: Supabase returned {r.status_code}: {r.text[:200]}"

    rows = r.json()
    if not rows:
        return f"No customer memories found for query: '{query}'."

    lines = [f"Found {len(rows)} memory item(s):"]
    for row in rows:
        pref = (row.get("preference_text") or "").strip().replace("\n", " ")
        lines.append(
            f"- memory_id={row.get('id')} customer_id={row.get('customer_id')} "
            f"created_at={row.get('created_at')} preference={pref[:240]}"
        )
    return "\n".join(lines)


def _read_agent_memory(inputs: dict) -> str:
    agent_name = str(inputs.get("agent_name", "")).strip()
    if not agent_name:
        return "Agent memory lookup failed: agent_name is required."

    try:
        response = httpx.get(
            f"{BACKEND_URL}/api/agents/memory/by-name",
            params={"name": agent_name},
            timeout=15,
        )
    except Exception as exc:
        return f"Agent memory lookup failed: network error contacting backend: {exc}"

    if response.status_code == 404:
        return f"No agent found with name '{agent_name}'."

    if not response.is_success:
        return f"Agent memory lookup failed: backend returned {response.status_code}: {response.text[:200]}"

    data = response.json()
    returned_name = str(data.get("name") or agent_name)
    memory = str(data.get("memory") or "").strip()
    if not memory:
        return f"Agent '{returned_name}' has no memory yet."

    return f"Memory for {returned_name}:\n{memory[:4000]}"


def _set_goal(inputs: dict, integrations: dict) -> str:
    goal_text = str(inputs.get("goal_text", "")).strip()
    if not goal_text:
        return "Goal creation failed: goal_text is required."

    visible_agent_ids = inputs.get("visible_agent_ids")
    if not isinstance(visible_agent_ids, list):
        visible_agent_ids = []

    cleaned_agent_ids = [str(agent_id).strip() for agent_id in visible_agent_ids if str(agent_id).strip()]
    if not cleaned_agent_ids:
        agent_id = str(integrations.get("agent_id") or "").strip()
        if agent_id:
            cleaned_agent_ids = [agent_id]

    payload = {
        "goal_text": goal_text,
        "visible_agent_ids": cleaned_agent_ids,
    }

    try:
        response = httpx.post(f"{BACKEND_URL}/api/goals/current", json=payload, timeout=15)
    except Exception as exc:
        return f"Goal creation failed: network error contacting backend: {exc}"

    if response.status_code >= 400:
        return f"Goal creation failed: backend returned {response.status_code}: {response.text[:200]}"

    data = response.json()
    created = data.get("created") or {}
    created_text = str(created.get("goal_text") or goal_text).strip()
    plan = str(inputs.get("how_to_achieve") or "").strip()

    agent_name = str(integrations.get("agent_name") or "").strip()
    agent_id = str(integrations.get("agent_id") or "").strip()
    if agent_name:
        try:
            memory_response = httpx.get(
                f"{BACKEND_URL}/api/agents/memory/by-name",
                params={"name": agent_name},
                timeout=15,
            )
            if memory_response.is_success:
                current_memory = str((memory_response.json() or {}).get("memory") or "").strip()
                goal_note_lines = [f"Active goal: {created_text}"]
                if plan:
                    goal_note_lines.append(f"Goal approach: {plan}")
                else:
                    goal_note_lines.append("Goal approach: Ask how do you want to achieve this goal?")
                goal_note = "\n".join(goal_note_lines)
                updated_memory = f"{current_memory}\n\n{goal_note}".strip() if current_memory else goal_note

                if agent_id:
                    httpx.patch(
                        f"{BACKEND_URL}/api/agents/{agent_id}",
                        json={"memory": updated_memory},
                        timeout=15,
                    )
        except Exception:
            pass

    if plan:
        return (
            f"Goal saved: {created_text}\n"
            f"Plan remembered: {plan}\n"
            "Next ask the user for the first concrete step if they have not already given one."
        )

    return (
        f"Goal saved: {created_text}\n"
        "Ask the user: How do you want to achieve this goal?"
    )


def _read_document_content(inputs: dict) -> str:
    document_id = str(inputs.get("document_id", "")).strip()
    if not document_id:
        return "Document lookup failed: document_id is required."

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        return "Document lookup unavailable: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY."

    try:
        client = _get_supabase_client()
    except Exception as exc:
        return f"Document lookup unavailable: {exc}"

    try:
        response = (
            client.table(SUPABASE_DOCUMENTS_TABLE)
            .select("document_id,id,name,url,storage_path,mime_type")
            .or_(f"document_id.eq.{document_id},id.eq.{document_id}")
            .limit(1)
            .execute()
        )
    except Exception as exc:
        return f"Document lookup failed: unable to query documents table: {exc}"

    rows = response.data or []
    if not rows:
        return f"Document lookup failed: no document found for document_id '{document_id}'."

    row = rows[0]
    storage_path = str(row.get("storage_path") or "").strip()
    file_url = str(row.get("url") or "").strip()
    mime_type = str(row.get("mime_type") or "").strip().lower()
    name = str(row.get("name") or row.get("file_name") or document_id).strip()

    if mime_type and mime_type != "application/pdf":
        return f"Document lookup failed: '{name}' is not a PDF file (mime_type={mime_type})."

    # Prefer storage_path for direct download from the user_docs bucket.
    file_bytes: bytes | None = None
    source_label = ""

    try:
        if storage_path:
            bucket_candidates = [SUPABASE_DOCUMENTS_BUCKET]
            if SUPABASE_DOCUMENTS_BUCKET != "documents":
                bucket_candidates.append("documents")
            for bucket_name in bucket_candidates:
                try:
                    download_response = client.storage.from_(bucket_name).download(storage_path)
                    if hasattr(download_response, "data") and download_response.data:
                        file_bytes = bytes(download_response.data)
                        source_label = f"storage:{bucket_name}:{storage_path}"
                        break
                except Exception:
                    continue
        elif file_url:
            if "/storage/v1/object/" in file_url:
                object_path = file_url.split("/storage/v1/object/")[-1]
                object_path = object_path.split("?")[0].strip("/")
                if object_path:
                    bucket_candidates = [SUPABASE_DOCUMENTS_BUCKET]
                    if SUPABASE_DOCUMENTS_BUCKET != "documents":
                        bucket_candidates.append("documents")
                    for bucket_name in bucket_candidates:
                        try:
                            download_response = client.storage.from_(bucket_name).download(object_path)
                            if hasattr(download_response, "data") and download_response.data:
                                file_bytes = bytes(download_response.data)
                                source_label = f"url:{bucket_name}:{file_url}"
                                break
                        except Exception:
                            continue
    except Exception:
        file_bytes = None

    if not file_bytes:
        if file_url:
            try:
                download = httpx.get(file_url, timeout=30)
                download.raise_for_status()
                file_bytes = download.content
                source_label = file_url
            except Exception as exc:
                return f"Document lookup failed: unable to download file for '{name}': {exc}"
        else:
            return f"Document lookup failed: no downloadable file URL or storage path for '{name}'."

    if not file_bytes:
        return f"Document lookup failed: unable to read file bytes for '{name}'."

    try:
        import fitz  # PyMuPDF
    except Exception as exc:
        return f"Document lookup failed: PyMuPDF is not available: {exc}"

    extracted_text = ""
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        extracted_text = "\n".join(page.get_text("text") for page in doc)
        doc.close()
    except Exception as exc:
        return f"Document lookup failed: could not extract PDF text from '{name}': {exc}"

    words = extracted_text.split()
    if not words:
        return f"No text found in document '{name}'."

    snippet = " ".join(words[:2000])
    return (
        f"Document: {name}\n"
        f"document_id: {document_id}\n"
        f"source: {source_label or file_url or storage_path or 'unknown'}\n\n"
        f"{snippet}"
    )


def _get_supabase_client() -> Client:
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY")
    return create_client(supabase_url, supabase_key)


def _get_timezone_from_ip() -> ZoneInfo | None:
    """Detect timezone from user's IP location (cached for 1 hour)."""
    cache_key = "_detected_tz_cache"

    if hasattr(_get_timezone_from_ip, cache_key):
        cached = getattr(_get_timezone_from_ip, cache_key)
        if cached and isinstance(cached, tuple):
            cached_tz, cached_time = cached
            if isinstance(cached_time, float) and (datetime.now().timestamp() - cached_time) < 3600:
                try:
                    return ZoneInfo(cached_tz)
                except Exception:
                    pass

    try:
        response = httpx.get("https://ipapi.co/json/", timeout=3)
        if response.status_code == 200:
            data = response.json()
            tz_name = data.get("timezone")
            if tz_name:
                setattr(_get_timezone_from_ip, cache_key, (tz_name, datetime.now().timestamp()))
                try:
                    return ZoneInfo(tz_name)
                except Exception:
                    pass
    except Exception:
        pass

    return None


def _get_agent_timezone():
    # Priority 1: Explicit environment configuration
    tz_name = (os.environ.get("AGENT_TIMEZONE") or os.environ.get("CAL_TIMEZONE") or "").strip()
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass

    # Priority 2: Auto-detect from IP geolocation
    detected_tz = _get_timezone_from_ip()
    if detected_tz:
        return detected_tz

    # Priority 3: System timezone
    system_tz = datetime.now().astimezone().tzinfo
    if system_tz:
        return system_tz

    # Fallback: UTC
    return timezone.utc


def _to_utc_iso_z(value: datetime) -> str:
    utc_value = value.astimezone(timezone.utc).replace(microsecond=0)
    return utc_value.isoformat().replace("+00:00", "Z")


def _parse_event_time(value: object) -> datetime:
    agent_tz = _get_agent_timezone()

    def _parse_clock_time(raw: str) -> tuple[int, int] | None:
        text = raw.strip().lower()
        m12 = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", text)
        if m12:
            hour = int(m12.group(1))
            minute = int(m12.group(2) or "0")
            ampm = m12.group(3)
            if hour < 1 or hour > 12 or minute < 0 or minute > 59:
                return None
            if ampm == "pm" and hour != 12:
                hour += 12
            if ampm == "am" and hour == 12:
                hour = 0
            return hour, minute

        m24 = re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)", text)
        if m24:
            return int(m24.group(1)), int(m24.group(2))

        return None

    def _parse_relative_datetime(raw: str) -> datetime | None:
        text = raw.strip().lower()
        now_local = datetime.now(agent_tz)

        simple = re.fullmatch(r"(today|tomorrow)\s+at\s+(.+)", text)
        if simple:
            day_word = simple.group(1)
            time_part = simple.group(2)
            parsed_clock = _parse_clock_time(time_part)
            if not parsed_clock:
                return None
            hour, minute = parsed_clock
            base_date = now_local.date()
            if day_word == "tomorrow":
                from datetime import timedelta
                base_date = base_date + timedelta(days=1)
            return datetime(base_date.year, base_date.month, base_date.day, hour, minute, tzinfo=agent_tz)

        weekday_match = re.fullmatch(
            r"(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+(.+))?",
            text,
        )
        if weekday_match:
            weekday_map = {
                "monday": 0,
                "tuesday": 1,
                "wednesday": 2,
                "thursday": 3,
                "friday": 4,
                "saturday": 5,
                "sunday": 6,
            }
            target_weekday = weekday_map[weekday_match.group(1)]
            time_part = weekday_match.group(2) or "09:00"
            parsed_clock = _parse_clock_time(time_part)
            if not parsed_clock:
                return None
            hour, minute = parsed_clock

            from datetime import timedelta
            days_ahead = (target_weekday - now_local.weekday()) % 7
            candidate_date = now_local.date() + timedelta(days=days_ahead)
            candidate = datetime(candidate_date.year, candidate_date.month, candidate_date.day, hour, minute)

            candidate_with_tz = candidate.replace(tzinfo=agent_tz)
            if candidate_with_tz <= now_local:
                candidate_date = candidate_date + timedelta(days=7)
                candidate = datetime(candidate_date.year, candidate_date.month, candidate_date.day, hour, minute)

            if text.startswith("next ") and days_ahead == 0:
                candidate_date = candidate_date + timedelta(days=7)
                candidate = datetime(candidate_date.year, candidate_date.month, candidate_date.day, hour, minute)

            return candidate.replace(tzinfo=agent_tz)

        return None

    def _parse_explicit_datetime(raw: str) -> datetime | None:
        text = raw.strip()
        if not text:
            return None

        month_map = {
            "january": 1,
            "february": 2,
            "march": 3,
            "april": 4,
            "may": 5,
            "june": 6,
            "july": 7,
            "august": 8,
            "september": 9,
            "october": 10,
            "november": 11,
            "december": 12,
        }

        local_now = datetime.now(agent_tz)

        # ISO local date with optional time, e.g. 2026-04-21 or 2026-04-21 2pm
        iso_local = re.fullmatch(
            r"(?P<year>\d{4})-(?P<month>\d{2})-(?P<day>\d{2})(?:[T\s]+(?P<time>.+))?",
            text,
            flags=re.IGNORECASE,
        )
        if iso_local:
            year = int(iso_local.group("year"))
            month = int(iso_local.group("month"))
            day = int(iso_local.group("day"))
            time_part = (iso_local.group("time") or "09:00").strip()
            parsed_clock = _parse_clock_time(time_part)
            if not parsed_clock:
                return None
            hour, minute = parsed_clock
            try:
                return datetime(year, month, day, hour, minute, tzinfo=agent_tz)
            except ValueError:
                return None

        # Month name forms, e.g. April 21st at 2pm
        month_first = re.fullmatch(
            r"(?P<month>[A-Za-z]+)\s+(?P<day>\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(?P<year>\d{4}))?(?:\s+at\s+(?P<time>.+))?",
            text,
            flags=re.IGNORECASE,
        )
        if month_first:
            month = month_map.get(month_first.group("month").lower())
            if not month:
                return None

            day = int(month_first.group("day"))
            year = int(month_first.group("year") or local_now.year)
            time_part = (month_first.group("time") or "09:00").strip()
            parsed_clock = _parse_clock_time(time_part)
            if not parsed_clock:
                return None
            hour, minute = parsed_clock
            try:
                return datetime(year, month, day, hour, minute, tzinfo=agent_tz)
            except ValueError:
                return None

        return None

    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=agent_tz)
    if not isinstance(value, str):
        raise ValueError("Invalid event_time value")

    candidate = value.strip()
    if not candidate:
        raise ValueError("Invalid event_time value")

    try:
        normalized = candidate.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=agent_tz)
        return parsed
    except ValueError:
        explicit = _parse_explicit_datetime(candidate)
        if explicit is not None:
            return explicit
        relative = _parse_relative_datetime(candidate)
        if relative is not None:
            return relative
        raise ValueError("Invalid event_time value")


def _format_event_label(event_time: datetime, title: str, category: str) -> str:
    suffix = {
        "business": "Business",
        "chore": "Chore",
        "personal": "Personal",
    }.get(category.strip().lower(), "Personal")

    month_day = event_time.strftime("%B %d").replace(" 0", " ")
    hour = event_time.strftime("%I").lstrip("0") or "0"
    minute = event_time.strftime("%M")
    am_pm = event_time.strftime("%p").lower()
    return f"{month_day} at {hour}:{minute}{am_pm} - {title.strip()} ({suffix})"


def _get_calendar_events(inputs: dict) -> str:
    try:
        client = _get_supabase_client()
    except Exception as exc:
        return f"Calendar lookup unavailable: {exc}"

    current_time = datetime.now().astimezone()

    try:
        response = (
            client.table("events")
            .select("id,title,event_time,category")
            .gte("event_time", current_time.isoformat())
            .order("event_time", desc=False)
            .execute()
        )
    except Exception as exc:
        return f"Calendar lookup failed: {exc}"

    rows = response.data or []
    if not rows:
        return "No upcoming events found."

    lines = []
    for row in rows:
        try:
            event_time = _parse_event_time(row.get("event_time"))
            title = str(row.get("title", "")).strip() or "Untitled event"
            category = str(row.get("category", "personal"))
            lines.append(_format_event_label(event_time, title, category))
        except Exception:
            continue

    return "\n".join(lines) if lines else "No upcoming events found."


def add_calendar_event(title: str, start_time: str, category: str, description: str) -> str:
    clean_title = title.strip()
    clean_start_time = start_time.strip()
    clean_category = category.strip().lower()
    clean_description = description.strip()

    if not clean_title:
        clean_title = "Calendar item"
    if not clean_start_time:
        return "Could not add calendar event: start_time is required."
    if clean_category not in {"business", "chore", "personal"}:
        return "Could not add calendar event: category must be business, chore, or personal."

    try:
        parsed_time = _parse_event_time(clean_start_time)
    except Exception:
        return "Could not add calendar event: start_time must be a valid ISO 8601 date/time."
    iso_time_with_tz = _to_utc_iso_z(parsed_time)

    payload = {
        "title": clean_title,
        "event_time": iso_time_with_tz,
        "category": clean_category,
        "description": clean_description,
    }

    try:
        client = _get_supabase_client()
        response = client.table("events").insert(payload).execute()
    except Exception as exc:
        return f"Could not add calendar event: {exc}"

    inserted = (response.data or [{}])[0]
    event_id = inserted.get("id")
    id_suffix = f" (id: {event_id})" if event_id is not None else ""
    return (
        f"Success: Added '{clean_title}' on {payload['event_time']} "
        f"as {clean_category}.{id_suffix}"
    )


def update_calendar_event(
    event_id: object,
    title: object = None,
    start_time: object = None,
    category: object = None,
    description: object = None,
) -> str:
    try:
        clean_event_id = int(event_id)
    except Exception:
        return "Could not update calendar event: event_id must be an integer."

    updates: dict[str, object] = {}

    if title is not None:
        clean_title = str(title).strip()
        if not clean_title:
            return "Could not update calendar event: title cannot be empty."
        updates["title"] = clean_title

    if start_time is not None:
        clean_start_time = str(start_time).strip()
        if not clean_start_time:
            return "Could not update calendar event: start_time cannot be empty."
        try:
            parsed_time = _parse_event_time(clean_start_time)
        except Exception:
            return "Could not update calendar event: start_time must be a valid ISO 8601 date/time."
        updates["event_time"] = _to_utc_iso_z(parsed_time)

    if category is not None:
        clean_category = str(category).strip().lower()
        if clean_category not in {"business", "chore", "personal"}:
            return "Could not update calendar event: category must be business, chore, or personal."
        updates["category"] = clean_category

    if description is not None:
        updates["description"] = str(description).strip()

    if not updates:
        return "Could not update calendar event: provide at least one field to update."

    try:
        client = _get_supabase_client()
        response = (
            client.table("events")
            .update(updates)
            .eq("id", clean_event_id)
            .execute()
        )
    except Exception as exc:
        return f"Could not update calendar event: {exc}"

    updated_rows = response.data or []
    if not updated_rows:
        return f"Could not update calendar event: no event found with id {clean_event_id}."

    return f"Success: Updated event {clean_event_id}."


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


def _cal_headers(api_key: str, api_version: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "cal-api-version": api_version,
    }


def _cal_request(method: str, url: str, api_key: str, cal_api_version: str, **kwargs):
    try:
        return requests.request(
            method,
            url,
            headers=_cal_headers(api_key, cal_api_version),
            verify=certifi.where(),
            **kwargs,
        )
    except requests.exceptions.SSLError as exc:
        warnings.warn(
            f"Cal.com SSL verification failed for {url}; retrying with verify=False for debugging only: {exc}",
            RuntimeWarning,
        )
        return requests.request(
            method,
            url,
            headers=_cal_headers(api_key, cal_api_version),
            verify=False,
            **kwargs,
        )


def _is_strict_iso_utc(value: str) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value))


def _normalize_booking_start_time(start_time: str) -> tuple[str | None, str | None]:
    candidate = start_time.strip()

    try:
        parsed_local = _parse_event_time(candidate)
    except ValueError:
        return None, (
            "Unable to book appointment: start_time must be an ISO date/time or local natural language "
            "like 'tomorrow at 3pm' or 'monday at 09:00'."
        )

    parsed_utc = parsed_local.astimezone(timezone.utc)
    if parsed_utc <= datetime.now(timezone.utc):
        return None, "Unable to book appointment: the requested time has already passed."

    return parsed_utc.strftime("%Y-%m-%dT%H:%M:%SZ"), None


def _resolve_cal_booking_target(api_key: str, cal_api_version: str) -> tuple[dict, str | None, str | None]:
    event_type_id = os.environ.get("CAL_EVENT_TYPE_ID")
    event_type_slug = os.environ.get("CAL_EVENT_TYPE_SLUG")
    username = os.environ.get("CAL_USERNAME")
    team_slug = os.environ.get("CAL_TEAM_SLUG")
    organization_slug = os.environ.get("CAL_ORGANIZATION_SLUG")
    event_type_name = os.environ.get("CAL_EVENT_TYPE_NAME")
    allow_discovery = (os.environ.get("CAL_ALLOW_EVENT_TYPE_DISCOVERY") or "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    if event_type_id:
        try:
            return {"eventTypeId": int(event_type_id)}, None, f"eventTypeId={event_type_id}"
        except ValueError:
            return {}, "Unable to book appointment: CAL_EVENT_TYPE_ID must be an integer.", None

    if event_type_slug and username:
        target = {"eventTypeSlug": event_type_slug, "username": username}
        if team_slug:
            target["teamSlug"] = team_slug
        if organization_slug:
            target["organizationSlug"] = organization_slug
        return target, None, event_type_slug

    if not allow_discovery:
        return (
            {},
            "Unable to book appointment: no explicit Cal booking target is configured. "
            "Set CAL_EVENT_TYPE_ID directly (recommended), or set CAL_EVENT_TYPE_SLUG with CAL_USERNAME. "
            "Automatic discovery is disabled by default.",
            None,
        )

    base_url = _cal_api_base_url()
    endpoint_candidates = [
        f"{base_url}/v2/event-types",
    ]

    et_resp = None
    last_error = None
    for endpoint in endpoint_candidates:
        try:
            resp = _cal_request(
                "GET",
                endpoint,
                api_key,
                cal_api_version,
                timeout=15,
            )
        except requests.RequestException as exc:
            last_error = f"{endpoint}: {exc}"
            continue

        if resp.status_code == 404:
            last_error = f"{endpoint}: returned 404"
            continue

        et_resp = resp
        break

    if et_resp is None:
        if event_type_id:
            try:
                return {"eventTypeId": int(event_type_id)}, None, f"eventTypeId={event_type_id}"
            except ValueError:
                return {}, "Unable to book appointment: CAL_EVENT_TYPE_ID must be an integer.", None
        return (
            {},
            "Unable to book appointment: Cal v2 event type discovery failed (event-types endpoint returned 404 or was unreachable). "
            "Set CAL_EVENT_TYPE_ID directly, or verify CAL_API_BASE_URL and CAL_API_VERSION (2026-02-25 or newer).",
            None,
        )

    if not et_resp.ok:
        return (
            {},
            "Unable to book appointment: could not load Cal event types. "
            f"Cal returned {et_resp.status_code}: {et_resp.text[:200]}",
            None,
        )

    try:
        et_json = et_resp.json()
    except ValueError:
        return {}, "Unable to book appointment: Cal event-types response was not valid JSON.", None

    candidates = []
    if isinstance(et_json, dict):
        data = et_json.get("data", et_json)
        if isinstance(data, list):
            candidates = data
        elif isinstance(data, dict):
            inner = data.get("eventTypes") or data.get("items") or []
            if isinstance(inner, list):
                candidates = inner

    usable = [c for c in candidates if isinstance(c, dict) and c.get("id")]
    if not usable:
        return (
            {},
            "Unable to book appointment: no Cal event types were found for this API key. "
            "Create an event type in Cal or set CAL_EVENT_TYPE_ID explicitly.",
            None,
        )

    chosen = None
    if event_type_slug:
        slug_l = event_type_slug.strip().lower()
        chosen = next((c for c in usable if str(c.get("slug", "")).strip().lower() == slug_l), None)

    if not chosen and event_type_name:
        name_l = event_type_name.strip().lower()
        chosen = next(
            (
                c
                for c in usable
                if str(c.get("title", c.get("name", ""))).strip().lower() == name_l
            ),
            None,
        )
        if not chosen:
            available = ", ".join(
                str(c.get("title", c.get("name", c.get("slug", c.get("id", "unknown")))))
                for c in usable[:8]
            )
            return (
                {},
                "Unable to book appointment: CAL_EVENT_TYPE_NAME did not match any Cal event type. "
                f"Configured='{event_type_name}'. Available: {available}",
                None,
            )

    if not chosen:
        chosen = usable[0]

    chosen_label = str(chosen.get("title", chosen.get("name", chosen.get("slug", chosen["id"]))) )
    return {"eventTypeId": int(chosen["id"])}, None, chosen_label


def book_calendar_appointment(customer_name: str, customer_email: str, start_time: str, category: str = "personal") -> str:
    """Create a Cal.com booking for a customer at the provided start time."""
    api_key = os.environ.get("CAL_API_KEY")
    if not api_key:
        return "Unable to book appointment: missing CAL_API_KEY environment variable."
    if not api_key.startswith("cal_"):
        return "Unable to book appointment: CAL_API_KEY must start with 'cal_'."

    cal_api_version = _cal_api_version()
    booking_target, resolve_error, matched_event_type = _resolve_cal_booking_target(api_key, cal_api_version)
    if resolve_error:
        return resolve_error
    normalized_start_time, start_time_error = _normalize_booking_start_time(start_time)
    if start_time_error:
        return start_time_error
    normalized_category = _normalize_event_category(category) or "personal"

    payload = {
        "start": normalized_start_time,
        "attendee": {
            "name": customer_name,
            "email": customer_email,
            "timeZone": os.environ.get("CAL_TIMEZONE", "UTC"),
        },
    }
    payload.update(booking_target)
    if "eventTypeId" in payload:
        payload["eventTypeId"] = int(payload["eventTypeId"])

    try:
        response = _cal_request(
            "POST",
            f"{_cal_api_base_url()}/v2/bookings",
            api_key,
            cal_api_version,
            json=payload,
            timeout=15,
        )
    except requests.RequestException as exc:
        return f"Unable to book appointment: network error while contacting Cal.com: {exc}"

    if response.ok:
        try:
            data = response.json()
        except ValueError:
            data = {}
        booking_data = data.get("data", data) if isinstance(data, dict) else {}
        booking_start = str(booking_data.get("start") or normalized_start_time or start_time)
        booking_end = str(booking_data.get("end") or "")
        booking_status = str(booking_data.get("status") or "scheduled")
        booking_uid = booking_data.get("uid") or booking_data.get("id") or "unknown"

        sync_message = ""
        try:
            event_type_id = payload.get("eventTypeId")
            sync_payload = {
                "customer_name": customer_name,
                "customer_email": customer_email,
                "start_time": booking_start,
                "end_time": booking_end or None,
                "status": booking_status,
                "category": normalized_category,
                "cal_booking_uid": booking_uid,
                "cal_booking_id": booking_data.get("id") or None,
                "event_type_id": int(event_type_id) if event_type_id is not None else None,
            }
            sync_payload = {k: v for k, v in sync_payload.items() if v is not None}
            sync_response = httpx.post(
                f"{BACKEND_URL}/api/appointments/sync",
                json=sync_payload,
                timeout=15,
            )
            if sync_response.ok:
                sync_message = " Saved to the calendar dashboard."
            else:
                sync_message = (
                    f" Booking saved in Cal, but sync to the dashboard failed: "
                    f"{sync_response.status_code} {sync_response.text[:200]}"
                )
        except Exception as exc:
            sync_message = f" Booking saved in Cal, but sync to the dashboard failed: {exc}"

        booking_ref = (
            booking_uid
            or (booking_data.get("booking", {}) if isinstance(booking_data, dict) else {}).get("uid")
            or "unknown"
        )
        return (
            f"Appointment booked successfully for {customer_name} at {normalized_start_time or start_time}. "
            f"Category: {normalized_category}. "
            f"Normalized time: {normalized_start_time or start_time}. "
            f"Event type: {matched_event_type or 'unknown'}. "
            f"Reference: {booking_ref}."
            f"{sync_message}"
        )

    error_reason = response.text.strip()
    try:
        err_json = response.json()
        if isinstance(err_json, dict):
            error_reason = (
                err_json.get("message")
                or err_json.get("error")
                or err_json.get("details")
                or error_reason
            )
    except ValueError:
        pass

    if not error_reason:
        error_reason = "Unknown API error"

    return (
        f"Unable to book appointment: Cal.com API returned {response.status_code}. "
        f"Reason: {error_reason}"
    )


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


# ─── Workflow tool executors ──────────────────────────────────────────────────

def _list_workflows(integrations: dict) -> str:
    user_id = integrations.get("user_id", "")
    r = httpx.get(f"{BACKEND_URL}/api/workflows", timeout=10)
    r.raise_for_status()
    workflows = r.json()
    if not workflows:
        return "No workflows saved yet."
    lines = []
    for w in workflows:
        lines.append(f"[{w['id']}] {w['name']} — {w.get('status', 'draft')} | {w.get('description') or 'no description'}")
    return f"{len(workflows)} workflow(s):\n\n" + "\n".join(lines)


def _get_workflow(inputs: dict, integrations: dict) -> str:
    wid = inputs["workflow_id"]
    r = httpx.get(f"{BACKEND_URL}/api/workflows/{wid}", timeout=10)
    if r.status_code == 404:
        return f"Workflow {wid} not found."
    r.raise_for_status()
    w = r.json()
    nodes = w.get("nodes", [])
    edges = w.get("edges", [])
    node_lines = [f"  [{n.get('type', '?')}] {n.get('id')} — {n.get('data', {}).get('label', n.get('label', ''))}" for n in nodes]
    edge_lines = [f"  {e.get('source')} → {e.get('target')}" + (f" ({e.get('label')})" if e.get('label') else "") for e in edges]
    return (
        f"Workflow: {w['name']} [{w.get('status', 'draft')}]\n"
        f"Description: {w.get('description') or 'none'}\n\n"
        f"Nodes ({len(nodes)}):\n" + "\n".join(node_lines) + "\n\n"
        f"Edges ({len(edges)}):\n" + "\n".join(edge_lines)
    )


def _build_workflow(inputs: dict, integrations: dict) -> str:
    """Create a workflow. Auto-assign positions to nodes for display on canvas."""
    nodes = inputs["nodes"]
    edges = inputs.get("edges", [])

    # Auto-assign positions so nodes lay out vertically on the canvas
    positioned_nodes = []
    for i, node in enumerate(nodes):
        positioned_nodes.append({
            "id": node["id"],
            "type": node["type"],
            "position": {"x": 250, "y": i * 120},
            "data": {
                "label": node.get("label", ""),
                "capability": node.get("capability"),
                "parameters": node.get("parameters", {}),
            },
        })

    payload = {
        "name": inputs["name"],
        "description": inputs.get("description", ""),
        "nodes": positioned_nodes,
        "edges": edges,
        "status": "draft",
    }
    r = httpx.post(f"{BACKEND_URL}/api/workflows", json=payload, timeout=10)
    r.raise_for_status()
    w = r.json()
    return (
        f"Workflow '{w['name']}' created with {len(positioned_nodes)} nodes.\n"
        f"ID: {w['id']}\n"
        f"Open in canvas: /workflows/{w['id']}"
    )


def _update_workflow(inputs: dict, integrations: dict) -> str:
    wid = inputs["workflow_id"]
    payload = {}
    if "name" in inputs:
        payload["name"] = inputs["name"]
    if "description" in inputs:
        payload["description"] = inputs["description"]
    if "nodes" in inputs:
        payload["nodes"] = inputs["nodes"]
    if "edges" in inputs:
        payload["edges"] = inputs["edges"]
    if "status" in inputs:
        payload["status"] = inputs["status"]

    if not payload:
        return "Nothing to update — provide at least one field."

    r = httpx.put(f"{BACKEND_URL}/api/workflows/{wid}", json=payload, timeout=10)
    if r.status_code == 404:
        return f"Workflow {wid} not found."
    r.raise_for_status()
    w = r.json()
    return f"Workflow '{w['name']}' updated. Open in canvas: /workflows/{w['id']}"


# ─── Activepieces tool executors ──────────────────────────────────────────────
# All AP calls go through the backend proxy at BACKEND_URL/api/activepieces/*
# Auth (email/password) is handled by the backend — no API key needed here.


def _list_automations() -> str:
    try:
        r = httpx.get(f"{BACKEND_URL}/api/activepieces/flows", timeout=10)
        if r.status_code == 503:
            data = r.json()
            return f"Could not reach Activepieces: {data.get('error', 'unknown error')}. Is Docker running?"
        r.raise_for_status()
        data = r.json()
        flows = data.get("data", [])
        if not flows:
            return "No automation flows found yet. Ask me to create one!"
        lines = [
            f"[{f['id']}] {f.get('displayName', 'Untitled')} — {f.get('status', 'unknown')}"
            for f in flows
        ]
        return f"{len(flows)} flow(s):\n\n" + "\n".join(lines)
    except Exception as e:
        return f"Could not reach Activepieces: {str(e)[:200]}. Is Docker running?"


def _trigger_automation(inputs: dict) -> str:
    flow_name = inputs["flow_name"].lower()
    try:
        r = httpx.get(f"{BACKEND_URL}/api/activepieces/flows", timeout=10)
        r.raise_for_status()
        flows = r.json().get("data", [])
        match = next((f for f in flows if flow_name in f.get("displayName", "").lower()), None)
        if not match:
            names = ", ".join(f.get("displayName", f["id"]) for f in flows[:5])
            return f"No flow matching '{inputs['flow_name']}'. Available: {names or 'none'}"

        r2 = httpx.post(f"{BACKEND_URL}/api/activepieces/flows/{match['id']}/run", timeout=15)
        data = r2.json()
        if "error" in data:
            return f"Could not trigger flow: {data['error']}"
        return f"Flow '{match.get('displayName', match['id'])}' triggered successfully."
    except Exception as e:
        return f"Failed to trigger flow: {str(e)[:200]}"


def _create_automation(inputs: dict) -> str:
    try:
        r = httpx.post(
            f"{BACKEND_URL}/api/activepieces/flows/build",
            json=inputs,
            timeout=20,
        )
        data = r.json()
        if "error" in data:
            err = data["error"]
            # Give the user something actionable, not a hallucinated fix
            if "401" in err or "403" in err or "auth" in err.lower():
                return (
                    "Activepieces authentication failed. "
                    "Check that ACTIVEPIECES_EMAIL and ACTIVEPIECES_PASSWORD in .env "
                    "match the account at localhost:8080, then restart the backend."
                )
            return (
                f"Could not create the automation in Activepieces. Error: {err}\n\n"
                "Make sure Docker is running (npm run dev from the cluster folder) "
                "and Activepieces is accessible at localhost:8080."
            )

        msg = data.get("message", "Automation created.")
        flow_id = data.get("flowId", "")
        needs = data.get("needsConnection", [])
        flow_url = f"http://localhost:8080/flows/{flow_id}" if flow_id else "http://localhost:8080"

        result = f"{msg}\n\nOpen the flow here: {flow_url}"
        if needs:
            result += (
                f"\n\nOne more step — connect these services (one-time OAuth, they'll work for all future automations too):\n"
                + "\n".join(f"  • {s}" for s in needs)
                + f"\n\nIn the flow, click the {needs[0]} step → Connect → log in. That's the only manual step."
                + "\n\nAfter connecting, hit Publish in the top right and the automation is live."
            )
        else:
            result += "\n\nAll services already connected. Open the flow and hit Publish to activate it."
        return result
    except Exception as e:
        return (
            f"Could not reach the automation service: {str(e)[:150]}\n"
            "Make sure Docker is running (npm run dev)."
        )


def _check_ap_connections() -> str:
    try:
        r = httpx.get(f"{BACKEND_URL}/api/activepieces/connections", timeout=10)
        if r.status_code == 503:
            return "Could not reach Activepieces. Is Docker running?"
        r.raise_for_status()
        data = r.json()
        connections = data.get("data", [])
        if not connections:
            return (
                "No services connected in Activepieces yet.\n"
                "Connect services at localhost:8080/connections."
            )
        lines = [f"  • {c.get('name', c.get('pieceName', 'unknown'))}" for c in connections]
        return f"Connected services ({len(connections)}):\n" + "\n".join(lines)
    except Exception as e:
        return f"Could not check connections: {str(e)[:200]}"


def _register_tool_registry() -> None:
    """Register all current tools into the central registry."""

    TOOL_REGISTRY.register_category(
        "Core",
        [
            (SEARCH_WEB_TOOL, lambda inputs, env: search_web(str(inputs.get("query", ""))), None),
            (BROWSE_WEBSITE_TOOL, lambda inputs, env: _browse_website(inputs, env), None),
            (READ_PAGE_CONTENT_TOOL, lambda inputs, env: _read_page_content(inputs), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Calendar",
        [
            (MANAGE_BOOKING_TOOL, lambda inputs, env: _manage_booking(inputs), None),
            (SAVE_EVENT_TOOL, lambda inputs, env: _manage_booking(inputs), None),
            (GET_CALENDAR_EVENTS_TOOL, lambda inputs, env: _get_calendar_events(inputs), None),
            (
                ADD_CALENDAR_EVENT_TOOL,
                lambda inputs, env: add_calendar_event(
                    title=str(inputs.get("title", "")),
                    start_time=str(inputs.get("start_time", "")),
                    category=str(inputs.get("category", "")),
                    description=str(inputs.get("description", "")),
                ),
                None,
            ),
            (
                UPDATE_CALENDAR_EVENT_TOOL,
                lambda inputs, env: update_calendar_event(
                    event_id=inputs.get("event_id"),
                    title=inputs.get("title"),
                    start_time=inputs.get("start_time"),
                    category=inputs.get("category"),
                    description=inputs.get("description"),
                ),
                None,
            ),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Goals",
        [
            (SET_GOAL_TOOL, lambda inputs, env: _set_goal(inputs, env), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Memory",
        [
            (SEARCH_CUSTOMER_MEMORIES_TOOL, lambda inputs, env: _search_customer_memories(inputs), None),
            (READ_AGENT_MEMORY_TOOL, lambda inputs, env: _read_agent_memory(inputs), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Documents",
        [
            (READ_DOCUMENT_CONTENT_TOOL, lambda inputs, env: _read_document_content(inputs), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Utilities",
        [
            (FILL_FORM_TOOL, lambda inputs, env: _fill_form(inputs), None),
            (CLICK_ELEMENT_TOOL, lambda inputs, env: _click_element(inputs), None),
            (SCREENSHOT_PAGE_TOOL, lambda inputs, env: _screenshot_page(inputs), None),
            (RUN_SCHEDULED_SUMMARY_TOOL, lambda inputs, env: _run_scheduled_summary(inputs), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Media",
        [
            (UPLOAD_TO_YOUTUBE_TOOL, lambda inputs, env: _upload_to_youtube(inputs), None),
            (POST_TO_INSTAGRAM_TOOL, lambda inputs, env: _post_to_instagram(inputs), None),
            (POST_TO_TIKTOK_TOOL, lambda inputs, env: _post_to_tiktok(inputs), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Workflow",
        [
            (LIST_WORKFLOWS_TOOL, lambda inputs, env: _list_workflows(env), None),
            (GET_WORKFLOW_TOOL, lambda inputs, env: _get_workflow(inputs, env), None),
            (BUILD_WORKFLOW_TOOL, lambda inputs, env: _build_workflow(inputs, env), None),
            (UPDATE_WORKFLOW_TOOL, lambda inputs, env: _update_workflow(inputs, env), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Automation",
        [
            (LIST_AUTOMATIONS_TOOL, lambda inputs, env: _list_automations(), None),
            (TRIGGER_AUTOMATION_TOOL, lambda inputs, env: _trigger_automation(inputs), None),
            (CREATE_AUTOMATION_TOOL, lambda inputs, env: _create_automation(inputs), None),
            (CHECK_AP_CONNECTIONS_TOOL, lambda inputs, env: _check_ap_connections(), None),
        ],
    )

    TOOL_REGISTRY.register_category(
        "Messaging",
        [
            (
                SEND_EMAIL_TOOL,
                lambda inputs, env: _send_email_smtp(inputs),
                lambda env: bool(os.environ.get("GMAIL_USER")),
            ),
            (
                SEND_SLACK_MESSAGE_TOOL,
                lambda inputs, env: _send_slack_message(inputs, env["slack_token"]),
                lambda env: bool(env.get("slack_token")),
            ),
            (
                CREATE_NOTION_PAGE_TOOL,
                lambda inputs, env: _create_notion_page(inputs, env["notion_token"]),
                lambda env: bool(env.get("notion_token")),
            ),
        ],
    )

    TOOL_REGISTRY.register_category("Expenses", [])


_register_tool_registry()
