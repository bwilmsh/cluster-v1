import asyncio
import os
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Literal

from client import get_client
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from prompts import (
    build_system_prompt,
    build_calendar_system_prompt,
    build_calendar_ai_system_prompt,
    build_cluster_system_prompt,
    build_group_system_prompt,
    QUESTION_GENERATION_PROMPT,
    GROUP_RELEVANCE_PROMPT,
    INITIAL_MEMORY_PROMPT,
    MEMORY_UPDATE_PROMPT,
)
from tools import get_available_tools, execute_tool, get_calendar_ai_tools, execute_calendar_tool

load_dotenv()

# If a local `agent/.env` exists but doesn't set `GROQ_API_KEY`, also try loading the repo root `.env`
# This ensures running the agent from the `agent/` folder still picks up the root `.env`.
if not os.environ.get("GROQ_API_KEY"):
    try:
        repo_root_env = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
        if os.path.exists(repo_root_env):
            # Override so a non-empty root .env will replace an empty local value
            load_dotenv(repo_root_env, override=True)
    except Exception:
        pass

app = FastAPI(title="Cluster Agent Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FAST_MODEL = os.environ.get("GROQ_FAST_MODEL", os.environ.get("GROQ_DEFAULT_MODEL", "llama-3.1-8b-instant"))
REASONING_MODEL = os.environ.get("GROQ_REASONING_MODEL", "llama-3.3-70b-versatile")
MODEL = FAST_MODEL
MAX_HISTORY = 4


MANAGER_ROUTER_PROMPT = """You are the Manager Agent in a multi-agent system.
Your job is to choose the best worker based on business context and the latest user message.

Workers:
- booking: use when the user wants to schedule/book/reschedule/cancel an appointment.
- customer: use when the user asks about a customer, their preferences, or memory/profile details.
- general: everything else.

Return ONLY compact JSON:
{"route":"booking|customer|general","reason":"short reason"}
"""


def _split_business_context(memory: str) -> tuple[str, str]:
    """Extract leading business context block from memory when present."""
    marker = "Business context:"
    if not memory or not memory.strip().startswith(marker):
        return "", memory

    parts = memory.split("\n\n", 1)
    business_context = parts[0].strip()
    remaining_memory = parts[1].strip() if len(parts) > 1 else ""
    return business_context, remaining_memory


def _truncate_text(text: str, limit: int = 600) -> str:
    cleaned = " ".join(text.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def _format_setup_answers(setup_answers: dict[str, Any]) -> str:
    items = [f"{key}: {value}" for key, value in setup_answers.items() if value]
    return "; ".join(items)


def _format_history(history: list[Any], limit: int = MAX_HISTORY) -> str:
    recent_history = history[-limit:] if len(history) > limit else history
    return "\n".join(f"{message.role}: {message.content}" for message in recent_history)


def _build_chat_context_message(
    agent_name: str,
    setup_answers: dict[str, Any],
    memory: str,
    business_context: str,
    integrations: dict[str, Any],
    files: list[dict[str, Any]],
) -> str:
    parts = [f"Agent context for {agent_name}."]
    answers = _format_setup_answers(setup_answers)
    if answers:
        parts.append(f"Setup: {answers}.")
    if memory:
        parts.append(f"Memory: {_truncate_text(memory, 450)}.")
    if business_context:
        parts.append(f"Business: {_truncate_text(business_context, 450)}.")
    connected = integrations.get("connected_integrations") or []
    if connected:
        parts.append(f"Connected integrations: {len(connected)}.")
    if files:
        parts.append(f"Files attached: {len(files)}.")
    return " ".join(parts)


def _build_group_context_message(
    agent_name: str,
    setup_answers: dict[str, Any],
    memory: str,
    members: list[dict],
    sender_name: str,
    history: list[dict],
    chat_name: str,
    integrations: dict[str, Any],
) -> str:
    self_member = next((member for member in members if member.get("name") == agent_name), {})
    role = self_member.get("role") or setup_answers.get("Business type / role") or "Team member"
    teammates = [member.get("name") for member in members if member.get("name") != agent_name and member.get("type") == "agent"]
    recent_history = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    lines = [f"Group chat: {chat_name}", f"Agent: {agent_name} ({role})", f"Sender: {sender_name}"]
    if teammates:
        lines.append(f"Teammates: {', '.join(teammates)}")
    answers = _format_setup_answers(setup_answers)
    if answers:
        lines.append(f"Setup: {answers}")
    if memory:
        lines.append(f"Memory: {_truncate_text(memory, 350)}")
    connected = integrations.get("connected_integrations") or []
    if connected:
        lines.append(f"Connected integrations: {len(connected)}")
    if recent_history:
        lines.append("Recent history:")
        lines.extend(f"- {entry['sender_name']}: {entry['content']}" for entry in recent_history)
    return "\n".join(lines)


def _build_cluster_context_message(workspace_context: str, integrations: dict[str, Any], history: list[Any]) -> str:
    recent_history = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    lines = [f"Workspace context:\n{_truncate_text(workspace_context, 1500)}"]
    connected = integrations.get("connected_integrations") or []
    if connected:
        lines.append(f"Connected integrations: {len(connected)}")
    if recent_history:
        lines.append("Recent chat:")
        lines.extend(f"- {entry.role}: {entry.content}" for entry in recent_history)
    return "\n".join(lines)


def _extract_text(content: list[Any]) -> str:
    return "".join(block.text for block in content if hasattr(block, "text"))


def _manager_route(
    client,
    business_context: str,
    message: str,
    history: list[Any],
) -> Literal["booking", "customer", "general"]:
    recent_history = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    history_text = "\n".join(f"{m.role}: {m.content}" for m in recent_history)
    manager_input = (
        f"Business Context:\n{business_context or '(none)'}\n\n"
        f"Recent conversation:\n{history_text or '(none)'}\n\n"
        f"Latest user message:\n{message}"
    )

    try:
        response = client.messages.create(
                model=FAST_MODEL,
            max_tokens=80,
            system=MANAGER_ROUTER_PROMPT,
            messages=[
                {"role": "user", "content": manager_input},
            ],
        )
        raw = "".join(block.text for block in response.content if hasattr(block, "text")).strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            payload = json.loads(raw[start:end])
            route = payload.get("route", "general")
            if route in ("booking", "customer", "general"):
                return route
    except Exception:
        pass

    text = message.lower()
    if any(k in text for k in ["book", "schedule", "appointment", "reschedule", "cancel", "remind", "reminder", "calendar", "build my day", "plan my day", "productivity"]):
        return "booking"
    if any(k in text for k in ["customer", "preference", "memory", "likes", "dislikes", "profile"]):
        return "customer"
    return "general"


def _worker_prompt_suffix(route: Literal["booking", "customer", "general"], business_context: str) -> str:
    common = "You are a worker in a multi-agent setup. Keep responses concise and never repeat hidden business context."
    if route == "booking":
        return common + " Booking worker: use add_calendar_event for calendar items, ask only for missing time, and avoid inventing customer details."
    if route == "customer":
        return common + " Customer worker: use search_customer_memories first and summarize clearly with uncertainty when needed."
    return common + " General worker: answer directly and briefly."





class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    agent_name: str
    agent_id: str = ""
    setup_answers: dict[str, Any] = {}
    memory: str = ""
    history: list[HistoryMessage] = []
    message: str
    integrations: dict[str, Any] = {}
    files: list[dict[str, Any]] = []


class GroupHistoryMessage(BaseModel):
    sender_name: str
    content: str
    role: str


class GroupChatRequest(BaseModel):
    agent_name: str
    setup_answers: dict[str, Any] = {}
    memory: str = ""
    members: list[dict[str, Any]] = []
    sender_name: str
    history: list[GroupHistoryMessage] = []
    message: str
    integrations: dict[str, Any] = {}
    chat_name: str = "Group Chat"


class GroupRelevanceRequest(BaseModel):
    message: str
    sender_name: str
    agents: list[dict[str, Any]]
    max_responders: int = 1
    context: str = ""  # optional: prior agent response for continuation checks


class GenerateQuestionsRequest(BaseModel):
    agent_name: str


class InitializeMemoryRequest(BaseModel):
    agent_name: str
    setup_answers: dict[str, Any]


class UpdateMemoryRequest(BaseModel):
    agent_id: str = ""
    agent_name: str
    current_memory: str
    conversation: str


class ClusterChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []
    workspace_context: str = ""
    integrations: dict[str, Any] = {}


class PreflightRequest(BaseModel):
    goal: str
    agent_name: str
    agent_id: str = ""
    connected_integrations: list[str] = []


class AutomateRequest(BaseModel):
    agent_name: str
    agent_id: str = ""
    setup_answers: dict[str, Any] = {}
    memory: str = ""
    goal: str
    integrations: dict[str, Any] = {}
    resume_state: dict | None = None  # set when resuming after a human answer


@app.get("/health")
def health():
    return {"status": "ok"}


def _retry_on_rate_limit(func, *args, max_retries=1, retry_delay=20, **kwargs):
    """
    Retry a function call if it hits a rate limit (429) error.
    Waits retry_delay seconds before retrying.
    """
    for attempt in range(max_retries + 1):
        try:
            return func(*args, **kwargs)
        except RuntimeError as e:
            error_msg = str(e)
            if ("rate_limit" in error_msg or "429" in error_msg) and attempt < max_retries:
                print(f"[PYTHON] Rate limit hit, retrying in {retry_delay}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(retry_delay)
            else:
                raise


def run_tool_use_loop(
    client,
    system_prompt: str,
    messages: list[dict],
    tools: list[dict],
    integrations: dict,
    model: str = MODEL,
    tool_executor=None,
) -> tuple[list[dict], list[Any]]:
    """
    Run the tool use loop until the model stops requesting tools.
    Returns the final messages list with tool results appended.
    tool_executor: optional callable(name, inputs) -> str overriding execute_tool.
    """
    _exec = tool_executor if tool_executor is not None else (
        lambda name, inputs: execute_tool(name, inputs, integrations)
    )
    while True:
        response = _retry_on_rate_limit(
            client.messages.create,
            model=model,
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
            # Only include tools when explicitly provided; basic chat sends no tools to reduce rate usage
            tools=tools if tools else None,
        )

        if response.stop_reason != "tool_use":
            # No more tool calls — return the final response content.
            return messages, list(response.content)

        # Execute client-side tool calls.
        tool_results = []
        for block in response.content:
            if block.type == "tool_use" and block.name != "web_search":
                result = _exec(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result[:4000],
                })

        # If all tool calls were native, there's nothing for us to execute.
        # Return the current response content so the caller can surface the final answer.
        if not tool_results:
            return messages, list(response.content)

        # Append assistant response + our tool results to messages
        messages = messages + [
            {"role": "assistant", "content": response.content},
            {"role": "user", "content": tool_results},
        ]


async def stream_chat(
    agent_name: str,
    agent_id: str,
    setup_answers: dict[str, Any],
    memory: str,
    history: list[HistoryMessage],
    message: str,
    integrations: dict[str, Any],
    files: list[dict[str, Any]],
) -> AsyncIterator[str]:
    print(f"[PYTHON] stream_chat called: agent={agent_name}, message_len={len(message)}, history_len={len(history)}")
    client = get_client()
    # Inject agent identity into integrations so browse_website can log activity
    enriched_integrations = {
        **integrations,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "user_id": integrations.get("user_id") or os.environ.get("PRISMATIC_USER_ID"),
        "external_customer_id": integrations.get("external_customer_id") or os.environ.get("PRISMATIC_EXTERNAL_CUSTOMER_ID"),
    }
    business_context, memory_without_context = _split_business_context(memory)
    route = _manager_route(client, business_context, message, history)
    print(f"[PYTHON] Route selected: {route}")
    system_prompt = build_system_prompt(
        agent_name,
        setup_answers,
        memory_without_context,
        files or [],
        enriched_integrations,
    ) + _worker_prompt_suffix(route, business_context)
    tools = []
    print(f"[PYTHON] Tools disabled for basic chat: {len(tools)} available")

    messages: list[dict] = []
    context_message = _build_chat_context_message(
        agent_name,
        setup_answers,
        memory_without_context,
        business_context,
        enriched_integrations,
        files or [],
    )
    if context_message:
        messages.append({"role": "user", "content": context_message})

    recent_history = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    messages.extend({"role": m.role, "content": m.content} for m in recent_history)
    messages.append({"role": "user", "content": message})
    print(f"[PYTHON] Prepared {len(messages)} messages for LLM")

    # Handle tool use loop (non-streaming) if tools are available
    final_content = None
    if tools:
        print(f"[PYTHON] Running tool use loop with {len(tools)} tools")
        try:
            messages, final_content = run_tool_use_loop(
                client,
                system_prompt,
                messages,
                tools,
                enriched_integrations,
                model=FAST_MODEL,
            )
            print(f"[PYTHON] Tool use loop returned final_content={final_content is not None}")
        except RuntimeError as e:
            error_msg = str(e)
            print(f"[PYTHON] Tool use loop error: {error_msg}")
            if "rate_limit" in error_msg or "429" in error_msg:
                    yield f"data: {json.dumps({'delta': '⚠️ API rate limit reached. The Groq service returned a rate limit or quota error. Please wait a few minutes and retry.'})}\n\n"
            else:
                    yield f"data: {json.dumps({'delta': f'⚠️ Error: {error_msg[:150]}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

    if final_content is not None:
        print(f"[PYTHON] Emitting tool use result")
        text_chunk = _extract_text(final_content)
        if text_chunk:
            print(f"[PYTHON] Yielding text: {len(text_chunk)} chars")
            yield f"data: {json.dumps({'delta': text_chunk})}\n\n"
            print(f"[PYTHON] Tool result complete, sending [DONE]")
            yield "data: [DONE]\n\n"
            return

    # Stream final response
    print(f"[PYTHON] Starting LLM stream with model={MODEL}")
    stream_started = False
    try:
        # Create stream with retry logic
        stream = None
        for attempt in range(2):  # Try once, then retry if rate limited
            try:
                stream = client.messages.stream(
                    model=FAST_MODEL,
                    max_tokens=2048,
                    system=system_prompt,
                    messages=messages,
                )
                break
            except RuntimeError as e:
                error_msg = str(e)
                if ("rate_limit" in error_msg or "429" in error_msg) and attempt == 0:
                    print(f"[PYTHON] Rate limit hit on stream init, retrying in 20s")
                    time.sleep(20)
                else:
                    raise
        
        with stream as s:
            for text in s.text_stream:
                if not stream_started:
                    print(f"[PYTHON] First token received")
                    stream_started = True
                print(f"[PYTHON] Yielding delta: {len(text)} chars")
                yield f"data: {json.dumps({'delta': text})}\n\n"
    except RuntimeError as e:
        error_msg = str(e)
        print(f"[PYTHON] LLM stream error: {error_msg}")
        if "rate_limit" in error_msg or "429" in error_msg:
                if not stream_started:
                    yield f"data: {json.dumps({'delta': 'Rate limit: Groq service rate limit encountered. Wait a few minutes and retry.'})}\n\n"
        else:
            if not stream_started:
                    yield f"data: {json.dumps({'delta': f'Error: {error_msg[:150]}'})}\n\n"
        yield "data: [DONE]\n\n"
        return
    print(f"[PYTHON] LLM stream ended, sending [DONE]")
    yield "data: [DONE]\n\n"


async def stream_group_chat(
    agent_name: str,
    setup_answers: dict[str, Any],
    memory: str,
    members: list[dict],
    sender_name: str,
    history: list[GroupHistoryMessage],
    message: str,
    integrations: dict[str, Any],
    chat_name: str = "Group Chat",
) -> AsyncIterator[str]:
    client = get_client()
    system_prompt = build_group_system_prompt(
        agent_name=agent_name,
        setup_answers=setup_answers,
        memory=memory,
        members=members,
        sender_name=sender_name,
        history=[m.model_dump() for m in history],
        chat_name=chat_name,
        integrations=integrations,
    )
    tools = []

    messages: list[dict] = []
    context_message = _build_group_context_message(
        agent_name,
        setup_answers,
        memory,
        members,
        sender_name,
        [m.model_dump() for m in history],
        chat_name,
        integrations,
    )
    if context_message:
        messages.append({"role": "user", "content": context_message})

    messages.append({"role": "user", "content": message})

    final_content = None
    if tools:
        try:
            messages, final_content = run_tool_use_loop(
                client,
                system_prompt,
                messages,
                tools,
                integrations,
                model=FAST_MODEL,
            )
        except RuntimeError as e:
            error_msg = str(e)
            if "rate_limit" in error_msg or "429" in error_msg:
                yield f"data: {json.dumps({'delta': 'Rate limit: Groq service rate limit encountered. Wait a few minutes and retry.'})}\n\n"
            else:
                yield f"data: {json.dumps({'delta': f'Error: {error_msg[:150]}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

    if final_content is not None:
        text_chunk = _extract_text(final_content)
        if text_chunk:
            yield f"data: {json.dumps({'delta': text_chunk})}\n\n"
            yield "data: [DONE]\n\n"
            return

    try:
        # Create stream with retry logic
        stream = None
        for attempt in range(2):  # Try once, then retry if rate limited
            try:
                stream = client.messages.stream(
                    model=FAST_MODEL,
                    max_tokens=1024,
                    system=system_prompt,
                    messages=messages,
                )
                break
            except RuntimeError as e:
                error_msg = str(e)
                if ("rate_limit" in error_msg or "429" in error_msg) and attempt == 0:
                    print(f"[PYTHON] Rate limit hit on group stream init, retrying in 20s")
                    time.sleep(20)
                else:
                    raise
        
        with stream as s:
            for text in s.text_stream:
                yield f"data: {json.dumps({'delta': text})}\n\n"
    except RuntimeError as e:
        error_msg = str(e)
        if "rate_limit" in error_msg or "429" in error_msg:
            yield f"data: {{\"delta\": \"Rate limit: Groq service rate limit encountered. Wait a few minutes and retry.\"}}\n\n"
        else:
            yield f"data: {{\"delta\": \"Error: {error_msg[:150]}\"}}\n\n"
        yield "data: [DONE]\n\n"
        return

    yield "data: [DONE]\n\n"


@app.post("/chat")
async def chat(req: ChatRequest):
    return StreamingResponse(
        stream_chat(
            req.agent_name,
            req.agent_id,
            req.setup_answers,
            req.memory,
            req.history,
            req.message,
            req.integrations,
            req.files,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/group-chat")
async def group_chat(req: GroupChatRequest):
    return StreamingResponse(
        stream_group_chat(
            req.agent_name,
            req.setup_answers,
            req.memory,
            req.members,
            req.sender_name,
            req.history,
            req.message,
            req.integrations,
            req.chat_name,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class AutomateRequest(BaseModel):
    agent_name: str
    agent_id: str = ""
    setup_answers: dict[str, Any] = {}
    memory: str = ""
    goal: str
    integrations: dict[str, Any] = {}


def _blocks_to_dict(content) -> list[dict]:
    """Convert SDK content blocks to plain dicts for re-use in messages."""
    result = []
    for block in content:
        if not hasattr(block, "type"):
            continue
        if block.type == "text":
            result.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            result.append({
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": dict(block.input),
            })
        else:
            # Handle native tool blocks (web_search_result, etc.) via Pydantic serialisation
            if hasattr(block, "model_dump"):
                result.append(block.model_dump())
            elif hasattr(block, "__dict__"):
                result.append({"type": block.type, **{k: v for k, v in block.__dict__.items() if not k.startswith("_")}})
    return result


@app.post("/preflight")
def preflight_check(req: PreflightRequest):
    """
    Analyse a goal and return a structured requirements report.
    Fast — one LLM call, no tools, no loop.
    """
    client = get_client()
    connected_str = ", ".join(req.connected_integrations) if req.connected_integrations else "none"

    prompt = f"""Analyse this automation goal and return a JSON requirements report. Be precise — only list what is genuinely needed.

Agent: {req.agent_name}
Goal: {req.goal}
Currently connected integrations: {connected_str}

Return ONLY a JSON object — no markdown fences, no explanation:
{{
  "requirements": [
    {{
      "type": "integration",
      "name": "google|slack|notion",
      "label": "Google (Gmail / Sheets / Calendar)",
      "required": true,
      "reason": "One sentence: why this specific integration is needed for this goal",
      "workaround": "What the agent will do without it, or null if it completely blocks the task"
    }}
  ],
  "web_access": true,
  "will_send_emails": false,
  "will_modify_data": false,
  "estimated_steps": 4,
  "notes": "One sentence: what this automation will actually do when it runs"
}}

Rules:"""

    try:
        response = client.messages.create(
            model=FAST_MODEL,
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except Exception as e:
        pass  # Fall through to safe default

    return {
        "requirements": [],
        "web_access": True,
        "will_send_emails": False,
        "will_modify_data": False,
        "estimated_steps": 5,
        "notes": "Could not analyse requirements — automation will attempt to run.",
    }


@app.post("/automate")
def run_automation(req: AutomateRequest):
    """
    Runs a full autonomous reasoning loop for an automation goal.
    Returns structured steps + final report (non-streaming JSON).
    """
    client = get_client()
    enriched = {**req.integrations, "agent_id": req.agent_id, "agent_name": req.agent_name}
    tools = get_available_tools(enriched)

    # Build base identity from agent context (includes integration awareness)
    base_prompt = build_system_prompt(
        agent_name=req.agent_name,
        setup_answers=req.setup_answers,
        memory=req.memory,
        integrations=enriched,
    )

    # Tight automation prompt — no padding, agent knows to be concise
    system_prompt = (
        base_prompt + "\n\n"
        "AUTOMATION MODE: use tools efficiently and return a short final report with Summary, Key Findings, Action Items, and Alerts."
    )

    MAX_STEPS = 8          # hard cap on tool calls
    MAX_TOKENS = 2000      # max tokens per step response
    CONTEXT_STEPS = 3      # only keep last N step exchanges in messages

    messages: list[dict] = [{"role": "user", "content": f"Goal: {req.goal}"}]
    steps: list[dict] = []
    # Track message pairs (assistant + tool_results) separately so we can trim context
    turn_pairs: list[list[dict]] = []

    for _ in range(MAX_STEPS):
        # Build trimmed context: initial user message + last CONTEXT_STEPS turn pairs
        trimmed_messages = messages[:1] + [m for pair in turn_pairs[-CONTEXT_STEPS:] for m in pair]

        response = client.messages.create(
            model=REASONING_MODEL,
            max_tokens=MAX_TOKENS,
            system=system_prompt,
            messages=trimmed_messages,
            tools=tools if tools else None,
        )

        if response.stop_reason != "tool_use":
            final_text = "".join(
                block.text for block in response.content if hasattr(block, "text")
            )
            return {"steps": steps, "final_result": final_text}

        # Execute client-side tool calls (skip native tools like web_search)
        assistant_content = _blocks_to_dict(response.content)
        tool_results = []
        for block in response.content:
            if block.type == "tool_use" and block.name != "web_search":
                try:
                    output = execute_tool(block.name, dict(block.input), enriched)
                except Exception as e:
                    output = f"Tool error: {e}"
                steps.append({
                    "tool": block.name,
                    "input": {k: str(v)[:200] for k, v in dict(block.input).items()},
                    "output": output[:400],
                    "status": "error" if output.startswith("Tool error") else "success",
                })
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output[:2000],
                })
            elif block.type == "tool_use" and block.name == "web_search":
                query = dict(block.input).get("query", "")
                steps.append({
                    "tool": "web_search",
                    "input": {"query": query[:200]},
                    "output": "Search handled by the search tool",
                    "status": "success",
                })

        turn_pairs.append([
            {"role": "assistant", "content": assistant_content},
            {"role": "user", "content": tool_results},
        ])

    # Force final answer after step limit
    trimmed_messages = messages[:1] + [m for pair in turn_pairs[-CONTEXT_STEPS:] for m in pair]
    final_response = client.messages.create(
        model=REASONING_MODEL,
        max_tokens=MAX_TOKENS,
        system=system_prompt,
        messages=trimmed_messages + [{"role": "user", "content": "Step limit reached. Write your final report now using only what you've gathered."}],
    )
    final_text = "".join(
        block.text for block in final_response.content if hasattr(block, "text")
    )
    return {"steps": steps, "final_result": final_text}


@app.post("/group-relevance")
async def group_relevance(req: GroupRelevanceRequest):
    client = get_client()

    # Build agent list with roles when available
    agents_lines = []
    for a in req.agents:
        role = a.get("role")
        agents_lines.append(f"- {a['name']}" + (f" ({role})" if role else ""))
    agents_list = "\n".join(agents_lines)

    # Optional context block when checking continuation after a prior agent responded
    context_block = ""
    if req.context:
        context_block = f"Prior response in this thread:\n\"\"\"\n{req.context[:600]}\n\"\"\"\n\n"

    prompt = GROUP_RELEVANCE_PROMPT.format(
        sender_name=req.sender_name,
        message=req.message,
        agents_list=agents_list,
        max_responders=req.max_responders,
        context_block=context_block,
    )

    response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=64,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        data = json.loads(raw)
        responders = data.get("responders", [])
        # Validate names against actual agents
        valid_names = {a["name"] for a in req.agents}
        responders = [r for r in responders if r in valid_names]
        if not responders and req.agents:
            responders = [req.agents[0]["name"]]
        return {"responders": responders}
    except Exception:
        return {"responders": [req.agents[0]["name"]] if req.agents else []}


@app.post("/generate-questions")
async def generate_questions(req: GenerateQuestionsRequest):
    client = get_client()
    prompt = QUESTION_GENERATION_PROMPT.format(agent_name=req.agent_name)

    response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    return json.loads(raw)


@app.post("/initialize-memory")
async def initialize_memory(req: InitializeMemoryRequest):
    client = get_client()
    answers_text = "\n".join(f"- {k}: {v}" for k, v in req.setup_answers.items() if v)
    prompt = INITIAL_MEMORY_PROMPT.format(
        agent_name=req.agent_name,
        setup_answers=answers_text,
    )

    response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    return {"memory": response.content[0].text.strip()}


@app.post("/update-memory")
async def update_memory(req: UpdateMemoryRequest):
    try:
        client = get_client()
        prompt = MEMORY_UPDATE_PROMPT.format(
            agent_name=req.agent_name,
            current_memory=req.current_memory or "(empty)",
            conversation=req.conversation,
        )

        response = await asyncio.to_thread(
            client.messages.create,
            model=FAST_MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )

        return {"memory": response.content[0].text.strip()}
    except Exception:
        # Memory refresh is best-effort only; never fail the chat flow.
        return {"memory": req.current_memory or ""}


async def stream_cluster_chat(
    message: str,
    history: list[HistoryMessage],
    workspace_context: str,
    integrations: dict[str, Any],
) -> AsyncIterator[str]:
    client = get_client()
    calendar_mode = workspace_context.strip().startswith("Calendar context:")

    if calendar_mode:
        system_prompt = build_calendar_ai_system_prompt(workspace_context)
        tools = get_calendar_ai_tools()
        calendar_executor = lambda name, inputs: execute_calendar_tool(name, inputs)
    else:
        system_prompt = build_cluster_system_prompt(workspace_context)
        tools = get_available_tools(integrations)
        calendar_executor = None

    recent = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    messages: list[dict] = []
    if not calendar_mode:
        context_message = _build_cluster_context_message(workspace_context, integrations, recent)
        if context_message:
            messages.append({"role": "user", "content": context_message})
    messages.extend({"role": m.role, "content": m.content} for m in recent)
    messages.append({"role": "user", "content": message})

    final_content = None
    if tools:
        try:
            messages, final_content = run_tool_use_loop(
                client,
                system_prompt,
                messages,
                tools,
                integrations,
                model=FAST_MODEL,
                tool_executor=calendar_executor,
            )
        except RuntimeError as e:
            error_msg = str(e)
            if "rate_limit" in error_msg or "429" in error_msg:
                yield f"data: {json.dumps({'delta': '⚠️ Rate limit reached. Please wait a moment and retry.'})}\n\n"
            else:
                yield f"data: {json.dumps({'delta': f'⚠️ Error: {error_msg[:150]}'})}\n\n"
            yield "data: [DONE]\n\n"
            return

    if final_content is not None:
        text_chunk = _extract_text(final_content)
        if text_chunk:
            yield f"data: {json.dumps({'delta': text_chunk})}\n\n"
            yield "data: [DONE]\n\n"
            return

    with client.messages.stream(
        model=FAST_MODEL,
        max_tokens=512 if calendar_mode else 1024,
        system=system_prompt,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {json.dumps({'delta': text})}\n\n"

    yield "data: [DONE]\n\n"


@app.post("/cluster-chat")
async def cluster_chat(req: ClusterChatRequest):
    return StreamingResponse(
        stream_cluster_chat(req.message, req.history, req.workspace_context, req.integrations),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class ExecuteBrowseRequest(BaseModel):
    url: str
    instructions: str


class SummariseRequest(BaseModel):
    format: str
    include: list[str] = []
    data: list[str] = []
    variables: dict[str, str] = {}
    agent_name: str = ""
    template_name: str = ""
    action: str = "summarise"


class BuildAutomationRequest(BaseModel):
    description: str


class RecoverStepRequest(BaseModel):
    step_type: str
    step_action: str
    error: str
    collected_data: list[str] = []
    agent_name: str = ""


@app.post("/execute-browse")
def execute_browse(req: ExecuteBrowseRequest):
    """Execute a single browse step using Playwright."""
    from tools import execute_tool
    try:
        result = execute_tool("browse_website", {"url": req.url, "instructions": req.instructions}, {})
        return {"result": result}
    except Exception as e:
        return {"result": f"Browse failed: {e}", "error": str(e)}


@app.post("/summarise")
def summarise(req: SummariseRequest):
    """Use AI to compile collected data into a formatted summary."""
    client = get_client()
    data_text = "\n\n---\n\n".join(req.data) if req.data else "(no data collected)"
    include_list = ", ".join(req.include) if req.include else "all relevant metrics"

    prompt = f"""You are {req.agent_name or 'an AI assistant'} completing an automation task: "{req.template_name}".

The automation has collected the following data:

{data_text}

Format: {req.format}
Include in your summary: {include_list}

Write a clean, well-formatted summary using markdown. Use headers, bullet points, and bold text for key metrics.
Be concise — this will be delivered directly to the user.
Do not include any preamble or explanation. Start directly with the content."""

    try:
        response = client.messages.create(
            model=FAST_MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        result = "".join(b.text for b in response.content if hasattr(b, "text"))
        return {"result": result}
    except Exception as e:
        return {"result": f"Summary generation failed: {e}", "error": str(e)}


@app.post("/build-automation")
def build_automation(req: BuildAutomationRequest):
    """Convert a plain English description into a structured automation step definition."""
    client = get_client()

    prompt = f"""Convert this automation description into a structured JSON step definition.

Description: {req.description}

Return ONLY a JSON object with this structure:
{{
  "name": "Short automation name",
  "description": "What this automation does",
  "steps": [
    {{
      "id": 1,
      "type": "browse|api|extract|report|send_email|write_sheet|post_slack|notify_chat|alert",
      "action": "navigate|login|extract|summarise|list_emails|read_sheet|etc",
      "url": "https://...",
      "instructions": "What to do or extract",
      "provider": "google|slack",
      "endpoint": "gmail.users.messages.list|sheets.spreadsheets.values.get|etc",
      "params": {{}}
    }}
  ],
  "variables": [
    {{
      "key": "variable_key",
      "label": "Human label",
      "type": "select|text|number",
      "options": [],
      "default": "",
      "required": false
    }}
  ],
  "requires": ["google_oauth"],
  "estimated_duration": "30-60 seconds",
  "ai_recovery": true
}}

Step types to use:

Keep it to 3-6 steps. Be practical and specific."""

    try:
        response = client.messages.create(
            model=REASONING_MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in response.content if hasattr(b, "text"))
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
        return {"error": "Could not parse step definition"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/recover-step")
def recover_step(req: RecoverStepRequest):
    """AI attempts to recover from a failed automation step."""
    client = get_client()
    data_context = "\n".join(req.collected_data) if req.collected_data else "(none)"

    prompt = f"""An automation step failed. Attempt to produce a useful result anyway.

Agent: {req.agent_name}
Failed step type: {req.step_type} / {req.step_action}
Error: {req.error}

Data collected before failure:
{data_context}

Your job: given what was collected before the failure, produce the best possible output for this step.
If you can infer or estimate the data, do so clearly labeled as estimated.
If recovery is impossible, return an empty string.

Return only the recovered result text, no explanation."""

    try:
        response = client.messages.create(
            model=REASONING_MODEL,
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        result = "".join(b.text for b in response.content if hasattr(b, "text"))
        return {"result": result}
    except Exception as e:
        return {"result": ""}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AGENT_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
