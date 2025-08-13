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
    print(f"Endpoint: {AZURE_OPENAI_ENDPOINT}")
    print(f"Key Found: {bool(AZURE_OPENAI_KEY)}")
    print(f"Deployment Name: {MODEL_DEPLOYMENT_NAME}")

    # Check for required environment variables
    if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_KEY or not MODEL_DEPLOYMENT_NAME:
        return jsonify({"message": "Server configuration error: Missing environment variables."}), 500

    data = request.json
    chat_history = data.get('chatHistory')

    if not chat_history:
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

        response = requests.post(url, headers=headers, json=payload)
        
        if not response.ok:
            error = response.json()
            print(f"OpenAI API Error: {response.status_code} - {error.get('message', 'Unknown error')}")
            return jsonify({"message": f"OpenAI API Error: {error.get('message', 'Unknown error')}"}), response.status_code
        
        api_data = response.json()
        ai_response = api_data['choices'][0]['message']['content']

        return jsonify({"message": ai_response})

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return jsonify({"message": f"An unexpected error occurred: {e}"}), 500

if __name__ == '__main__':
    app.run()
