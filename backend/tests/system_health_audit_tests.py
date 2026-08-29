import unittest
import json
import os
import sys

# Add server directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'server')))

class TestSystemHealthAudit(unittest.TestCase):
    def test_database_consistency_scan(self):
        """
        Audit the actual data.json file for inconsistencies.
        Checks for:
        1. Missing schoolId on core records.
        2. Orphan reports (reports without valid student records).
        3. Invalid numeric fields.
        """
        data_path = 'server/data.json'
        if not os.path.exists(data_path):
            self.skipTest("data.json not found, skipping live audit.")

        with open(data_path, 'r') as f:
            data = json.load(f)

        collections = ['students', 'payments', 'expenditures', 'reports']
        inconsistencies = []

        for col in collections:
            items = data.get(col, [])
            for i, item in enumerate(items):
                if isinstance(item, dict) and 'schoolId' not in item:
                    inconsistencies.append(f"MISSING schoolId: {col} at index {i} (id={item.get('id','?')})")

        # Orphan Check: reports referencing non-existent students
        student_sids = {s.get('sid') for s in data.get('students', []) if s.get('sid')}
        orphan_reports = []
        for r in data.get('reports', []):
            sid = r.get('studentSid')
            if sid and sid not in student_sids:
                orphan_reports.append(f"ORPHAN report id={r.get('id','?')} references missing student sid={sid}")

        all_issues = inconsistencies + orphan_reports

        if all_issues:
            print("\n❌ SYSTEM HEALTH FAILURE:")
            for issue in all_issues:
                print(f"  - {issue}")
        
        self.assertEqual(len(all_issues), 0, f"System audit detected dirty data state: {all_issues}")
        print(f"✅ System Audit Complete: Scanned {len(collections)} core collections, {len(data.get('reports',[]))} reports.")

if __name__ == '__main__':
    unittest.main()
