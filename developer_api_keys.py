import asyncio
import httpx
import logging
from typing import Dict, Any

from developer_login import BASE_URL, _extract_response_data, load_session, logout

async def create_api_key(api_key_name:str, environment:str) -> Dict[str, Any]:
    """
    Create a new API key for the developer.
    """
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/create-api-key"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=headers,
                params={"api_key_name": api_key_name, "environment": environment}
            )
            response.raise_for_status()
            return _extract_response_data(response.json())
    except httpx.HTTPStatusError as e:
        response_json: Dict[str, Any] = {}
        try:
            response_json = e.response.json()
        except ValueError:
            response_json = {}

        response_data = _extract_response_data(response_json)
        error_message = (
            response_data.get("message")
            or response_json.get("detail")
            or e.response.text
        )

        if e.response.status_code == 401:
            logout()
            return {"error": f"Unauthorized: {error_message}. Saved session cleared. Please log in again."}

        logging.error(f"HTTP error creating API key: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error creating API key: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}
    

async def list_api_keys() -> Dict[str, Any]:
    """
    List API keys for the developer.
    """
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/get-api-keys"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            return _extract_response_data(response.json())
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error listing API keys: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error listing API keys: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

async def delete_api_key(api_key_name: str) -> Dict[str, Any]:
    """
    Delete an API key for the developer.
    """
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/delete-api-key"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(url, headers=headers, params={"api_key_name": api_key_name})
            response.raise_for_status()
            return _extract_response_data(response.json())
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error deleting API key: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error deleting API key: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

# print(asyncio.run(create_api_key(api_key_name="Test API Key", environment="production")))
# print(asyncio.run(list_api_keys()))
print(asyncio.run(delete_api_key(api_key_name="Test API Key")))