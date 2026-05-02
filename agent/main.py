import os
import json
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Literal

import anthropic
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from prompts import (
    build_system_prompt,
    build_cluster_system_prompt,
    build_group_system_prompt,
    QUESTION_GENERATION_PROMPT,
    GROUP_RELEVANCE_PROMPT,
    INITIAL_MEMORY_PROMPT,
    MEMORY_UPDATE_PROMPT,
)
from tools import get_available_tools, execute_tool

load_dotenv()

app = FastAPI(title="Cluster Agent Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = "claude-sonnet-4-20250514"
MAX_HISTORY = 10


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


def _manager_route(
    client: anthropic.Anthropic,
    business_context: str,
    message: str,
    history: list[Any],
) -> Literal["booking", "customer", "general"]:
    recent_history = history[-3:] if len(history) > 3 else history
    history_text = "\n".join(f"{m.role}: {m.content}" for m in recent_history)
    manager_input = (
        f"Business Context:\n{business_context or '(none)'}\n\n"
        f"Recent conversation:\n{history_text or '(none)'}\n\n"
        f"Latest user message:\n{message}"
    )

    try:
        response = client.messages.create(
            model=MODEL,
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
    common = (
        "\n\nManager routing active. You are a worker in a multi-agent setup.\n"
        "Always acknowledge the current time and schedule from Business Context in your reply before any other details.\n"
        "Do not claim you executed a tool unless the tool result is present in conversation context.\n"
    )
    context_block = f"\nBusiness Context:\n{business_context}\n" if business_context else ""

    if route == "booking":
        return (
            common
            + context_block
            + "Worker: Booking Specialist.\n"
            + "Use save_event tool (or manage_booking alias) to create appointments. REQUIRED DETAILS BEFORE CALLING THE TOOL:\n"
            + "  - customer_name: Full name of the customer\n"
            + "  - customer_email: Customer's email address\n"
            + "  - start_time: Specific time converted to strict ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ)\n"
            + "  - category: infer and pass one of business|chore|personal\n"
            + "If any required detail is missing, ask for it first before calling the tool.\n"
            + "Do not guess date math yourself. Pass the user's time phrase to the tool for normalization when needed.\n"
            + "Interpret words like 'today', 'tomorrow', and weekdays in the local timezone context; do not shift days using UTC assumptions.\n"
            + "If the user gives an ambiguous time like 'at 2', ask AM/PM before booking.\n"
            + "Category rules:\n"
            + "  - If user mentions a client name or a service (for example 'haircut'), set category='business'.\n"
            + "  - If user mentions tasks like 'walk the dog' or 'pick up milk', set category='chore'.\n"
            + "  - Otherwise set category='personal'.\n"
            + "If an eventTypeId is ever used in the booking flow, it must be a literal integer (for example, 123456), never a string.\n"
            + "Do NOT invent or assume parameters — always ask if needed.\n"
            + "After booking, explicitly confirm the event type shown in the tool result so the user knows the right Cal event type was used.\n"
        )
    if route == "customer":
        return (
            common
            + context_block
            + "Worker: Customer Memory Specialist.\n"
            + "If asked about a customer or preferences, use search_customer_memories tool first.\n"
            + "Summarize returned memory rows clearly and mention uncertainty when data is missing.\n"
        )
    return (
        common
        + context_block
        + "Worker: General Assistant.\n"
        + "Use tools when needed, but prioritize direct, concise help.\n"
    )


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


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


def run_tool_use_loop(
    client: anthropic.Anthropic,
    system_prompt: str,
    messages: list[dict],
    tools: list[dict],
    integrations: dict,
) -> tuple[list[dict], list[Any]]:
    """
    Run the tool use loop until Claude stops requesting tools.
    Returns the final messages list with tool results appended.
    """
    while True:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
            tools=tools if tools else anthropic.NOT_GIVEN,
        )

        if response.stop_reason != "tool_use":
            # No more tool calls — return the final Claude response content.
            return messages, list(response.content)

        # Execute client-side tool calls (skip native tools like web_search — Anthropic runs those)
        tool_results = []
        for block in response.content:
            if block.type == "tool_use" and block.name != "web_search":
                result = execute_tool(block.name, block.input, integrations)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result[:4000],
                })

        # If all tool calls were native (web_search), there's nothing for us to execute.
        # Return the current response content so the caller can surface Claude's final answer.
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
    system_prompt = build_system_prompt(
        agent_name,
        setup_answers,
        memory_without_context,
        files or [],
        enriched_integrations,
    ) + _worker_prompt_suffix(route, business_context)
    tools = get_available_tools(enriched_integrations)

    recent_history = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in recent_history]
    messages.append({"role": "user", "content": message})

    # Handle tool use loop (non-streaming) if tools are available
    final_content = None
    if tools:
        messages, final_content = run_tool_use_loop(client, system_prompt, messages, tools, enriched_integrations)

    if final_content is not None:
        emitted_text = False
        for block in final_content:
            if hasattr(block, "text"):
                emitted_text = True
                yield f"data: {json.dumps({'delta': block.text})}\n\n"
        if emitted_text:
            yield "data: [DONE]\n\n"
            return

    # Stream final response
    with client.messages.stream(
        model=MODEL,
        max_tokens=2048,
        system=system_prompt,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {json.dumps({'delta': text})}\n\n"

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
    tools = get_available_tools(integrations)

    messages: list[dict] = [{"role": "user", "content": message}]

    final_content = None
    if tools:
        messages, final_content = run_tool_use_loop(client, system_prompt, messages, tools, integrations)

    if final_content is not None:
        emitted_text = False
        for block in final_content:
            if hasattr(block, "text"):
                emitted_text = True
                yield f"data: {json.dumps({'delta': block.text})}\n\n"
        if emitted_text:
            yield "data: [DONE]\n\n"
            return

    with client.messages.stream(
        model=MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {json.dumps({'delta': text})}\n\n"

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
    """Convert Anthropic SDK content blocks to plain dicts for re-use in messages."""
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

Rules:
- Only include integrations genuinely required for THIS specific goal
- required=true means the task is completely blocked without it
- required=false means the agent can work around the missing item
- estimated_steps: 2-8 (the hard cap is 8)
- web_access: true whenever the goal needs current or live information
- will_send_emails: true only if the goal explicitly requires sending emails
- will_modify_data: true if the agent will write, update, or delete anything
- If the goal only needs web research, return an empty requirements array"""

    try:
        response = client.messages.create(
            model=MODEL,
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
        "AUTOMATION MODE — execute the goal autonomously using tools. No questions.\n"
        "Be efficient: search once, read the most relevant result, write a concise report.\n"
        "Final report must use bullet points, not paragraphs. Keep each section to 3-5 bullets max.\n\n"
        "Final report format (required):\n"
        "## Summary\n## Key Findings\n## Action Items\n## Alerts"
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
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system_prompt,
            messages=trimmed_messages,
            tools=tools if tools else anthropic.NOT_GIVEN,
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
                    "output": "Search handled by Anthropic",
                    "status": "success",
                })

        turn_pairs.append([
            {"role": "assistant", "content": assistant_content},
            {"role": "user", "content": tool_results},
        ])

    # Force final answer after step limit
    trimmed_messages = messages[:1] + [m for pair in turn_pairs[-CONTEXT_STEPS:] for m in pair]
    final_response = client.messages.create(
        model=MODEL,
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
        model=MODEL,
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
        model=MODEL,
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
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    return {"memory": response.content[0].text.strip()}


@app.post("/update-memory")
async def update_memory(req: UpdateMemoryRequest):
    client = get_client()
    prompt = MEMORY_UPDATE_PROMPT.format(
        agent_name=req.agent_name,
        current_memory=req.current_memory or "(empty)",
        conversation=req.conversation,
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    return {"memory": response.content[0].text.strip()}


async def stream_cluster_chat(
    message: str,
    history: list[HistoryMessage],
    workspace_context: str,
    integrations: dict[str, Any],
) -> AsyncIterator[str]:
    client = get_client()
    system_prompt = build_cluster_system_prompt(workspace_context)
    tools = get_available_tools(integrations)

    recent = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in recent]
    messages.append({"role": "user", "content": message})

    final_content = None
    if tools:
        messages, final_content = run_tool_use_loop(client, system_prompt, messages, tools, integrations)

    if final_content is not None:
        emitted_text = False
        for block in final_content:
            if hasattr(block, "text"):
                emitted_text = True
                yield f"data: {json.dumps({'delta': block.text})}\n\n"
        if emitted_text:
            yield "data: [DONE]\n\n"
            return

    with client.messages.stream(
        model=MODEL,
        max_tokens=1024,
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
            model=MODEL,
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
- browse: visit a website, log in, extract data
- api: call Google/Slack APIs using OAuth
- extract: process previous step's data
- report: generate a formatted summary (always last before delivery)
- send_email: send an email via Gmail
- notify_chat: deliver result to agent chat (default delivery)

Keep it to 3-6 steps. Be practical and specific."""

    try:
        response = client.messages.create(
            model=MODEL,
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
            model=MODEL,
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
