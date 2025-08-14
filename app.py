import os
import requests
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# --- Azure OpenAI settings (make App Settings names match these) ---
AZURE_OPENAI_ENDPOINT    = os.environ.get("AZURE_OPENAI_ENDPOINT")      # e.g. https://<resource>.openai.azure.com
AZURE_OPENAI_KEY         = os.environ.get("AZURE_OPENAI_KEY")           # your key
MODEL_DEPLOYMENT_NAME    = os.environ.get("MODEL_DEPLOYMENT_NAME")      # e.g. chatdeploy
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")

# --- Prompt & tuning (server-side injection) ---
AZURE_SYSTEM_PROMPT = os.environ.get("AZURE_SYSTEM_PROMPT", "You are a helpful assistant.")
AZURE_TEMPERATURE   = float(os.environ.get("AZURE_TEMPERATURE", "0.7"))
AZURE_MAX_TOKENS    = int(os.environ.get("AZURE_MAX_TOKENS", "512"))


# ---------- Routes ----------
@app.route("/")
def home():
    # expects templates/index.html
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({"ok": True})


@app.route("/debug/openai", methods=["GET", "POST"])
def debug_openai():
    """
    Minimal endpoint to test connectivity to Azure OpenAI.
    POST body: { "message": "Hello" }
    """
    # Quick sanity: required settings present?
    missing = [n for n, v in {
        "AZURE_OPENAI_ENDPOINT": AZURE_OPENAI_ENDPOINT,
        "AZURE_OPENAI_KEY": AZURE_OPENAI_KEY,
        "MODEL_DEPLOYMENT_NAME": MODEL_DEPLOYMENT_NAME
    }.items() if not v]
    if missing:
        return jsonify({"status": "error", "message": f"Missing settings: {', '.join(missing)}"}), 500

    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        user_msg = body.get("message", "Hello")

        url = (
            f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/"
            f"{MODEL_DEPLOYMENT_NAME}/chat/completions"
            f"?api-version={AZURE_OPENAI_API_VERSION}"
        )
        headers = {"Content-Type": "application/json", "api-key": AZURE_OPENAI_KEY}
        payload = {"messages": [
            {"role": "system", "content": AZURE_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg}
        ]}

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            ct = resp.headers.get("content-type", "")
            body = resp.json() if ct and "application/json" in ct else resp.text
            return jsonify({"status": resp.status_code, "body": body})
        except Exception as e:
            return jsonify({"status": "exception", "message": str(e)}), 500

    # GET => show current config (safe: doesn’t print key)
    return jsonify({
        "endpoint": AZURE_OPENAI_ENDPOINT,
        "key_found": bool(AZURE_OPENAI_KEY),
        "deployment": MODEL_DEPLOYMENT_NAME,
        "version": AZURE_OPENAI_API_VERSION,
        "prompt_len": len(AZURE_SYSTEM_PROMPT) if AZURE_SYSTEM_PROMPT else 0,
    })


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Main chat endpoint.
    Accepts either:
      { "chatHistory": [ {role, content}, ... ] }
    or:
      { "messages":    [ {role, content}, ... ] }
    Returns:
      { "reply": "...", "message": "..." }
    """
    # Required settings check
    missing = [n for n, v in {
        "AZURE_OPENAI_ENDPOINT": AZURE_OPENAI_ENDPOINT,
        "AZURE_OPENAI_KEY": AZURE_OPENAI_KEY,
        "MODEL_DEPLOYMENT_NAME": MODEL_DEPLOYMENT_NAME
    }.items() if not v]
    if missing:
        return jsonify({"error": f"Missing settings: {', '.join(missing)}"}), 500

    body = request.get_json(silent=True) or {}

    # Accept either shape from the client
    incoming = body.get("chatHistory") or body.get("messages") or []

    # Build messages with server-side system prompt; ignore client-provided system messages
    msgs = [{"role": "system", "content": AZURE_SYSTEM_PROMPT}]
    msgs.extend(m for m in incoming if isinstance(m, dict) and m.get("role") != "system")

    payload = {
        "messages": msgs,
        "temperature": body.get("temperature", AZURE_TEMPERATURE),
        "max_tokens": body.get("max_tokens", AZURE_MAX_TOKENS),
        "stream": False
    }

    url = (
        f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/"
        f"{MODEL_DEPLOYMENT_NAME}/chat/completions"
        f"?api-version={AZURE_OPENAI_API_VERSION}"
    )
    headers = {"Content-Type": "application/json", "api-key": AZURE_OPENAI_KEY}

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        if not resp.ok:
            # Return Azure's error text to help diagnose quickly
            return jsonify({"error": resp.text, "status": resp.status_code, "url": url}), resp.status_code

        data = resp.json()
        reply = data["choices"][0]["message"]["content"]
        # Return both keys to be compatible with different front-ends
        return jsonify({"reply": reply, "message": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Local dev entrypoint
if __name__ == "__main__":
    # Run local dev server (not used on Azure—use Gunicorn there)
    app.run(host="0.0.0.0", port=8000, debug=True)
