import asyncio
import httpx
import logging
from enum import Enum
from typing import Dict, Any, Optional, Type, TypeVar, Union

from pydantic import BaseModel, ValidationError

from developer_login import BASE_URL, _extract_response_data, load_session, logout


class ModelProviders(str,Enum):
    openai:str = "openai"
    deepseek:str = "deepseek"
    anthropic:str="anthropic"
    groq:str="groq"
    novita: str = "novita"
    grok: str = "grok"
    google: str = "google"


class EndpointType(str, Enum):
    INFERENCE_API = "inference_api"
    DEDICATED = "dedicated"


class CreateInferenceApiRequest(BaseModel):
    provider: ModelProviders
    model_id: str
    top_p: float = 0.9
    temperature: float = 0.7
    max_tokens: int = 4096


class UpdateIntelligentEndpointRequest(BaseModel):
    intelligent_endpoint_id: str
    name: Optional[str] = None
    routing_config: Optional[Dict[str, Any]] = None


RequestModelT = TypeVar("RequestModelT", bound=BaseModel)


def _model_to_dict(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def _coerce_request_model(model_cls: Type[RequestModelT], payload: Union[RequestModelT, Dict[str, Any]]) -> RequestModelT:
    if isinstance(payload, model_cls):
        return payload
    return model_cls(**payload)

async def create_intelligent_endpoint(name: Optional[str] = None) -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/create-intelligent-endpoint"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, params={"name": name})
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

        logging.error(f"HTTP error creating intelligent endpoint: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error creating intelligent endpoint: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}
    

async def list_intelligent_endpoints() -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/list-intelligent-endpoints"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
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

        logging.error(f"HTTP error listing intelligent endpoints: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error listing intelligent endpoints: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

async def get_intelligent_endpoint_details(intelligent_endpoint_id: str) -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/get-intelligent-endpoint"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, params={"intelligent_endpoint_id": intelligent_endpoint_id})
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

        logging.error(f"HTTP error getting intelligent endpoint details: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error getting intelligent endpoint details: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

async def create_inference_api(request_data: Union[CreateInferenceApiRequest, Dict[str, Any]]) -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/inference-api-endpoint"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        request_model = _coerce_request_model(CreateInferenceApiRequest, request_data)
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=_model_to_dict(request_model))
            response.raise_for_status()
            return _extract_response_data(response.json())
    except ValidationError as e:
        logging.error(f"Validation error creating inference API: {str(e)}")
        return {"error": f"Invalid create_inference_api payload: {str(e)}"}
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

        logging.error(f"HTTP error creating inference API: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error creating inference API: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}
    
async def list_inference_api_endpoints() -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/list-inference-api-endpoints"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers)
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

        logging.error(f"HTTP error listing inference API endpoints: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error listing inference API endpoints: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}


async def attach_endpoint(intelligent_endpoint_id: str, endpoint_type: Union[EndpointType, str], endpoint_id: str) -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/attach-endpoint"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        normalized_endpoint_type = endpoint_type.value if isinstance(endpoint_type, EndpointType) else EndpointType(endpoint_type).value
        params = {
            "intelligent_endpoint_id": intelligent_endpoint_id,
            "endpoint_type": normalized_endpoint_type,
            "endpoint_id": endpoint_id
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, params=params)
            response.raise_for_status()
            return _extract_response_data(response.json())
    except ValueError:
        allowed_values = ", ".join(endpoint.value for endpoint in EndpointType)
        return {"error": f"Invalid endpoint_type. Allowed values: {allowed_values}"}
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

        logging.error(f"HTTP error attaching endpoint: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error attaching endpoint: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

async def detach_endpoint(intelligent_endpoint_id: str, endpoint_id: str) -> Dict[str, Any]:
    session = load_session()
    session_token = session.get("access_token") if session else None
    session_developer_id = session.get("developer_id") if session else None

    developer_id = session_developer_id
    token = session_token

    if not developer_id:
        return {"error": "No developer_id provided and no saved session found."}

    if not token:
        return {"error": "No saved access token found. Please log in first."}

    url = f"{BASE_URL}developer/{developer_id}/detach-endpoint"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        params = {
            "intelligent_endpoint_id": intelligent_endpoint_id,
            "endpoint_id": endpoint_id
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, params=params)
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

        logging.error(f"HTTP error detaching endpoint: {error_message}")
        return {"error": f"Error: {e.response.status_code} - {error_message}"}
    except httpx.RequestError as e:
        logging.error(f"Request error detaching endpoint: {str(e)}")
        return {"error": f"Request failed: {str(e)}"}

# print(asyncio.run(create_intelligent_endpoint(name="My Intelligent Endpoint")))
# print(asyncio.run(create_intelligent_endpoint()))
# print(asyncio.run(list_intelligent_endpoints()))
# print(asyncio.run(get_intelligent_endpoint_details(intelligent_endpoint_id="059862594161471aa72645986116184a")))
# print(asyncio.run(create_inference_api(CreateInferenceApiRequest(
#     provider=ModelProviders.openai,
#     # model_id="gpt-3.5-turbo",
#     model_id="4405f5a62e9944ac8089cfde28a9f9f2",
#     top_p=0.9,
#     temperature=0.7,
#     max_tokens=100,
# ))))
# print(asyncio.run(list_inference_api_endpoints()))
print(asyncio.run(attach_endpoint(
    intelligent_endpoint_id="059862594161471aa72645986116184a",
    endpoint_type=EndpointType.INFERENCE_API,
    # endpoint_id="a9c4e29625824cbab52451b413db9003"
    endpoint_id="02b02e2c68494b94bbf5eea7ed4251e3"
)))
# print(asyncio.run(detach_endpoint(
#     intelligent_endpoint_id="059862594161471aa72645986116184a",
#     endpoint_id="a9c4e29625824cbab52451b413db9003"
# )))