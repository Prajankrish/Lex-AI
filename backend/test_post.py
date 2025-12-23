# backend/test_post.py
import requests, json
url = "http://127.0.0.1:5000/chat"
payload = {"message":"What is the punishment for forgery under IPC?","user_id":"demo_user@gmail.com"}
r = requests.post(url, json=payload)
print("STATUS:", r.status_code)
print("RESPONSE:", r.text)
