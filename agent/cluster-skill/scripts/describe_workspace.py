from pathlib import Path
import json


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    payload = {
        "workspace": "cluster",
        "agent_dir": str(root / "agent"),
        "backend_dir": str(root / "backend"),
        "key_files": [
            "agent/main.py",
            "agent/prompts.py",
            "agent/tools.py",
            "backend/src/routes/agents.ts",
            "backend/src/routes/appointments.ts",
        ],
    }
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
