import unittest
import json
import sys
import os
import jwt
from datetime import datetime, timedelta

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app
from flask_app import app, DEFAULT_DATA

class TestTenantEdgeCases(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.test_data_file = 'server/test_data_edge.json'
        flask_app.DATA_FILE = self.test_data_file
        
        self.data = DEFAULT_DATA.copy()
        # School A data
        self.data['students'] = [{"id": "1", "sid": "S1", "schoolId": "school_a", "name": "Alice"}]
        # School B data
        self.data['students'].append({"id": "2", "sid": "S2", "schoolId": "school_b", "name": "Bob"})
        
        with open(self.test_data_file, 'w') as f:
            json.dump(self.data, f)

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_cross_tenant_id_injection(self):
        """
        Scenario: School A user tries to REQUEST School B's data by injecting 
        schoolId in the POST body or query parameter.
        The backend MUST ignore the injected field and strictly use the JWT's schoolId.
        """
        token_a = jwt.encode({
            'email': 'user@a.com', 'role': 'ADMIN', 'schoolId': 'school_a',
            'exp': datetime.utcnow() + timedelta(days=1)
        }, flask_app.SECRET_KEY, algorithm='HS256')

        # Try to CREATE an expenditure for School B while logged in as School A
        payload = {
            "date": "2026-06-02",
            "description": "Ghost Expense",
            "amount": 500,
            "schoolId": "school_b" # INJECTED!
        }
        
        # In flask_app.py: new_exp = { ..., \"schoolId\": exp_data.get('schoolId', 'default'), ... }
        # WAIT! This is a vulnerability I just discovered by writing the test.
        # I need to fix manage_expenditure to prioritize get_school_context()!
        
        response = self.app.post('/api/expenditure', 
                                headers={'Authorization': f'Bearer {token_a}'},
                                data=json.dumps(payload),
                                content_type='application/json')
        
        # Verify the created expenditure actually has school_a (from token) not school_b
        result = json.loads(response.data)['expenditure']
        
        # I'll fix this in the code after this test file is created.
        self.assertEqual(result['schoolId'], 'school_a', "VULNERABILITY: User was able to inject schoolId!")

if __name__ == '__main__':
    unittest.main()
