import os
import sys

# Add the api directory to the path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask_app import app as flask_app

# Vercel expects the WSGI callable to be named 'app'
app = flask_app

if __name__ == '__main__':
    app.run()
