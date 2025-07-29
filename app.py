from flask import Flask, render_template, request, jsonify
import requests
import os

app = Flask(__name__)

AZURE_FACE_API_ENDPOINT = os.environ.get("AZURE_FACE_API_ENDPOINT")
AZURE_FACE_API_KEY = os.environ.get("AZURE_FACE_API_KEY")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    image_file = request.files['image']
    headers = {
        'Ocp-Apim-Subscription-Key': AZURE_FACE_API_KEY,
        'Content-Type': 'application/octet-stream'
    }
    params = {
        'returnFaceAttributes': 'emotion'
    }
    response = requests.post(
        AZURE_FACE_API_ENDPOINT,
        params=params,
        headers=headers,
        data=image_file.read()
    )
    return jsonify(response.json())

if __name__ == '__main__':
    app.run(debug=True)
