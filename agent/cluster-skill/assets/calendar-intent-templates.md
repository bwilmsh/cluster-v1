# Calendar Intent Templates

Use these templates when normalizing user intent before a tool call.

- "add that to calendar" -> create calendar item from last referenced action
- "remind me to <task> at <time>" -> category chore unless clearly business
- "schedule <thing> tomorrow at 3" -> normalize start_time and create item

Fallback title rules:
- Prefer explicit subject from user text
- Otherwise use "Task" for chore-like intents
- Otherwise use "Calendar item"
