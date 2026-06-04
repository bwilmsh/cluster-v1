import pytest
from httpx import AsyncClient, ASGITransport
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set dummy Groq API key before importing main
os.environ["GROQ_API_KEY"] = "test-groq-key"

from main import app


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_generate_questions_missing_body():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/generate-questions", json={})
    assert response.status_code == 422  # FastAPI validation error


@pytest.mark.asyncio
async def test_chat_missing_message():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"agent_name": "Test"})
    assert response.status_code == 422  # message is required


def test_build_system_prompt():
    from prompts import build_system_prompt
    prompt = build_system_prompt("Alice", {"role": "Sales"}, "")
    assert "Alice" in prompt
    assert "Sales" in prompt
    assert "do not guess from memory" in prompt


def test_build_system_prompt_with_memory():
    from prompts import build_system_prompt
    prompt = build_system_prompt("Bob", {}, "Remember: prefers email")
    assert "Remember: prefers email" in prompt


def test_build_system_prompt_includes_personality_mode():
    from prompts import build_system_prompt

    prompt = build_system_prompt("Casey", {"Personality selection": "Analyst (Data-driven)"}, "")

    assert "Analyst mode" in prompt
    assert "evidence-first" in prompt
    assert "Groq-powered assistant" in prompt


def test_build_cluster_system_prompt_includes_workspace_context_and_rules():
    from prompts import build_cluster_system_prompt

    prompt = build_cluster_system_prompt("Current memory: gym mornings this week")

    assert "Current memory: gym mornings this week" in prompt
    assert "Do you want me to add this to your calendar?" in prompt
    assert "build me a day for productivity" in prompt
    assert "stale, undated, or clearly old" in prompt
    assert "quick-win line" in prompt
