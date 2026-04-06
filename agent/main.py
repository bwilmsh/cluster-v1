import os
import json
from typing import Any, AsyncIterator

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from prompts import (
    build_system_prompt,
    build_group_system_prompt,
    QUESTION_GENERATION_PROMPT,
    GROUP_RELEVANCE_PROMPT,
    INITIAL_MEMORY_PROMPT,
    MEMORY_UPDATE_PROMPT,
    CLUSTER_SYSTEM_PROMPT,
    CLUSTER_WORKSPACE_TEMPLATE,
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
    max_responders: int = 2


class GenerateQuestionsRequest(BaseModel):
    agent_name: str


class InitializeMemoryRequest(BaseModel):
    agent_name: str
    setup_answers: dict[str, Any]


class UpdateMemoryRequest(BaseModel):
    agent_name: str
    current_memory: str
    conversation: str


class ClusterChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []
    workspace_context: str = ""


@app.get("/health")
def health():
    return {"status": "ok"}


def run_tool_use_loop(
    client: anthropic.Anthropic,
    system_prompt: str,
    messages: list[dict],
    tools: list[dict],
    integrations: dict,
) -> list[dict]:
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
            # No more tool calls — done
            return messages

        # Execute client-side tool calls (skip native tools like web_search — Anthropic runs those)
        tool_results = []
        for block in response.content:
            if block.type == "tool_use" and block.name != "web_search":
                result = execute_tool(block.name, block.input, integrations)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result[:2000],
                })

        # Append assistant response + tool results to messages
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
    enriched_integrations = {**integrations, "agent_id": agent_id, "agent_name": agent_name}
    system_prompt = build_system_prompt(agent_name, setup_answers, memory, files or [], enriched_integrations)
    tools = get_available_tools(enriched_integrations)

    recent_history = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in recent_history]
    messages.append({"role": "user", "content": message})

    # Handle tool use loop (non-streaming) if tools are available
    if tools:
        messages = run_tool_use_loop(client, system_prompt, messages, tools, enriched_integrations)

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

    if tools:
        messages = run_tool_use_loop(client, system_prompt, messages, tools, integrations)

    with client.messages.stream(
        model=MODEL,
        max_tokens=512,
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
    agents_list = "\n".join(f"- {a['name']}" for a in req.agents)
    prompt = GROUP_RELEVANCE_PROMPT.format(
        sender_name=req.sender_name,
        message=req.message,
        agents_list=agents_list,
        max_responders=req.max_responders,
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=128,
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
) -> AsyncIterator[str]:
    client = get_client()
    system_prompt = CLUSTER_SYSTEM_PROMPT + CLUSTER_WORKSPACE_TEMPLATE.format(
        workspace_context=workspace_context
    )

    recent = history[-MAX_HISTORY:] if len(history) > MAX_HISTORY else history
    messages: list[dict] = [{"role": m.role, "content": m.content} for m in recent]
    messages.append({"role": "user", "content": message})

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
        stream_cluster_chat(req.message, req.history, req.workspace_context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AGENT_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
