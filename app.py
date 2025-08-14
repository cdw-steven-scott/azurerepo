import os, requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# --- Azure OpenAI settings (use these exact names in App Settings) ---
AZURE_OPENAI_ENDPOINT    = os.environ.get("AZURE_OPENAI_ENDPOINT")      # e.g. https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY     = os.environ.get("AZURE_OPENAI_API_KEY")       # NOTE: name ends with _API_KEY
AZURE_OPENAI_DEPLOYMENT  = os.environ.get("AZURE_OPENAI_DEPLOYMENT")    # deployment name, e.g. chatdeploy
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")

# --- Prompt & tuning (server-side injection) ---
AZURE_SYSTEM_PROMPT = os.environ.get("AZURE_SYSTEM_PROMPT", "You are a helpful assistant.")
AZURE_TEMPERATURE   = float(os.environ.get("AZURE_TEMPERATURE", "0.7"))
AZURE_MAX_TOKENS    = int(os.environ.get("AZURE_MAX_TOKENS", "512"))

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({"ok": True})

@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json(silent=True) or {}

    # Ensure required settings exist (early, clear error)
    missing = [name for name, val in {
        "AZURE_OPENAI_ENDPOINT": AZURE_OPENAI_ENDPOINT,
        "AZURE_OPENAI_API_KEY": AZURE_OPENAI_API_KEY,
        "AZURE_OPENAI_DEPLOYMENT": AZURE_OPENAI_DEPLOYMENT
    }.items() if not val]
    if missing:
        return jsonify({"error": f"Missing Azure settings: {', '.join(missing)}"}), 500

    # Build messages, forcing server-side system prompt
    msgs = [{"role": "system", "content": AZURE_SYSTEM_PROMPT}]
    msgs.extend(m for m in body.get("messages", []) if m.get("role") != "system")

    payload = {
        "messages": msgs,
        "temperature": body.get("temperature", AZURE_TEMPERATURE),
        "max_tokens": body.get("max_tokens", AZURE_MAX_TOKENS),
        "stream": False,
    }

    url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}"
    headers = {"api-key": AZURE_OPENAI_API_KEY, "Content-Type": "application/json"}

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=60)
        r.raise_for_status()
        data = r.json()
        reply = data["choices"][0]["message"]["content"]
        return jsonify({"reply": reply})
    except requests.HTTPError:
        # Surface Azure's error text for quick debugging
        return jsonify({"error": r.text}), r.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500


    # Log environment variables (for debugging)
    print(f"DEBUG: Endpoint from env: {AZURE_OPENAI_ENDPOINT}")
    print(f"DEBUG: Key from env: {'Found' if AZURE_OPENAI_KEY else 'Not Found'}")
    print(f"DEBUG: Deployment Name from env: {MODEL_DEPLOYMENT_NAME}")

    # Check for required environment variables
    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_KEY or not MODEL_DEPLOYMENT_NAME:
        print("ERROR: Server configuration is missing required environment variables.")
        return jsonify({"message": "Server configuration error: Missing environment variables."}), 500

    data = request.json
    chat_history = data.get('chatHistory')

    if not chat_history:
        print("ERROR: Invalid request, 'chatHistory' is missing from the payload.")
        return jsonify({"message": "Invalid request: chatHistory is required."}), 400

    try:
        url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{MODEL_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview"
        headers = {
            "Content-Type": "application/json",
            "api-key": AZURE_OPENAI_KEY
        }
        payload = {
            "messages": chat_history
        }

        print(f"DEBUG: Attempting to call OpenAI API at URL: {url}")
        
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        
        if not response.ok:
            error = response.json()
            print(f"ERROR: OpenAI API call failed. Status Code: {response.status_code}")
            print(f"ERROR: OpenAI API Response: {error}")
            return jsonify({"message": f"OpenAI API Error: {error.get('message', 'Unknown error')}"}), response.status_code
        
        api_data = response.json()
        ai_response = api_data['choices'][0]['message']['content']
        print(f"DEBUG: Successfully received response from OpenAI API.")

        return jsonify({"message": ai_response})

    except requests.exceptions.RequestException as e:
        print(f"ERROR: A network-related error occurred during API call: {e}")
        return jsonify({"message": f"Network error connecting to OpenAI API: {e}"}), 500

    except Exception as e:
        print(f"ERROR: An unexpected error occurred: {e}")
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

if __name__ == '__main__':
    app.run()
    
@app.route('/debug/openai', methods=['GET', 'POST'])
def debug_openai():
    if request.method == 'POST':
        data = request.json
        user_msg = data.get("message", "")
        # Minimal test with Azure OpenAI
        url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{MODEL_DEPLOYMENT_NAME}/chat/completions?api-version=2024-02-15-preview"
        headers = {"Content-Type": "application/json", "api-key": AZURE_OPENAI_KEY}
        payload = {"messages": [{"role": "user", "content": user_msg}]}
        resp = requests.post(url, headers=headers, json=payload)
        return jsonify(resp.json())
    
    # GET method just shows debug info
    return jsonify({
        "endpoint": AZURE_OPENAI_ENDPOINT,
        "key_found": bool(AZURE_OPENAI_KEY),
        "deployment": MODEL_DEPLOYMENT_NAME
    })


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
