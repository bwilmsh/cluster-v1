from typing import Any


def build_system_prompt(agent_name: str, setup_answers: dict[str, Any], memory: str) -> str:
    """Construct a system prompt for an agent from its setup answers and memory."""

    answers_block = ""
    if setup_answers:
        answers_block = "\n\nYour configuration:\n" + "\n".join(
            f"- {k}: {v}" for k, v in setup_answers.items()
        )

    memory_block = ""
    if memory:
        memory_block = f"\n\nYour memory from previous conversations:\n{memory}"

    return (
        f"You are {agent_name}, an AI agent hired to assist a small business.\n"
        "You are smart, direct, and action-oriented. You give concrete answers and avoid filler.\n"
        "You remember context from the conversation and build on it.\n"
        f"{answers_block}"
        f"{memory_block}"
    )


QUESTION_GENERATION_PROMPT = """You are helping set up an AI agent named "{agent_name}".

Generate exactly 3 setup questions that will help configure this agent to be most useful.
Each question should have 4 preset answer options plus allow a custom answer.

Return a JSON object with this exact structure:
{{
  "questions": [
    {{
      "id": "q1",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"]
    }},
    {{
      "id": "q2",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"]
    }},
    {{
      "id": "q3",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"]
    }}
  ]
}}

Make the questions specific and practical for an agent named "{agent_name}".
Return only valid JSON, no markdown, no explanation."""
