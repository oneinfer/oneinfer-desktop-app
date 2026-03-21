import asyncio
import httpx
import logging
from enum import Enum
from typing import Dict, Any, Optional

from developer_login import BASE_URL, _extract_response_data, load_session, logout

async def get_models() -> Dict[str, Any]:
    url = f"{BASE_URL}developer/get-all-models"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
            return _extract_response_data(response.json())
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error getting models: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting models: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

async def get_models_pricing() -> Dict[str, Any]:
    url = f"{BASE_URL}developer/get-model-pricing"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            response.raise_for_status()
            return _extract_response_data(response.json())
    except httpx.HTTPStatusError as e:
        error_detail = e.response.text
        logging.error(f"HTTP error getting models: {error_detail}")
        return {"error": f"Error: {e.response.status_code} - {error_detail}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting models: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

print(asyncio.run(get_models()))
# print(asyncio.run(get_models_pricing()))