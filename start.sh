#!/bin/bash
echo "============================================"
echo " MeshSentinel - Startup Script"
echo "============================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 not found."
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found."
    exit 1
fi

echo "[1/4] Installing Python dependencies..."
pip3 install -r requirements.txt -q

echo "[2/4] Installing Node dependencies..."
cd meshsentinel-ui && npm install --silent && cd ..

echo "[3/4] Starting Flask backend..."
python3 server.py &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 1

echo "[4/4] Starting React frontend..."
cd meshsentinel-ui && npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"
cd ..

echo ""
echo "============================================"
echo " MeshSentinel is running!"
echo " Open: http://localhost:5173"
echo " Press Ctrl+C to stop"
echo "============================================"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
