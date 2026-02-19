from flask import Flask, send_from_directory, render_template_string
import os

app = Flask(__name__, static_url_path='')

@app.route('/')
def index():
    """Serve the main index.html file with the API key injected."""
    # Read the API_KEY from the system environment variables
    api_key = os.environ.get('API_KEY', '')
    
    # Read the index.html file
    try:
        with open('index.html', 'r') as f:
            html_content = f.read()
    except FileNotFoundError:
        return "index.html not found", 404
    
    # Inject the API key into a global process object for the browser
    # We define window.process before any other scripts load
    injection_script = f"""
    <script>
        window.process = {{
            env: {{
                API_KEY: "{api_key}"
            }}
        }};
    </script>
    """
    
    # Insert the script at the beginning of the <head>
    if '<head>' in html_content:
        html_content = html_content.replace('<head>', f'<head>{injection_script}')
    else:
        html_content = injection_script + html_content
        
    return render_template_string(html_content)

@app.route('/<path:path>')
def static_files(path):
    """Serve static files like index.js and style.css."""
    return send_from_directory('.', path)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    print(f"\n✨ StyleSense AI")
    print(f"🚀 Running on http://localhost:{port}")
    
    current_key = os.environ.get('API_KEY')
    if not current_key:
        print(f"❗ API Key missing! Set it in your terminal first:")
        print(f"   Windows (PS): $env:API_KEY='your_key'")
        print(f"   Mac/Linux:    export API_KEY='your_key'\n")
    else:
        # Show first 4 chars for confirmation
        print(f"✅ API Key detected (starts with: {current_key[:4]}...)\n")
        
    app.run(host='0.0.0.0', port=port)
