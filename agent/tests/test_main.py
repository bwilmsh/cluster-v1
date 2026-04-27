import pytest
from httpx import AsyncClient, ASGITransport
import sys
import os
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set dummy API key before importing main
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test-key"
os.environ["PRISMATIC_ORG_ID"] = "org_123"
os.environ["PRISMATIC_USER_ID"] = "user_1"
os.environ["PRISMATIC_EXTERNAL_CUSTOMER_ID"] = "company_9"
os.environ["PRISMATIC_PRIVATE_SIGNING_KEY"] = (
    "-----BEGIN RSA PRIVATE KEY-----\n"
    "MIIEpAIBAAKCAQEAq6mFfF7h9Qy2H5tQ6f8l2nQYbHfXoY2XgQ7w3g8zvJk8rX1x\n"
    "-----END RSA PRIVATE KEY-----"
)

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


def test_get_prismatic_jwt_sets_expected_claims(monkeypatch):
    from main import get_prismatic_jwt

    captured = {}

    def fake_encode(payload, key, algorithm):
        captured["payload"] = payload
        captured["key"] = key
        captured["algorithm"] = algorithm
        return "signed.jwt.token"

    monkeypatch.setattr("main.jwt.encode", fake_encode)

    token = get_prismatic_jwt("user_1", "company_9")

    assert token == "signed.jwt.token"
    assert captured["algorithm"] == "RS256"
    assert captured["payload"]["sub"] == "user_1"
    assert captured["payload"]["external_id"] == "user_1"
    assert captured["payload"]["customer"] == "company_9"
    assert captured["payload"]["organization"] == os.environ["PRISMATIC_ORG_ID"]
    assert captured["payload"]["iat"] < captured["payload"]["exp"]
    assert captured["payload"]["exp"] - captured["payload"]["iat"] == 600


def test_get_user_integration_url_selects_matching_instance(monkeypatch):
    import prismatic_handler

    monkeypatch.setattr(prismatic_handler, "_build_prismatic_jwt", lambda user_id, customer_id: "signed.jwt.token")

    def fake_post(url, json=None, headers=None, timeout=None):
        assert url == "https://app.prismatic.io/api"
        assert headers["Authorization"] == "Bearer signed.jwt.token"
        assert timeout == 30
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {
                "data": {
                    "authenticatedUser": {
                        "customer": {
                            "instances": {
                                "nodes": [
                                    {"name": "Slack", "webhookUrl": "https://example.invalid/slack"},
                                    {"name": "Teams", "webhookUrl": "https://example.invalid/teams"},
                                ]
                            }
                        }
                    }
                }
            },
        )

    monkeypatch.setattr(prismatic_handler.requests, "post", fake_post)

    url = prismatic_handler.get_user_integration_url("user_1", "Teams")

    assert url == "https://example.invalid/teams"


@pytest.mark.asyncio
async def test_prismatic_auth_endpoint_returns_token(monkeypatch):
    def fake_encode(payload, key, algorithm):
        assert algorithm == "RS256"
        assert payload["sub"] == os.environ["PRISMATIC_USER_ID"]
        assert payload["external_id"] == os.environ["PRISMATIC_USER_ID"]
        assert payload["customer"] == os.environ["PRISMATIC_EXTERNAL_CUSTOMER_ID"]
        assert payload["organization"] == os.environ["PRISMATIC_ORG_ID"]
        return "signed.jwt.token"

    monkeypatch.setattr("main.jwt.encode", fake_encode)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/auth/prismatic",
            json={},
        )

    assert response.status_code == 200
    assert response.json() == {"token": "signed.jwt.token"}


def test_build_system_prompt():
    from prompts import build_system_prompt
    prompt = build_system_prompt("Alice", {"role": "Sales"}, "")
    assert "Alice" in prompt
    assert "Sales" in prompt


def test_build_system_prompt_with_memory():
    from prompts import build_system_prompt
    prompt = build_system_prompt("Bob", {}, "Remember: prefers email")
    assert "Remember: prefers email" in prompt


def test_build_cluster_system_prompt_includes_workspace_context_and_rules():
    from prompts import build_cluster_system_prompt

    prompt = build_cluster_system_prompt("Current memory: gym mornings this week")

    assert "Current memory: gym mornings this week" in prompt
    assert "Do you want me to add this to your calendar?" in prompt
    assert "build me a day for productivity" in prompt
    assert "stale, undated, or clearly old" in prompt
    assert "quick-win line" in prompt
