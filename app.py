import os, requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# --- Azure OpenAI settings (use these exact names in App Settings) ---
AZURE_OPENAI_ENDPOINT    = os.environ.get("AZURE_OPENAI_ENDPOINT")      # e.g. https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY     = os.environ.get("AZURE_OPENAI_API_KEY")       # NOTE: ends with _API_KEY
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

@app.route("/debug/openai", methods=["GET", "POST"])
def debug_openai():
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        user_msg = body.get("message", "Hello")
        url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version={AZURE_OPENAI_API_VERSION}"
        headers = {"api-key": AZURE_OPENAI_API_KEY, "Content-Type": "application/json"}
        payload = {"messages": [{"role": "user", "content": user_msg}]}
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        ct = resp.headers.get("content-type","")
        body = resp.json() if ct.startswith("application/json") else resp.text
        return jsonify({"status": resp.status_code, "body": body})
    return jsonify({
        "endpoint": AZURE_OPENAI_ENDPOINT,
        "key_found": bool(AZURE_OPENAI_API_KEY),
        "deployment": AZURE_OPENAI_DEPLOYMENT,
        "version": AZURE_OPENAI_API_VERSION,
    })

@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json(silent=True) or {}

    # Ensure required settings exist (clear early error)
    for name, val in {
        "AZURE_OPENAI_ENDPOINT": AZURE_OPENAI_ENDPOINT,
        "AZURE_OPENAI_API_KEY": AZURE_OPENAI_API_KEY,
        "AZURE_OPENAI_DEPLOYMENT": AZURE_OPENAI_DEPLOYMENT,
    }.items():
        if not val:
            return jsonify({"error": f"Missing Azure setting: {name}"}), 500

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
        if not r.ok:
            return jsonify({"error": r.text, "status": r.status_code, "url": url}), r.status_code
        data = r.json()
        reply = data["choices"][0]["message"]["content"]
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
