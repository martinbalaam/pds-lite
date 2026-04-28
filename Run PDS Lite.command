#!/bin/bash
set -e

cd "$(dirname "$0")"

URL="http://127.0.0.1:4173/"
LOCAL_NODE_DIR="$PWD/.tools/node-v22.22.2-darwin-arm64"

if [ -x "$LOCAL_NODE_DIR/bin/node" ]; then
  export PATH="$LOCAL_NODE_DIR/bin:$PATH"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm were not found."
  echo "This project expects a local Node runtime at:"
  echo "$LOCAL_NODE_DIR"
  echo
  echo "Ask Codex to reinstall the local Node runtime, or install Node.js from https://nodejs.org/."
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing React app dependencies..."
  npm install
fi

echo "Starting PDS Lite React Template Builder..."
echo "Opening ${URL}"
echo

for PORT in 4173 4174; do
  if command -v lsof >/dev/null 2>&1; then
    EXISTING_PIDS=$(lsof -ti tcp:$PORT 2>/dev/null || true)
    if [ -n "$EXISTING_PIDS" ]; then
      echo "Stopping existing process on port $PORT..."
      kill $EXISTING_PIDS 2>/dev/null || true
      sleep 1
    fi
  fi
done

(sleep 2 && open "${URL}") &
npm run dev
