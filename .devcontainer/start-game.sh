#!/usr/bin/env bash
set -euo pipefail

npm run build
nohup npm start >/tmp/xpgame-server.log 2>&1 </dev/null &
server_pid=$!
echo "$server_pid" >/tmp/xpgame-server.pid

for _ in $(seq 1 60); do
  if curl --silent --show-error --fail http://127.0.0.1:3000/health >/dev/null; then
    echo "[XPGame] Server ready on port 3000 (PID $server_pid)."
    exit 0
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "[XPGame] Server exited before becoming ready. Log:" >&2
    cat /tmp/xpgame-server.log >&2 || true
    exit 1
  fi
  sleep 1
done

echo "[XPGame] Server did not become ready within 60 seconds. Log:" >&2
cat /tmp/xpgame-server.log >&2 || true
exit 1
