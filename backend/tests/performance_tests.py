import time
import requests
import statistics
import sys
import os
import json

# Define parameters
BASE_URL = "http://localhost:3001"
ITERATIONS = 50
TARGET_LATENCY_MS = 300

def run_performance_test():
    print(f"🚀 Starting Performance Stress Test ({ITERATIONS} iterations)...")
    
    # 1. Login to get token
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", 
                              json={"email": "admin@school.com", "password": "password123"})
    if not login_resp.ok:
        print("❌ Login failed. Ensure server is running at", BASE_URL)
        return
    token = login_resp.json()['token']
    headers = {"Authorization": f"Bearer {token}"}

    latencies = []
    success_count = 0

    for i in range(ITERATIONS):
        start = time.time()
        try:
            # Test getting students (common heavy call)
            resp = requests.get(f"{BASE_URL}/api/students", headers=headers)
            end = time.time()
            if resp.ok:
                latencies.append((end - start) * 1000)
                success_count += 1
        except Exception as e:
            print(f"  - Request {i} failed: {e}")

    if not latencies:
        print("❌ No successful requests recorded.")
        return

    avg = statistics.mean(latencies)
    p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies)
    
    print("\n📊 PERFORMANCE SUMMARY:")
    print(f"  - Success Rate: {(success_count/ITERATIONS)*100:.1f}%")
    print(f"  - Average Latency: {avg:.2f}ms")
    print(f"  - P95 Latency: {p95:.2f}ms")
    
    if avg < TARGET_LATENCY_MS:
        print(f"✅ PASS: Average latency is below {TARGET_LATENCY_MS}ms")
    else:
        print(f"❌ FAIL: Average latency {avg:.2f}ms exceeds target {TARGET_LATENCY_MS}ms")

if __name__ == "__main__":
    run_performance_test()
