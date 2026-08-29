import unittest
import json
import os
import time
import sys
import statistics
from datetime import datetime

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app
from flask_app import app

class TestHighLoadSaaS(unittest.TestCase):
    def setUp(self):
        self.test_data_file = 'server/test_data_load.json'
        flask_app.DATA_FILE = self.test_data_file
        
        # Scenario: 5,000 students in one school tenant
        print("🏗️  Preparing high-load scenario (5,000 students)...")
        students = []
        for i in range(5000):
            students.append({
                "id": str(i),
                "sid": f"STU-{i}",
                "name": f"Student Name {i}",
                "class": "BASIC 6",
                "schoolId": "mega_school_a"
            })
        
        data = flask_app.DEFAULT_DATA.copy()
        data['students'] = students
        data['payments'] = []
        data['expenditures'] = []
        
        with open(self.test_data_file, 'w') as f:
            json.dump(data, f)

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_query_scaling_performance(self):
        """
        Measure response time for bulk student retrieval with a 5,000 record dataset.
        Requirement: Average response must remain < 500ms even under load.
        """
        client = app.test_client()
        import jwt
        token = jwt.encode({'schoolId': 'mega_school_a', 'role': 'ADMIN'}, flask_app.SECRET_KEY, algorithm='HS256')
        
        latencies = []
        for _ in range(10):
            start = time.time()
            resp = client.get('/api/students', headers={'Authorization': f'Bearer {token}'})
            latencies.append((time.time() - start) * 1000)
            self.assertEqual(resp.status_code, 200)

        avg = statistics.mean(latencies)
        print(f"📊 SCALE METRICS (5,000 Students): Avg latency {avg:.2f}ms")
        self.assertLess(avg, 500, "Performance degradation on large datasets!")

if __name__ == '__main__':
    import unittest
    unittest.main()
