from flask import Flask, send_from_directory
import os

app = Flask(__name__, static_url_path='')

@app.route('/')
def index():
    """Serve the main index.html file."""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    """Serve static files like index.js and style.css."""
    return send_from_directory('.', path)

if __name__ == '__main__':
    # Get port from environment or default to 8000
    port = int(os.environ.get('PORT', 8000))
    print(f"StyleSense AI running on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port)