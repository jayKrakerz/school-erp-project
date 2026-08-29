#!/bin/bash
# Blue-Green Deployment Script (Local Simulation)
# This script manages two instances of the backend to ensure zero-downtime updates.

BLUE_PORT=8080
GREEN_PORT=8081
PID_FILE=".backend.pid"
ACTIVE_PORT_FILE=".active_port"

# 1. Determine currently active environment
if [ -f "$ACTIVE_PORT_FILE" ]; then
    ACTIVE_PORT=$(cat "$ACTIVE_PORT_FILE")
else
    ACTIVE_PORT=$BLUE_PORT
fi

if [ "$ACTIVE_PORT" == "$BLUE_PORT" ]; then
    TARGET_PORT=$GREEN_PORT
    TARGET_ENV="GREEN"
else
    TARGET_PORT=$BLUE_PORT
    TARGET_ENV="BLUE"
fi

echo "--- Starting Blue-Green Deployment ---"
echo "Active environment: $ACTIVE_PORT"
echo "Target environment: $TARGET_PORT ($TARGET_ENV)"

# 2. Start the new environment
echo "Launching $TARGET_ENV environment on port $TARGET_PORT..."
PORT=$TARGET_PORT python3 backend/server.py > /dev/null 2>&1 &
NEW_PID=$!

# 3. Health Check
echo "Waiting for $TARGET_ENV to become healthy..."
MAX_RETRIES=10
COUNT=0
while [ $COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:$TARGET_PORT/api/auth/verify" > /dev/null; then
        echo "$TARGET_ENV is healthy!"
        HEALTHY=true
        break
    fi
    echo "Retrying health check ($COUNT/$MAX_RETRIES)..."
    sleep 2
    COUNT=$((COUNT+1))
done

if [ "$HEALTHY" != "true" ]; then
    echo "ERROR: $TARGET_ENV failed health check. Aborting deployment."
    kill $NEW_PID
    exit 1
fi

# 4. Swap Traffic (Simulated by updating the active port file)
echo "Swapping traffic to $TARGET_ENV..."
echo $TARGET_PORT > "$ACTIVE_PORT_FILE"

# 5. Shutdown old environment
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    echo "Shutting down old environment (PID $OLD_PID)..."
    kill $OLD_PID || true
fi

echo $NEW_PID > "$PID_FILE"
echo "Deployment successful! Active environment is now $TARGET_ENV on port $TARGET_PORT."
