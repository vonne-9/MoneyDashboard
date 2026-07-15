#!/bin/bash
# Double-click this file to launch the Money Dashboard.
# It starts a tiny local web server and opens the dashboard in your browser.

cd "$(dirname "$0")" || exit 1

PORT=8777
echo "💰  Starting My Money dashboard at http://localhost:$PORT"
echo "    (Close this window or press Ctrl+C to stop.)"

# Open the browser a moment after the server starts.
( sleep 1; open "http://localhost:$PORT" ) &

# Python 3 ships with macOS; serve the current folder.
python3 -m http.server "$PORT"
