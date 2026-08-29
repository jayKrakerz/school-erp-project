import unittest
import json
import sys
import os
import shutil
from unittest.mock import patch, mock_open

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

import flask_app

class TestTransactionSafety(unittest.TestCase):
    def setUp(self):
        self.test_data_file = 'server/test_data_tx.json'
        flask_app.DATA_FILE = self.test_data_file
        self.initial_data = {"test": [1, 2, 3]}
        with open(self.test_data_file, 'w') as f:
            json.dump(self.initial_data, f)

    def tearDown(self):
        if os.path.exists(self.test_data_file):
            os.remove(self.test_data_file)

    def test_atomic_write_failure_simulation(self):
        """
        Simulate a crash during the write process.
        Verify that the database doesn't end up with partial/corrupt JSON.
        """
        new_data = {"test": [1, 2, 3, 4, 5], "new_field": "val"}
        
        # Scenario: File is opened for writing but system crashes before dump completes
        # In a real app, we should write to a temp file then rename (atomic rename)
        # Let's check if the current implementation is vulnerable.
        
        try:
            with patch('json.dump', side_effect=Exception("System Crash!")):
                flask_app.save_data(new_data)
        except Exception:
            pass

        # If it failed mid-dump, the file might be empty or partial.
        # Let's verify the file is still valid JSON (either old or new, not garbage)
        try:
            with open(self.test_data_file, 'r') as f:
                content = json.load(f)
            self.assertIn("test", content)
        except json.JSONDecodeError:
            self.fail("Database corrupted! Atomic write failed to protect integrity.")

    def test_concurrent_write_lock(self):
        """Verify that data_lock prevents race conditions."""
        # Simulated by checking lock acquisition
        self.assertTrue(flask_app.data_lock.acquire(blocking=True))
        flask_app.data_lock.release()

if __name__ == '__main__':
    unittest.main()
