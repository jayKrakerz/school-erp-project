import unittest
import json
import os
import sys
import time

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app
from flask_app import app, DEFAULT_DATA

class TestReportPersistence(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.test_data_file = 'server/test_data_persistence.json'
        flask_app.DATA_FILE = self.test_data_file
        
        self.data = DEFAULT_DATA.copy()
        # Create a user for login
        self.data['users'] = [{
            "email": "persist@test.com", 
            "password": flask_app.hash_password("password"), 
            "schoolId": "test_school", 
            "role": "ADMIN"
        }]
        with open(self.test_data_file, 'w') as f:
            json.dump(self.data, f)
            
        # Login to get token
        resp = self.app.post('/api/auth/login', 
                            data=json.dumps({"email": "persist@test.com", "password": "password"}), 
                            content_type='application/json')
        self.token = json.loads(resp.data)['token']

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_report_persists_after_save_and_reinstantiate(self):
        """
        GIVEN a report is saved
        WHEN we reinstantiate the server state (load from disk again)
        THEN the report must be present and unchanged.
        """
        report_payload = {
            "id": "persisted-report-001",
            "studentSid": "SID123",
            "studentName": "Persistent Student",
            "schoolId": "test_school",
            "academicYear": "2024/2025",
            "term": "TERM 1",
            "reportData": {"grades": {"Math": "A"}}
        }
        
        # Save report
        save_resp = self.app.post('/api/save-report', 
                                 headers={'Authorization': f'Bearer {self.token}'},
                                 data=json.dumps(report_payload), 
                                 content_type='application/json')
        self.assertEqual(save_resp.status_code, 200)
        
        # Simulate "Refresh" — re-fetch from the API (correct route is /api/student-report/<sid>)
        fetch_resp = self.app.get('/api/student-report/SID123', headers={'Authorization': f'Bearer {self.token}'})
        self.assertEqual(fetch_resp.status_code, 200, f"Fetch failed: {fetch_resp.data}")
        reports = json.loads(fetch_resp.data)
        
        # Verify persistence and accuracy
        self.assertTrue(any(r['id'] == "persisted-report-001" for r in reports),
                        f"Report not found in response: {reports}")
        saved_report = next(r for r in reports if r['id'] == "persisted-report-001")
        self.assertEqual(saved_report['reportData']['grades']['Math'], "A")
        
        # Verify write to disk actually happened
        with open(self.test_data_file, 'r') as f:
            disk_data = json.load(f)
        self.assertTrue(any(r['id'] == "persisted-report-001" for r in disk_data.get('reports', [])))
        print("✅ Report Persistence Verified: Data survives server-state refresh.")

if __name__ == '__main__':
    unittest.main()
