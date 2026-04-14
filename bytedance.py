import requests

API_KEY = "a800d58a-0639-4559-a84d-b0e9a9558ce8"
BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"

url = f"{BASE_URL}/endpoints"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
print(response.status_code)
print(response.json())
