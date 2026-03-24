import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set dummy API key before importing main
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key"

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


def test_build_system_prompt_with_memory():
    from prompts import build_system_prompt
    prompt = build_system_prompt("Bob", {}, "Remember: prefers email")
    assert "Remember: prefers email" in prompt
