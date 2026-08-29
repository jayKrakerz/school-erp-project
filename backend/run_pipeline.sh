#!/bin/bash

# ENTERPRISE-GRADE CI/CD PIPELINE - SCHOOL ERP SAAS (CHAOS-RESISTANT)
set -e

echo "------------------------------------------------"
echo "🔥 STARTING CHAOS-RESISTANT PIPELINE — ERP SAAS"
echo "------------------------------------------------"
echo ""

# STAGE 1: CI BUILD & ENVIRONMENT
echo "📦 STAGE 1: Code Build & Validation"
if command -v npm &> /dev/null; then
    npm run build --if-present
    echo "✅ Build stable."
else
    echo "⚠️ npm build skipped."
fi
echo ""

# STAGE 2: CORE SECURITY & AUTH
echo "🔐 STAGE 2: Security & Authentication Lifecycle"
./venv/bin/python3 tests/test_auth.py
./venv/bin/python3 tests/jwt_security_lifecycle_tests.py
./venv/bin/python3 tests/tenant_edge_case_tests.py
echo "✅ Security integrity verified."
echo ""

# STAGE 3: DATA INTEGRITY & ATOMICITY
echo "🧠 STAGE 3: Data Integrity & Transaction Safety"
./venv/bin/python3 tests/transaction_tests.py
./venv/bin/python3 tests/event_consistency_tests.py
echo "✅ Transaction safety verified (ACID compliant)."
echo ""

# STAGE 4: CHAOS & INFRASTRUCTURE RESILIENCE
echo "🔥 STAGE 4: Chaos & Failure Simulation"
./venv/bin/python3 tests/chaos_fail_sim.py
echo "✅ Infrastructure failure simulations handled safely."
echo ""

# STAGE 5: HIGH-LOAD & SCALE PERFORMANCE
echo "⚡ STAGE 5: Production-Scale Load Testing"
./venv/bin/python3 tests/load_performance_saas.py
./venv/bin/python3 tests/report_stress_tests.py
./venv/bin/python3 tests/report_persistence_tests.py
echo "✅ Performance & Persistence benchmarks met."
echo ""

# STAGE 6: EVENT SYNC & SYSTEM CONSISTENCY
echo "🔁 STAGE 6: Event Synchronization Flow"
./venv/bin/python3 tests/event_sync_flow_tests.py
echo "✅ Event data flow verified across modules."
echo ""

# STAGE 7: SYSTEM HEALTH AUDIT (FINAL CHECK)
echo "📡 STAGE 7: Final System Health & State Audit"
./venv/bin/python3 tests/system_health_audit_tests.py
echo "✅ Final audit clean. No orphan data or schoolId leakage detected."
echo ""

# STAGE 8: ROLLBACK READINESS
echo "🔁 STAGE 8: Rollback & Recovery Validation"
./venv/bin/python3 tests/rollback_tests.py
echo "✅ Disaster recovery capability verified."
echo ""

echo "------------------------------------------------"
echo "🏁 MISSION CRITICAL PIPELINE COMPLETE"
echo "🎉 Result: PRODUCTION READY & CHAOS RESISTANT"
echo "------------------------------------------------"
