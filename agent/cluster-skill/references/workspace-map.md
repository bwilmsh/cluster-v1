# Cluster Workspace Map

## Runtime Components
- agent/main.py: Python chat runtime, tool loop, routing
- agent/prompts.py: prompt assembly and behavior policy
- agent/tools.py: tool definitions + execution
- backend/src/routes/agents.ts: streams chat to Python service
- backend/src/routes/appointments.ts: calendar persistence and Google sync logic

## Calendar Path
1. User message enters backend /api/agents/:id/chat
2. Backend forwards to Python /chat
3. Python builds prompt + exposes tools
4. Model emits tool_use for calendar tool
5. Tool executor performs DB/API call and returns result
6. Assistant response must reflect actual tool result

## Calendar Semantics
- Events: start + optional end
- Tasks: start-focused; no customer identity required for plain task/event entries
