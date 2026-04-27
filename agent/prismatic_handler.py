import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Tuple

import jwt
import requests


DEFAULT_PRISMATIC_GRAPHQL_URL = "https://app.prismatic.io/api"


def _load_private_key() -> str:
    private_key = (os.environ.get("PRISMATIC_PRIVATE_SIGNING_KEY") or "").strip()
    if not private_key:
        raise ValueError("PRISMATIC_PRIVATE_SIGNING_KEY is not set")

    private_key = private_key.strip('"').strip("'")
    if "\\n" in private_key:
        private_key = private_key.replace("\\n", "\n")
    return private_key


def _build_prismatic_jwt(user_id: str, external_customer_id: str) -> str:
    org_id = (os.environ.get("PRISMATIC_ORG_ID") or "").strip()
    if not org_id:
        raise ValueError("PRISMATIC_ORG_ID is not set")

    private_key = _load_private_key()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "external_id": str(user_id),
        "customer": str(external_customer_id),
        "organization": org_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=10)).timestamp()),
    }
    return jwt.encode(payload, private_key, algorithm="RS256")


def trigger_prismatic_flow(webhook_url: str, payload: Dict[str, Any]) -> Tuple[bool, str]:
    """Trigger a Prismatic workflow via webhook."""
    api_key = os.getenv("PRISMATIC_API_KEY")

    if not api_key:
        return False, "Error: PRISMATIC_API_KEY environment variable not set"

    if not webhook_url:
        return False, "Error: webhook_url cannot be empty"

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        response = requests.post(webhook_url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()

        return True, f"Successfully triggered Prismatic flow (Status: {response.status_code})"

    except requests.exceptions.Timeout:
        return False, "Error: Request to Prismatic webhook timed out (30 seconds)"

    except requests.exceptions.ConnectionError:
        return False, "Error: Failed to connect to Prismatic webhook URL"

    except requests.exceptions.HTTPError as e:
        status_code = e.response.status_code if e.response else "Unknown"
        error_detail = e.response.text if e.response else str(e)
        return False, f"Error: Prismatic API returned status {status_code}: {error_detail}"

    except requests.exceptions.RequestException as e:
        return False, f"Error: Request failed: {str(e)}"

    except Exception as e:
        return False, f"Error: Unexpected error occurred: {str(e)}"


def get_user_integration_url(user_id: str, app_name: str) -> str:
    """Return the Prismatic webhook URL for a user's instance matching app_name."""
    clean_user_id = (user_id or "").strip()
    clean_app_name = (app_name or "").strip()
    if not clean_user_id:
        raise ValueError("user_id cannot be empty")
    if not clean_app_name:
        raise ValueError("app_name cannot be empty")

    external_customer_id = (
        os.environ.get("PRISMATIC_EXTERNAL_CUSTOMER_ID")
        or os.environ.get("PRISMATIC_CUSTOMER_ID")
        or clean_user_id
    ).strip()

    token = _build_prismatic_jwt(clean_user_id, external_customer_id)
    graphql_url = (os.environ.get("PRISMATIC_GRAPHQL_URL") or DEFAULT_PRISMATIC_GRAPHQL_URL).rstrip("/")
    query = """
      query UserIntegrationInstances {
        authenticatedUser {
          customer {
            instances {
              nodes {
                name
                webhookUrl
              }
            }
          }
        }
      }
    """

    try:
        response = requests.post(
            graphql_url,
            json={"query": query},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ValueError(f"Failed to query Prismatic GraphQL API: {exc}") from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise ValueError("Prismatic GraphQL API returned invalid JSON") from exc

    if data.get("errors"):
        first_error = data["errors"][0]
        message = first_error.get("message") if isinstance(first_error, dict) else str(first_error)
        raise ValueError(f"Prismatic GraphQL API error: {message}")

    instances = (
        data.get("data", {})
        .get("authenticatedUser", {})
        .get("customer", {})
        .get("instances", {})
        .get("nodes", [])
    )

    if not isinstance(instances, list):
        raise ValueError("Prismatic GraphQL API returned an unexpected instances payload")

    for instance in instances:
        if not isinstance(instance, dict):
            continue
        if str(instance.get("name", "")).strip().lower() == clean_app_name.lower():
            webhook_url = str(instance.get("webhookUrl") or "").strip()
            if webhook_url:
                return webhook_url
            raise ValueError(f"Prismatic instance '{clean_app_name}' does not have a webhookUrl")

    raise ValueError(f"No Prismatic instance named '{clean_app_name}' was found for this user")