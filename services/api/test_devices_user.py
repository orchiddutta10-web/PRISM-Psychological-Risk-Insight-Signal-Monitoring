import requests
from app.utils.auth import create_access_token

token = create_access_token({"sub": "0ad2f62a-e779-41cd-978c-23a0954379a3", "type": "guardian"})
res = requests.get('http://localhost:8000/api/v1/auth/devices', headers={"Authorization": f"Bearer {token}"})
print(res.status_code)
print(res.json())
