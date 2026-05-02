"""
WhatsApp Chat Analytics - Flask Backend
Clean, modular, production-ready API
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from parser import parse_chat
from analytics import generate_analytics

app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(__file__), '..', 'frontend', 'static'),
    template_folder=os.path.join(os.path.dirname(__file__), '..', 'frontend', 'templates')
)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # Limit uploads to 10MB

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'txt'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return send_from_directory(app.template_folder, 'index.html')

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle files that exceed MAX_CONTENT_LENGTH."""
    return jsonify({'error': 'File too large (Max 10MB). Please export without media.'}), 413


@app.route('/api/upload', methods=['POST'])
def upload_chat():
    """Upload and analyze WhatsApp chat file."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'Only .txt files are allowed'}), 400

    try:
        content = file.read().decode('utf-8', errors='ignore')

        if len(content.strip()) < 100:
            return jsonify({'error': 'File seems too short or empty'}), 400

        # Parse chat
        messages = parse_chat(content)

        if not messages or len(messages) < 5:
            return jsonify({'error': 'Could not parse chat. Make sure it is a valid WhatsApp export.'}), 400

        # Generate analytics
        analytics = generate_analytics(messages)
        analytics['filename'] = file.filename
        analytics['total_messages_parsed'] = len(messages)

        return jsonify({'success': True, 'data': analytics})

    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500


@app.route('/api/sample', methods=['GET'])
def get_sample():
    """Return analytics from the bundled sample chat."""
    sample_path = os.path.join(os.path.dirname(__file__), '..', 'sample_chat.txt')
    try:
        with open(sample_path, 'r', encoding='utf-8') as f:
            content = f.read()
        messages = parse_chat(content)
        analytics = generate_analytics(messages)
        analytics['filename'] = 'sample_chat.txt'
        analytics['total_messages_parsed'] = len(messages)
        return jsonify({'success': True, 'data': analytics})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Use PORT from environment variable for deployment, default to 5000
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
