"""Tool registry for Cluster.

This module centralizes tool definitions and execution routing so tools can be
organized by category (Calendar, Memory, Expenses, etc.) and extended with a
single registration call.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Iterable

ToolInputs = dict[str, Any]
ToolEnvironment = dict[str, Any]
ToolHandler = Callable[[ToolInputs, ToolEnvironment], str]
AvailabilityPredicate = Callable[[ToolEnvironment], bool]


@dataclass(frozen=True)
class ToolEntry:
    category: str
    definition: dict[str, Any]
    handler: ToolHandler | None = None
    available_if: AvailabilityPredicate | None = None


class ToolRegistry:
    """Store tool definitions and their execution handlers by category."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolEntry] = {}
        self._category_order: list[str] = []

    def register_tool(
        self,
        category: str,
        definition: dict[str, Any],
        handler: ToolHandler | None = None,
        available_if: AvailabilityPredicate | None = None,
    ) -> None:
        """Register one tool definition and optional execution handler."""

        name = str(definition.get("name", "")).strip()
        if not name:
            raise ValueError("Tool definition must include a non-empty name")
        if name in self._tools:
            raise ValueError(f"Tool '{name}' is already registered")

        normalized_category = category.strip() or "General"
        if normalized_category not in self._category_order:
            self._category_order.append(normalized_category)

        self._tools[name] = ToolEntry(
            category=normalized_category,
            definition=definition,
            handler=handler,
            available_if=available_if,
        )

    def register_category(
        self,
        category: str,
        tools: Iterable[tuple[dict[str, Any], ToolHandler | None, AvailabilityPredicate | None]],
    ) -> None:
        """Register a batch of tools under one category."""

        for definition, handler, available_if in tools:
            self.register_tool(
                category=category,
                definition=definition,
                handler=handler,
                available_if=available_if,
            )

    def get_tool_definitions(self, environment: ToolEnvironment | None = None) -> list[dict[str, Any]]:
        """Return Claude tool definitions, filtered by environment availability."""

        environment = environment or {}
        definitions: list[dict[str, Any]] = []
        for category in self._category_order:
            for entry in self._tools.values():
                if entry.category != category:
                    continue
                if entry.available_if and not entry.available_if(environment):
                    continue
                definitions.append(entry.definition)
        return definitions

    def execute(self, name: str, inputs: ToolInputs, environment: ToolEnvironment) -> str:
        """Execute a registered tool and return its string response."""

        entry = self._tools.get(name)
        if entry is None or entry.handler is None:
            return f"Unknown tool: {name}"

        try:
            return entry.handler(inputs, environment)
        except Exception as exc:
            return f"Tool error ({name}): {str(exc)[:300]}"

    def categories(self) -> list[str]:
        """Return the registered category names in registration order."""

        return list(self._category_order)

    def tool_names(self) -> list[str]:
        """Return the registered tool names in registration order."""

        return list(self._tools.keys())
