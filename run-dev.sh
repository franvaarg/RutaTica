#!/bin/bash

cd /home/z/my-project

while true; do
  echo "Starting dev server at $(date)" >> /home/z/my-project/dev.log
  bun run dev >> /home/z/my-project/dev.log 2>&1
  echo "Server crashed or stopped at $(date)" >> /home/z/my-project/dev.log
  sleep 2
done