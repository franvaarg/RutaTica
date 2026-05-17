#!/bin/bash

# Robust server starter with monitoring
cd /home/z/my-project

LOG_FILE="/tmp/rutatica-robust.log"
PID_FILE="/tmp/rutatica-server.pid"

# Function to start server
start_server() {
    echo "$(date): Starting server..." >> "$LOG_FILE"
    nohup node .next/standalone/server.js >> "$LOG_FILE" 2>&1 < /dev/null &
    echo $! > "$PID_FILE"
}

# Function to check if server is responding
check_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            # Process is running, check if responding
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 --max-time 5)
            if [ "$HTTP_CODE" = "200" ]; then
                return 0
            fi
        fi
    fi
    return 1
}

# Main loop
while true; do
    if ! check_server; then
        echo "$(date): Server not responding, starting/restarting..." >> "$LOG_FILE"
        start_server
        sleep 10
    fi

    # Check every 5 seconds
    sleep 5
done
