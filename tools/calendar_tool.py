"""Cal.com booking utility used by the agent."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, Optional

import requests

CAL_API_BASE_URL = os.getenv("CAL_API_BASE_URL", "https://api.cal.com")
CAL_API_KEY_ENV = "CAL_API_KEY"
MIN_CAL_API_VERSION = "2026-02-25"
DEFAULT_TIMEOUT_SECONDS = 15


def _cal_api_version() -> str:
    configured = (os.getenv("CAL_API_VERSION") or "").strip()
    if not configured:
        return MIN_CAL_API_VERSION
    if len(configured) != 10 or configured[4] != "-" or configured[7] != "-":
        return MIN_CAL_API_VERSION
    if configured < MIN_CAL_API_VERSION:
        return MIN_CAL_API_VERSION
    return configured


def _booking_target() -> Dict[str, Any]:
    event_type_id = os.getenv("CAL_EVENT_TYPE_ID")
    event_type_slug = os.getenv("CAL_EVENT_TYPE_SLUG")
    username = os.getenv("CAL_USERNAME")
    team_slug = os.getenv("CAL_TEAM_SLUG")
    organization_slug = os.getenv("CAL_ORGANIZATION_SLUG")

    if event_type_id:
        return {"eventTypeId": int(event_type_id)}
    if event_type_slug and username:
        target: Dict[str, Any] = {"eventTypeSlug": event_type_slug, "username": username}
        if team_slug:
            target["teamSlug"] = team_slug
        if organization_slug:
            target["organizationSlug"] = organization_slug
        return target
    return {}


def _headers(api_key: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _slot_is_available(slot_payload: Dict[str, Any], desired_start: str, desired_end: str) -> bool:
    """Best-effort parser for Cal.com slot responses across API versions."""
    data = slot_payload.get("data", slot_payload)

    if isinstance(data, list):
        for slot in data:
            if isinstance(slot, dict):
                if slot.get("start") == desired_start and slot.get("end") == desired_end:
                    return True
                if slot.get("startTime") == desired_start and slot.get("endTime") == desired_end:
                    return True

    if isinstance(data, dict):
        slots = data.get("slots")
        if isinstance(slots, list):
            for slot in slots:
                if isinstance(slot, dict):
                    if slot.get("start") == desired_start and slot.get("end") == desired_end:
                        return True
                    if slot.get("startTime") == desired_start and slot.get("endTime") == desired_end:
                        return True

        if isinstance(slots, dict):
            for day_slots in slots.values():
                if isinstance(day_slots, list):
                    for slot in day_slots:
                        if isinstance(slot, dict):
                            if slot.get("start") == desired_start and slot.get("end") == desired_end:
                                return True
                            if slot.get("startTime") == desired_start and slot.get("endTime") == desired_end:
                                return True

    return False


def manage_booking(
    start_time: str,
    end_time: str,
    customer_name: str,
    customer_email: str,
    timezone: str = "UTC",
    notes: Optional[str] = None,
    event_type_id: Optional[int] = None,
) -> str:
    """Check availability for a slot and create a booking in Cal.com.

    Args:
        event_type_id: Cal.com event type ID.
        start_time: Desired slot start in ISO-8601 format.
        end_time: Desired slot end in ISO-8601 format.
        customer_name: Customer full name.
        customer_email: Customer email.
        timezone: IANA timezone (for example, "America/New_York").
        notes: Optional booking notes.

    Returns:
        A confirmation message if booked, otherwise an error message.
    """
    api_key = os.getenv(CAL_API_KEY_ENV)
    if not api_key:
        return "Error: missing CAL_API_KEY environment variable."
    if not api_key.startswith("cal_"):
        return "Error: CAL_API_KEY must start with 'cal_'."

    cal_api_version = _cal_api_version()
    booking_target = _booking_target()
    if not booking_target:
        return (
            "Error: missing Cal event type configuration. "
            "Set CAL_EVENT_TYPE_ID, or CAL_EVENT_TYPE_SLUG and CAL_USERNAME in .env."
        )

    try:
        datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        datetime.fromisoformat(end_time.replace("Z", "+00:00"))
    except ValueError:
        return "Error: start_time and end_time must be valid ISO-8601 datetime strings."

    booking_target = _booking_target()
    if event_type_id is not None:
        booking_target = {"eventTypeId": event_type_id}
    if not booking_target:
        return (
            "Error: missing Cal event type configuration. "
            "Set CAL_EVENT_TYPE_ID, or CAL_EVENT_TYPE_SLUG and CAL_USERNAME in .env."
        )

    slot_params = {
        "start": start_time,
        "end": end_time,
        "timeZone": timezone,
    }
    slot_params.update(booking_target)

    try:
        slot_resp = requests.get(
            f"{CAL_API_BASE_URL}/v2/slots",
            headers=_headers(api_key),
            params=slot_params,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        slot_resp.raise_for_status()
        slot_data = slot_resp.json()
    except requests.RequestException as exc:
        return f"Error checking availability: {exc}"

    if not _slot_is_available(slot_data, start_time, end_time):
        return "Error: selected timeslot is not available."

    booking_payload: Dict[str, Any] = {
        "start": start_time,
        "attendee": {
            "name": customer_name,
            "email": customer_email,
            "timeZone": timezone,
        },
    }
    booking_payload.update(booking_target)
    if notes:
        booking_payload["metadata"] = {"notes": notes}

    try:
        booking_resp = requests.post(
            f"{CAL_API_BASE_URL}/v2/bookings",
            headers={**_headers(api_key), "cal-api-version": cal_api_version},
            json=booking_payload,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        booking_resp.raise_for_status()
        booking_data = booking_resp.json().get("data", booking_resp.json())
    except requests.RequestException as exc:
        return f"Error creating booking: {exc}"

    booking_id = booking_data.get("id") or booking_data.get("uid") or "unknown"
    return (
        f"Booking confirmed for {customer_name} on {start_time} to {end_time}. "
        f"Booking reference: {booking_id}."
    )
