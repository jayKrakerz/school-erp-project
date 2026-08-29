import unittest
import sys
import os
import json
import bcrypt
from unittest.mock import patch, MagicMock

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app

class TestAuth(unittest.TestCase):
    def setUp(self):
        # Setup a temporary data file path
        self.test_data_file = 'server/test_data.json'
        flask_app.DATA_FILE = self.test_data_file
        self.default_user = {
            "email": "test@school.com",
            "password": flask_app.hash_password("password123"),
            "name": "Test User",
            "role": "ADMIN",
            "schoolId": "test_school"
        }
        self.data = {
            "users": [self.default_user],
            "schoolInfo": {"schoolName": "Test School"}
        }
        with open(self.test_data_file, 'w') as f:
            json.dump(self.data, f)

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_hash_password(self):
        pw = "mysecret"
        hashed = flask_app.hash_password(pw)
        self.assertTrue(hashed.startswith('$2b$'))
        self.assertTrue(bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8')))

    def test_check_password_bcrypt(self):
        pw = "mysecret"
        hashed = flask_app.hash_password(pw)
        self.assertTrue(flask_app.check_password(pw, hashed))
        self.assertFalse(flask_app.check_password("wrong", hashed))

    def test_check_password_legacy(self):
        # Test plain text fallback
        pw = "legacy_pass"
        self.assertTrue(flask_app.check_password(pw, pw))
        self.assertFalse(flask_app.check_password("wrong", pw))

    def test_login_logic(self):
        # We can't easily test the Flask route without full app context, 
        # but we can test the internal authentication components
        user = self.default_user
        self.assertTrue(flask_app.check_password("password123", user['password']))

if __name__ == '__main__':
    unittest.main()
