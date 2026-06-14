#!/usr/bin/env bash
# Stop the SomnaTrace API and Vite dev servers.

stopped=0

# Go API — matches the process launched by dev.sh
if pids=$(pgrep -f 'go run.*cmd/somnatrace' 2>/dev/null); then
  echo "Stopping API (pids: $pids)"
  kill $pids 2>/dev/null && stopped=$((stopped + 1))
fi

# Vite dev server
if pids=$(pgrep -f 'vite' 2>/dev/null); then
  echo "Stopping Vite (pids: $pids)"
  kill $pids 2>/dev/null && stopped=$((stopped + 1))
fi

# Also kill any process bound to the known ports (belt and suspenders).
for port in 8080 5173; do
  if pid=$(lsof -ti tcp:"$port" 2>/dev/null); then
    echo "Releasing port $port (pid: $pid)"
    kill "$pid" 2>/dev/null && stopped=$((stopped + 1))
  fi
done

if [ "$stopped" -eq 0 ]; then
  echo "No running SomnaTrace servers found."
else
  echo "Done."
fi
