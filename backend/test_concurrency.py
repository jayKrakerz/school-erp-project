import requests
import threading
import time
import random
import json

BASE_URL = "http://localhost:8080/api"
TOKEN = "TSA-SECURE-ACCESS-2026" # Using legacy token for simplicity in test script

def add_student(name, i):
    payload = {
        "id": f"test-{i}-{random.randint(1000, 9999)}",
        "name": name,
        "class": "BASIC 1 A",
        "contact": "000-000-0000",
        "sid": f"2026-TEST-{i}"
    }
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    try:
        response = requests.post(f"{BASE_URL}/students/add", json=payload, headers=headers)
        print(f"[Thread {i}] Added student {name}: {response.status_code}")
    except Exception as e:
        print(f"[Thread {i}] Error adding student: {e}")

def update_data_monolithic(i):
    # Simulating the old dangerous behavior to see if it causes issues
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    try:
        # Get all data
        data = requests.get(f"{BASE_URL}/data", headers=headers).json()
        # Add a random log entry or similar
        data['activity_log'].append({"type": "CONCURRENCY_TEST", "time": time.ctime(), "thread": i})
        # Save whole thing
        response = requests.post(f"{BASE_URL}/data/activity_log", json=data['activity_log'], headers=headers)
        print(f"[Thread {i}] Monolithic update: {response.status_code}")
    except Exception as e:
        print(f"[Thread {i}] Error in monolithic update: {e}")

def run_test():
    print("Starting Concurrency Test...")
    threads = []
    
    # Simulate 10 users adding students simultaneously
    for i in range(10):
        t = threading.Thread(target=add_student, args=(f"Concurrent Student {i}", i))
        threads.append(t)
        t.start()
    
    # Simulate 5 users doing monolithic updates (should be protected by lock)
    for i in range(10, 15):
        t = threading.Thread(target=update_data_monolithic, args=(i,))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()
    
    print("Test Complete. Check data.json for consistency.")

if __name__ == "__main__":
    run_test()
