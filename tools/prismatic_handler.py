import os
import requests
from typing import Dict, Any, Tuple


def trigger_prismatic_flow(webhook_url: str, payload: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Trigger a Prismatic workflow via webhook.
    
    Args:
        webhook_url: The webhook URL for the Prismatic flow
        payload: The payload to send to the webhook
        
    Returns:
        Tuple of (success: bool, message: str)
    """
    api_key = os.getenv('PRISMATIC_API_KEY')
    
    if not api_key:
        return False, "Error: PRISMATIC_API_KEY environment variable not set"
    
    if not webhook_url:
        return False, "Error: webhook_url cannot be empty"
    
    try:
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
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
