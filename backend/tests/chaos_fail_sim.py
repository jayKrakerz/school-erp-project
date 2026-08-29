import unittest
import json
import sys
import os
import shutil
from unittest.mock import patch, mock_open

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app
from flask_app import app

class TestChaosInfrastructure(unittest.TestCase):
    def setUp(self):
        self.test_data_file = 'server/test_data_chaos.json'
        flask_app.DATA_FILE = self.test_data_file
        with open(self.test_data_file, 'w') as f:
            json.dump({"test": "initial"}, f)

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_disk_write_failure_atomic_recovery(self):
        """
        Simulate a Disk Full or Permission Error during the atomic write.
        Verify that the original database remains intact and not corrupted.
        """
        initial_content = {"test": "initial"}
        corrupt_data = {"test": "SHOULD_NOT_SAVE", "garbage": "x"*1000}
        
        # Patch os.replace to fail, simulating failure *after* writing temp but *before* atomic swap
        with patch('os.replace', side_effect=OSError("Disk Full!")):
            try:
                flask_app.save_data(corrupt_data)
            except OSError:
                pass # expected
        
        # Verify old data is still there and valid
        with open(self.test_data_file, 'r') as f:
            current = json.load(f)
        self.assertEqual(current['test'], "initial")
        print("✅ Chaos Test: Atomic recovery verified after simulated Disk Write Failure.")

    def test_idempotency_enforcement(self):
        """Verify that re-sending the same requestId returns 200 but doesn't duplicate record."""
        client = app.test_client()
        
        # 1. Login to get token
        import jwt
        from datetime import datetime, timedelta
        token = jwt.encode({
            'email': 'admin@school.com', 'role': 'ADMIN', 'schoolId': 'chaos_school',
            'exp': datetime.utcnow() + timedelta(days=1)
        }, flask_app.SECRET_KEY, algorithm='HS256')
        
        headers = {'Authorization': f'Bearer {token}', 'X-Request-ID': 'unique_event_123'}
        payload = {"date": "2026-06-02", "description": "Chaos Expense", "amount": 100}
        
        # First request
        resp1 = client.post('/api/expenditure', headers=headers, data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp1.status_code, 200)

        # Immediate retry (Network glitch / Double click)
        resp2 = client.post('/api/expenditure', headers=headers, data=json.dumps(payload), content_type='application/json')
        self.assertEqual(resp2.status_code, 200)
        self.assertTrue(json.loads(resp2.data).get('duplicate'))
        
        # Verify only 1 record exists in the DB
        with open(self.test_data_file, 'r') as f:
            data = json.load(f)
        self.assertEqual(len(data.get('expenditures', [])), 1)
        print("✅ Chaos Test: Event Idempotency verified. Prevented duplicate financial ledger entry.")

if __name__ == '__main__':
    unittest.main()
