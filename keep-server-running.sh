#!/bin/bash

# Script to keep the Next.js server running
cd /home/z/my-project

while true; do
  echo "$(date): Starting server..."
  node .next/standalone/server.js >> /tmp/rutatica-server.log 2>&1
  EXIT_CODE=$?
  echo "$(date): Server stopped with exit code $EXIT_CODE"
  echo "$(date): Restarting in 5 seconds..."
  sleep 5
done
