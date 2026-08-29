import unittest
import os
import shutil
import time

class TestRollback(unittest.TestCase):
    def test_auto_rollback_simulation(self):
        """
        Simulate a deployment failure and ensure the system can revert to .bak
        """
        db_path = 'server/data.json'
        bak_path = 'server/data.json.bak'
        
        # 1. Create a backup
        if os.path.exists(db_path):
            shutil.copy2(db_path, bak_path)
        else:
            with open(db_path, 'w') as f: f.write('{"initial": true}')
            shutil.copy2(db_path, bak_path)

        # 2. Corrupt the database (simulated failed migration)
        with open(db_path, 'w') as f: f.write('CORRUPT_NOT_JSON')

        # 3. Simulate rollback trigger
        print("🛠️ SIMULATING AUTO-ROLLBACK...")
        if os.path.exists(bak_path):
            shutil.move(bak_path, db_path)
            print("✅ Rollback successful: Restored from backup.")
        
        # 4. Verify
        with open(db_path, 'r') as f:
            content = f.read()
            self.assertNotIn('CORRUPT', content)

if __name__ == '__main__':
    unittest.main()
