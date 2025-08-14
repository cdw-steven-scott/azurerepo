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

# Route for the chat API
@app.route('/api/chat', methods=['POST'])
def chat():
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
