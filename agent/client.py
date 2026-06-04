import json
import os
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any, Iterator

import requests


GROQ_BASE_URL = os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
DEFAULT_MODEL = os.environ.get("GROQ_DEFAULT_MODEL", "llama-3.1-8b-instant")


def _get_attr(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _as_text(block: Any) -> str:
    text = _get_attr(block, "text", "")
    return text if isinstance(text, str) else str(text or "")


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return dict(value.model_dump())
    if hasattr(value, "__dict__"):
        return {k: v for k, v in value.__dict__.items() if not k.startswith("_")}
    return {}


def _convert_messages(messages: list[dict[str, Any]], system: str | None = None) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []

    if system:
        converted.append({"role": "system", "content": system})

    for message in messages:
        role = message.get("role", "user")
        content = message.get("content")

        if isinstance(content, str):
            converted.append({"role": role, "content": content})
            continue

        if not isinstance(content, list):
            converted.append({"role": role, "content": str(content or "")})
            continue

        blocks = [_as_dict(block) for block in content]
        text_parts: list[str] = []
        tool_calls: list[dict[str, Any]] = []

        for block in blocks:
            block_type = block.get("type")
            if block_type == "text":
                text_parts.append(_as_text(block))
            elif block_type == "tool_result":
                converted.append(
                    {
                        "role": "tool",
                        "tool_call_id": str(block.get("tool_use_id", "")),
                        "content": str(block.get("content", "")),
                    }
                )
            elif block_type == "tool_use" and role == "assistant":
                arguments = block.get("input") or {}
                if not isinstance(arguments, str):
                    arguments = json.dumps(arguments)
                tool_calls.append(
                    {
                        "id": str(block.get("id", "")),
                        "type": "function",
                        "function": {
                            "name": str(block.get("name", "")),
                            "arguments": arguments,
                        },
                    }
                )

        if tool_calls:
            converted.append(
                {
                    "role": "assistant",
                    "content": "\n".join(part for part in text_parts if part) or None,
                    "tool_calls": tool_calls,
                }
            )
        elif text_parts:
            converted.append({"role": role, "content": "\n".join(part for part in text_parts if part)})

    return converted


def _blocks_from_message(message: Any) -> list[Any]:
    blocks: list[Any] = []
    content = _get_attr(message, "content", "")

    if isinstance(content, str):
        blocks.append(SimpleNamespace(type="text", text=content))
    elif isinstance(content, list):
        for block in content:
            block_dict = _as_dict(block)
            if block_dict.get("type") == "text":
                blocks.append(SimpleNamespace(type="text", text=str(block_dict.get("text", ""))))

    tool_calls = _get_attr(message, "tool_calls", None) or []
    for call in tool_calls:
        call_dict = _as_dict(call)
        function = _as_dict(call_dict.get("function", {}))
        arguments = function.get("arguments") or "{}"
        if not isinstance(arguments, dict):
            try:
                arguments = json.loads(arguments)
            except Exception:
                arguments = {}
        blocks.append(
            SimpleNamespace(
                type="tool_use",
                id=str(call_dict.get("id", "")),
                name=str(function.get("name", "")),
                input=arguments,
            )
        )

    if not blocks:
        blocks.append(SimpleNamespace(type="text", text=""))

    return blocks


def _convert_tools(tools: Any) -> list[dict[str, Any]] | None:
    if not tools:
        return None

    converted: list[dict[str, Any]] = []
    for tool in tools:
        tool_dict = _as_dict(tool)
        name = str(tool_dict.get("name", "")).strip()
        if not name:
            continue

        parameters = tool_dict.get("input_schema") or tool_dict.get("parameters") or {"type": "object", "properties": {}}
        converted.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": str(tool_dict.get("description", "")),
                    "parameters": parameters,
                },
            }
        )

    return converted or None


class GroqMessages:
    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        self.base_url = (base_url or GROQ_BASE_URL).rstrip("/")
        self.api_key = (api_key or GROQ_API_KEY).strip()

    def _request(self, url: str, payload: dict[str, Any], stream: bool = False):
        if not self.api_key:
            raise RuntimeError("GROQ_API_KEY is not set")

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        return requests.post(url, json=payload, headers=headers, timeout=300, stream=stream)

    def create(
        self,
        model: str,
        max_tokens: int,
        messages: list[dict[str, Any]],
        system: str | None = None,
        tools: Any = None,
    ):
        if not model:
            model = DEFAULT_MODEL

        payload: dict[str, Any] = {
            "model": model,
            "messages": _convert_messages(messages, system=system),
            "max_tokens": max_tokens,
        }

        converted_tools = _convert_tools(tools)
        if converted_tools:
            payload["tools"] = converted_tools
            payload["tool_choice"] = "auto"

        response = self._request(f"{self.base_url}/chat/completions", payload)
        if response.status_code != 200:
            raise RuntimeError(f"Groq API error {response.status_code}: {response.text[:500]}")

        data = response.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        stop_reason = "tool_use" if message.get("tool_calls") else str(choice.get("finish_reason") or "stop")
        return SimpleNamespace(content=_blocks_from_message(message), stop_reason=stop_reason)

    @contextmanager
    def stream(
        self,
        model: str,
        max_tokens: int,
        messages: list[dict[str, Any]],
        system: str | None = None,
        tools: Any = None,
    ):
        if not model:
            model = DEFAULT_MODEL

        payload: dict[str, Any] = {
            "model": model,
            "messages": _convert_messages(messages, system=system),
            "max_tokens": max_tokens,
            "stream": True,
        }

        converted_tools = _convert_tools(tools)
        if converted_tools:
            payload["tools"] = converted_tools
            payload["tool_choice"] = "auto"

        response = self._request(f"{self.base_url}/chat/completions", payload, stream=True)
        if response.status_code != 200:
            raise RuntimeError(f"Groq API error {response.status_code}: {response.text[:500]}")

        def text_stream() -> Iterator[str]:
            for line in response.iter_lines(decode_unicode=True):
                if not line:
                    continue

                payload_line = line.strip()
                if payload_line.startswith("data: "):
                    payload_line = payload_line[6:].strip()
                if payload_line == "[DONE]":
                    break

                try:
                    chunk = json.loads(payload_line)
                    choice = (chunk.get("choices") or [{}])[0]
                    delta = choice.get("delta") or {}
                    text = delta.get("content") or ""
                except Exception:
                    text = ""

                if text:
                    yield text

        try:
            yield SimpleNamespace(text_stream=text_stream())
        finally:
            response.close()


class GroqClient:
    NOT_GIVEN = None

    def __init__(self, base_url: str | None = None, api_key: str | None = None):
        self.messages = GroqMessages(base_url=base_url, api_key=api_key)


def get_client():
    return GroqClient()