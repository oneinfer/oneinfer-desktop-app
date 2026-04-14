import asyncio
import json
import httpx
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional
from pydantic import EmailStr

DEFAULT_BASE_URL = "https://api.oneinfer.ai/v1/"

def normalize_api_base_url(value: str) -> str:
    trimmed_value = value.rstrip("/")
    if not trimmed_value:
        return ""

    if trimmed_value.startswith("https://oneinfer.ai"):
        trimmed_value = trimmed_value.replace("https://oneinfer.ai", "https://api.oneinfer.ai", 1)
    elif trimmed_value.startswith("https://www.oneinfer.ai"):
        trimmed_value = trimmed_value.replace("https://www.oneinfer.ai", "https://api.oneinfer.ai", 1)

    if trimmed_value == "https://api.oneinfer.ai":
        trimmed_value = f"{trimmed_value}/v1"

    return f"{trimmed_value.rstrip('/')}/"

BASE_URL = normalize_api_base_url(os.getenv("ONEINFER_API_BASE_URL", DEFAULT_BASE_URL))
SESSION_DIR = Path.home() / ".oneinfer"
SESSION_FILE = SESSION_DIR / "developer_session.json"

print(f"Session file path: {SESSION_FILE}")
def _extract_response_data(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    if isinstance(payload.get("dataResponse"), dict):
        return payload["dataResponse"]

    if isinstance(payload.get("data"), dict):
        return payload["data"]

    return payload


def save_session(access_token: str, developer_id: str, email: Optional[str] = None) -> None:
    session_data = {
        "access_token": access_token,
        "developer_id": developer_id,
        "email": email,
    }
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    SESSION_FILE.write_text(json.dumps(session_data, indent=2), encoding="utf-8")


def load_session() -> Optional[Dict[str, Any]]:
    if not SESSION_FILE.exists():
        return None

    try:
        return json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        logging.error("Failed to read saved developer session")
        return None


def logout() -> None:
    if SESSION_FILE.exists():
        SESSION_FILE.unlink()


def get_saved_access_token() -> Optional[str]:
    session = load_session()
    return session.get("access_token") if session else None

async def generate_and_send_otp(email: EmailStr) -> Dict[str, Any]:
    """
    Generate a one-time password (OTP) and send it to the user's email.
    """
    url=f"{BASE_URL}developer/generate-and-send-otp-to-email"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, params={"email": email})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error generating OTP: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error generating OTP: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}
    
async def verify_otp_and_login(email: EmailStr, otp: str) -> Dict[str, Any]:
    """
    Verify the OTP, log in the user, and persist the session locally.
    """
    url=f"{BASE_URL}developer/login"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json={"email": email, "otp": otp})
            response.raise_for_status()
            payload = response.json()
            response_data = _extract_response_data(payload)

            access_token = response_data.get("access_token")
            developer_id = response_data.get("developer_id")
            if access_token and developer_id:
                save_session(access_token=access_token, developer_id=developer_id, email=response_data.get("email"))

            return payload
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error verifying OTP: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error verifying OTP: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

async def get_developer_info(developer_id: str, token: Optional[str] = None) -> Dict[str, Any]:
    """
    Get developer information using the provided token or the saved session token.
    """
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = developer_id or session_developer_id
    token = token or session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    url=f"{BASE_URL}developer/{developer_id}/get-details"
    headers = {"Authorization": f"Bearer {token}"} if token else None
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        if e.response.status_code == 401:
            logout()
            return {"error": "Session expired or unauthorized. Saved token cleared. Please log in again."}
        logging.error(f"HTTP error getting developer info: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting developer info: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}


async def get_saved_developer_info() -> Dict[str, Any]:
    """
    Get developer info for the currently saved session.
    """
    session = load_session()
    if not session:
        return {"error": "No saved session found. Please log in first."}

    return await get_developer_info(
        developer_id=session.get("developer_id"),
        token=session.get("access_token")
    )

# print(generate_and_send_otp(email="vishwak2013@gmail.com"))
# print(asyncio.run(verify_otp_and_login(email="vishwak2013@gmail.com", otp="717654")))

# print(asyncio.run(get_developer_info(developer_id="a2a7cdff2e1445d6bc29da27f6871696", token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZlbG9wZXJfaWQiOiJhMmE3Y2RmZjJlMTQ0NWQ2YmMyOWRhMjdmNjg3MTY5NiIsImNsaWVudF90eXBlIjoiZGV2ZWxvcGVyIiwiaXNfdWxhIjpmYWxzZSwiZXhwIjoxNzc0MjA2MDg3fQ.bhmKgulXpr-gVIyKsMHw-tMKgv62uqP3G1jf50F_91w")))
# print(asyncio.run(get_developer_info(developer_id="a2a7cdff2e1445d6bc29da27f6871696")))