import os
import requests
from flask import Flask, request, jsonify, render_template

# Define environment variables
AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_KEY = os.environ.get("AZURE_OPENAI_KEY")
MODEL_DEPLOYMENT_NAME = os.environ.get("MODEL_DEPLOYMENT_NAME")
AZURE_SYSTEM_PROMPT = os.environ.get("AZURE_SYSTEM_PROMPT", "You are a helpful assistant".)


app = Flask(__name__)

# Route to serve the HTML file
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/chat', methods=['POST'])
def chat():
    # ... keep your logging and env checks ...

    data = request.get_json(silent=True) or {}

    # Accept either 'chatHistory' (your current client) or 'messages' (standard shape)
    incoming = data.get('chatHistory') or data.get('messages') or []

    # Build messages, forcing our server-side system prompt
    msgs = [{"role": "system", "content": AZURE_SYSTEM_PROMPT}]
    msgs.extend(m for m in incoming if isinstance(m, dict) and m.get("role") != "system")

    payload = {
        "messages": msgs,
        "temperature": float(os.environ.get("AZURE_TEMPERATURE", "0.7")),
        "max_tokens": int(os.environ.get("AZURE_MAX_TOKENS", "512")),
        "stream": False,
    }

    # Use your existing names consistently
    url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{MODEL_DEPLOYMENT_NAME}/chat/completions?api-version=2024-10-21"
    headers = {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_KEY
    }

    @app.route('/debug/openai', methods=['GET', 'POST'])
def debug_openai():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        user_msg = data.get("message", "Hello")
        url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{MODEL_DEPLOYMENT_NAME}/chat/completions?api-version=2024-10-21"
        headers = {"Content-Type": "application/json", "api-key": AZURE_OPENAI_KEY}

        msgs = [
            {"role": "system", "content": AZURE_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg}
        ]
        resp = requests.post(url, headers=headers, json={"messages": msgs}, timeout=30)
        return jsonify(resp.json())
    return jsonify({
        "endpoint": AZURE_OPENAI_ENDPOINT,
        "key_found": bool(AZURE_OPENAI_KEY),
        "deployment": MODEL_DEPLOYMENT_NAME
    })


if __name__ == '__main__':
    app.run()
    # Check if any are missing
    missing = []
    if not AZURE_OPENAI_ENDPOINT:
        missing.append("AZURE_OPENAI_ENDPOINT")
    if not AZURE_OPENAI_KEY:
        missing.append("AZURE_OPENAI_KEY")
    if not MODEL_DEPLOYMENT_NAME:
        missing.append("MODEL_DEPLOYMENT_NAME")
    if missing:
        return jsonify({"status": "error", "message": f"Missing environment variables: {missing}"}), 500

    try:
        url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{MODEL_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview"
        headers = {
            "Content-Type": "application/json",
            "api-key": AZURE_OPENAI_KEY
        }
        # Minimal test message
        payload = {
            "messages": [{"role": "user", "content": "Hello"}]
        }

        print(f"DEBUG: Calling OpenAI API at URL: {url}")
        response = requests.post(url, headers=headers, json=payload, timeout=15)

        if not response.ok:
            error = response.json()
            print(f"ERROR: API call failed: {error}")
            return jsonify({"status": "error", "message": f"OpenAI API error: {error}"}), response.status_code

        api_data = response.json()
        ai_response = api_data['choices'][0]['message']['content']
        print(f"DEBUG: API response: {ai_response}")

        return jsonify({"status": "success", "ai_response": ai_response})

    except Exception as e:
        print(f"ERROR: Unexpected exception: {e}")
        return jsonify({"status": "error", "message": f"Exception occurred: {e}"}), 500
