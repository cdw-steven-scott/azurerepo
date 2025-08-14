import os
import requests
from flask import Flask, request, jsonify, render_template

# Define environment variables
AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY = os.environ.get("AZURE_OPENAI_KEY")
MODEL_DEPLOYMENT_NAME = os.environ.get("MODEL_DEPLOYMENT_NAME")

app = Flask(__name__)

# Route to serve the HTML file
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    # Log env for quick diagnostics (safe: doesn’t print the key)
    print(f"DEBUG: Endpoint from env: {AZURE_OPENAI_ENDPOINT}")
    print(f"DEBUG: Key from env: {'Found' if AZURE_OPENAI_KEY else 'Not Found'}")
    print(f"DEBUG: Deployment Name from env: {MODEL_DEPLOYMENT_NAME}")

    # Required settings
    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_KEY or not MODEL_DEPLOYMENT_NAME:
        return jsonify({"message": "Server configuration error: Missing environment variables."}), 500

    data = request.get_json(silent=True) or {}

    # Accept either shape
    incoming = data.get('chatHistory') or data.get('messages') or []

    # Build messages with server-side system prompt (ignore any client system msgs)
    msgs = [{"role": "system", "content": AZURE_SYSTEM_PROMPT}]
    msgs.extend(m for m in incoming if isinstance(m, dict) and m.get("role") != "system")

    url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{MODEL_DEPLOYMENT_NAME}/chat/completions?api-version=2024-10-21"
    headers = {"Content-Type": "application/json", "api-key": AZURE_OPENAI_KEY}
    payload = {
        "messages": msgs,
        "temperature": float(os.environ.get("AZURE_TEMPERATURE", "0.7")),
        "max_tokens": int(os.environ.get("AZURE_MAX_TOKENS", "512")),
        "stream": False
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        reply = data["choices"][0]["message"]["content"]
        return jsonify({"message": reply})
    except requests.HTTPError:
        return jsonify({"message": resp.text}), resp.status_code
    except Exception as e:
        return jsonify({"message": str(e)}), 500
