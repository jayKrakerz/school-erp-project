import unittest
import json
import sys
import os
import jwt
import time
from datetime import datetime, timedelta

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app
from flask_app import app

class TestJWTLifecycle(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.secret = flask_app.SECRET_KEY

    def test_expired_token_rejection(self):
        """Verify that tokens past their 'exp' date are rejected."""
        payload = {
            'email': 'admin@school.com',
            'role': 'ADMIN',
            'schoolId': 'school_a',
            'exp': datetime.utcnow() - timedelta(seconds=1) # Already expired
        }
        expired_token = jwt.encode(payload, self.secret, algorithm='HS256')
        
        response = self.app.get('/api/students', headers={'Authorization': f'Bearer {expired_token}'})
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid or expired token", json.loads(response.data)['error'])

    def test_tampered_token_rejection(self):
        """Verify that modifying the payload without re-signing fails."""
        payload = {
            'email': 'teacher@school.com',
            'role': 'TEACHER',
            'schoolId': 'school_a',
            'exp': datetime.utcnow() + timedelta(days=1)
        }
        valid_token = jwt.encode(payload, self.secret, algorithm='HS256')
        
        # Tamper: change role to ADMIN manually in the base64 part (simulated by invalid signature)
        header_b64, payload_b64, signature_b64 = valid_token.split('.')
        # Use a different secret to sign
        forged_token = jwt.encode(payload, "WRONG_SECRET", algorithm='HS256')
        
        response = self.app.get('/api/students', headers={'Authorization': f'Bearer {forged_token}'})
        self.assertEqual(response.status_code, 401)

    def test_missing_school_id_in_token(self):
        """Verify that a token without schoolId is handled safely (not permitted access to collections)."""
        payload = {
            'email': 'admin@school.com',
            'role': 'ADMIN',
            'exp': datetime.utcnow() + timedelta(days=1)
        }
        bad_token = jwt.encode(payload, self.secret, algorithm='HS256')
        
        response = self.app.get('/api/students', headers={'Authorization': f'Bearer {bad_token}'})
        # If it passes auth but schoolId is missing, it should return default/empty data, 
        # or we should check if it returns 200 with empty list.
        self.assertEqual(response.status_code, 200, f"Expected 200 but got {response.status_code}. Data: {response.data}")
        self.assertEqual(json.loads(response.data), [])

if __name__ == '__main__':
    unittest.main()
