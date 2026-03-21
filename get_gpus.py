import asyncio
import httpx
import logging
from typing import Dict, Any


from developer_login import BASE_URL, _extract_response_data, load_session, logout

async def get_gpu_specs() -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}
    url=f"{BASE_URL}gpu-specs"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error getting GPU specs: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting GPU specs: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}
    

async def get_provider_info() -> Dict[str, Any]:
    url=f"{BASE_URL}developer/get-provider-info"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url,params={"provider":"all"})
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error getting provider info: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting provider info: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

# print(asyncio.run(get_gpu_specs()))
print(asyncio.run(get_provider_info()))
    