import asyncio
from enum import Enum
import httpx
import logging
from typing import Dict, Any

from developer_login import BASE_URL, _extract_response_data, load_session, logout

class GpuProviders(str, Enum):
    novita: str = "novita"
    nebius_ai: str = "nebius_ai"
    verda: str = "verda"
    runpod: str = "runpod"
    vastai: str = "vastai"
    vultr: str = "vultr"
    azure: str = "azure"
    e2e_networks: str = "e2e_networks"
    
async def get_instances():
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}
    url=f"{BASE_URL}developer/{developer_id}/get-instances"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params={"provider_name": "all"})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error getting instances: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting instances: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

async def get_instance(instance_id: str, provider_name: GpuProviders):
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}
    url=f"{BASE_URL}developer/{developer_id}/get-instances"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params={"provider_name": provider_name})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error getting instance: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting instance: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

print(asyncio.run(get_instances()))
# print(asyncio.run(get_instance(instance_id="a9c4e29625824cbab52451b413db9003", provider_name=GpuProviders.runpod)))