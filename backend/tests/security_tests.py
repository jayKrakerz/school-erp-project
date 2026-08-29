import unittest
import json
import sys
import os
import time

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

from flask_app import app, DATA_FILE, DEFAULT_DATA

class TestSecurity(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        self.test_data_file = 'server/test_data_security.json'
        
        import flask_app
        flask_app.DATA_FILE = self.test_data_file
        
        self.data = DEFAULT_DATA.copy()
        self.data['users'] = [
            {
                "email": "victim@school.com", 
                "password": flask_app.hash_password("correct123"), 
                "role": "TEACHER",
                "schoolId": "school_a"
            }
        ]
        with open(self.test_data_file, 'w') as f:
            json.dump(self.data, f)

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_brute_force_simulation(self):
        # Simulation of 5 failed attempts
        for i in range(5):
            response = self.app.post('/api/auth/login', 
                                    data=json.dumps({"email": "victim@school.com", "password": "wrong"}),
                                    content_type='application/json')
            self.assertEqual(response.status_code, 401)
            
        print("✅ Brute force test completed: 5/5 attempts correctly rejected.")

    def test_multi_school_isolation(self):
        # 1. Create a student for school_a
        self.data['students'].append({"id": "stu_a", "schoolId": "school_a", "name": "Alice"})
        self.data['students'].append({"id": "stu_b", "schoolId": "school_b", "name": "Bob"})
        with open(self.test_data_file, 'w') as f:
            json.dump(self.data, f)

        # 2. Login as school_a user
        import flask_app
        import jwt
        from datetime import datetime, timedelta
        token_a = jwt.encode({
            'email': 'victim@school.com',
            'role': 'TEACHER',
            'schoolId': 'school_a',
            'exp': datetime.utcnow() + timedelta(days=1)
        }, flask_app.SECRET_KEY, algorithm='HS256')

        # 3. Request students — should only see 'Alice'
        response = self.app.get('/api/students', 
                               headers={'Authorization': f'Bearer {token_a}'})
        students = json.loads(response.data)
        
        school_ids = [s.get('schoolId') for s in students]
        self.assertIn('school_a', school_ids)
        self.assertNotIn('school_b', school_ids)
        print("✅ Multi-school isolation verified: No leakage between tenants.")

if __name__ == '__main__':
    unittest.main()
