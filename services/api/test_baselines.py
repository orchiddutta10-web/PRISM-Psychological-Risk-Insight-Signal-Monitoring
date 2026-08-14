import requests
from app.utils.auth import create_access_token

token = create_access_token({"sub": "ea2af28b-b2b0-47a3-90f9-8db18019d6f4", "type": "guardian"})
res = requests.get('http://localhost:8000/api/v1/events/baselines/cc571fcd-cb82-4a39-a584-fcafc9de1c00', headers={"Authorization": f"Bearer {token}"})
print("Baselines:", res.json())

res2 = requests.get('http://localhost:8000/api/v1/events/scores/cc571fcd-cb82-4a39-a584-fcafc9de1c00', headers={"Authorization": f"Bearer {token}"})
print("Scores:", res2.json())
