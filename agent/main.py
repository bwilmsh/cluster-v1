import os
import json
from typing import Any, AsyncIterator

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from prompts import build_system_prompt, QUESTION_GENERATION_PROMPT

load_dotenv()

app = FastAPI(title="Cluster Agent Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = "claude-sonnet-4-20250514"


def get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    agent_name: str
    setup_answers: dict[str, Any] = {}
    memory: str = ""
    history: list[HistoryMessage] = []
    message: str


class GenerateQuestionsRequest(BaseModel):
    agent_name: str


@app.get("/health")
def health():
    return {"status": "ok"}


async def stream_chat(
    agent_name: str,
    setup_answers: dict[str, Any],
    memory: str,
    history: list[HistoryMessage],
    message: str,
) -> AsyncIterator[str]:
    client = get_client()
    system_prompt = build_system_prompt(agent_name, setup_answers, memory)

    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    with client.messages.stream(
        model=MODEL,
        max_tokens=2048,
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
            req.setup_answers,
            req.memory,
            req.history,
            req.message,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    return json.loads(raw)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AGENT_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
