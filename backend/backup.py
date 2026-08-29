import os
import shutil
import time
import json

# Configuration
BACKUP_DIR = os.path.join(os.path.dirname(__file__), 'backups')
DATA_FILE = os.path.join(os.path.dirname(__file__), 'data.json')

def run_backup():
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)
    
    timestamp = time.strftime('%Y%m%d-%H%M%S')
    backup_path = os.path.join(BACKUP_DIR, f'data_backup_{timestamp}.json')
    
    if os.path.exists(DATA_FILE):
        shutil.copy2(DATA_FILE, backup_path)
        print(f"✅ Database backed up to: {backup_path}")
        
        # Keep only last 10 backups
        backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.startswith('data_backup_')])
        if len(backups) > 10:
            for old_backup in backups[:-10]:
                os.remove(os.path.join(BACKUP_DIR, old_backup))
                print(f"🧹 Removed old backup: {old_backup}")
    else:
        print("❌ Error: data.json not found. Nothing to back up.")

if __name__ == '__main__':
    run_backup()
