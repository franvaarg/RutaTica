#!/bin/bash
cd /home/z/my-project
while true; do
  echo "$(date): Starting dev server..." >> /home/z/my-project/dev.log
  bun next dev -p 3000 2>&1 | tee -a /home/z/my-project/dev.log
  echo "$(date): Dev server stopped, restarting in 5 seconds..." >> /home/z/my-project/dev.log
  sleep 5
done
