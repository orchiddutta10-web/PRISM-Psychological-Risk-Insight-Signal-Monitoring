import requests

# 1. Login to get token
resp = requests.post("http://localhost:8000/api/v1/auth/login", json={
    "email": "guardian@example.com",
    "password": "password123"
})
if resp.status_code != 200:
    print("Login failed:", resp.status_code, resp.text)
    # try to register
    resp = requests.post("http://localhost:8000/api/v1/auth/register", json={
        "full_name": "Test Guardian",
        "email": "guardian@example.com",
        "password": "password123"
    })
    if resp.status_code == 200:
        print("Registered.")
        resp = requests.post("http://localhost:8000/api/v1/auth/login", json={
            "email": "guardian@example.com",
            "password": "password123"
        })
    else:
        print("Register failed:", resp.status_code, resp.text)

token = resp.json().get("access_token") if resp.status_code == 200 else None

if token:
    print("Got token. Testing NOVA...")
    headers = {"Authorization": f"Bearer {token}"}
    chat_resp = requests.post("http://localhost:8000/api/v1/nova/chat", json={
        "message": "Hello NOVA"
    }, headers=headers)
    print("NOVA chat response:", chat_resp.status_code, chat_resp.text)
else:
    print("No token.")
