import requests
from app.utils.auth import create_access_token

token = create_access_token({"sub": "ea2af28b-b2b0-47a3-90f9-8db18019d6f4", "type": "guardian"})
res = requests.get('http://localhost:8000/api/v1/auth/devices', headers={"Authorization": f"Bearer {token}"})
print(res.status_code)
print(res.json())
