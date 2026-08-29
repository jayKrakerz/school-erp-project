import unittest
import json
import sys
import os
import threading
import time

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app
from flask_app import app, DEFAULT_DATA

class TestReportStress(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        self.test_data_file = 'server/test_data_report_stress.json'
        flask_app.DATA_FILE = self.test_data_file
        
        self.data = DEFAULT_DATA.copy()
        self.data['users'] = [{"email": "a@s.com", "password": flask_app.hash_password("pw"), "schoolId": "s_a", "role": "ADMIN"}]
        with open(self.test_data_file, 'w') as f:
            json.dump(self.data, f)

        resp = self.app.post('/api/auth/login', data=json.dumps({"email": "a@s.com", "password": "pw"}), content_type='application/json')
        self.token = json.loads(resp.data)['token']

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_concurrent_report_saves(self):
        """
        Simulate multiple threads saving report data simultaneously.
        The data_lock should ensure no data loss occurs.
        """
        num_threads = 20
        results = []

        def save_report(index):
            report_data = {
                "id": f"rep_{index}",
                "studentName": f"Student {index}",
                "schoolId": "s_a",
                "content": {"score": index}
            }
            res = self.app.post('/api/save-report', 
                               headers={'Authorization': f'Bearer {self.token}'},
                               data=json.dumps(report_data),
                               content_type='application/json')
            results.append(res.status_code)

        threads = [threading.Thread(target=save_report, args=(i,)) for i in range(num_threads)]
        for t in threads: t.start()
        for t in threads: t.join()

        # Check for successes
        self.assertEqual(results.count(200), num_threads)
        
        # Verify the database contains all reports
        with open(self.test_data_file, 'r') as f:
            db_data = json.load(f)
        # Verifying both sync keys
        self.assertEqual(len(db_data.get('reports', [])), num_threads)
        self.assertEqual(len(db_data.get('studentReports', [])), num_threads)
        print(f"✅ Concurrent Stress Test: {num_threads} reports saved atomically without data loss.")

if __name__ == '__main__':
    unittest.main()
