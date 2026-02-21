@echo off
echo ============================================
echo  MeshSentinel - Startup Script
echo ============================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Installing Python dependencies...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] Failed to install Python dependencies
    pause
    exit /b 1
)

echo [2/4] Installing Node dependencies...
cd meshsentinel-ui
call npm install --silent
if errorlevel 1 (
    echo [ERROR] Failed to install Node dependencies
    pause
    exit /b 1
)
cd ..

echo [3/4] Starting Flask backend (port 5000 + socket port 5555)...
start "MeshSentinel Backend" cmd /k "python server.py"

echo [4/4] Starting React frontend (port 5173)...
cd meshsentinel-ui
start "MeshSentinel Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ============================================
echo  MeshSentinel is starting!
echo  Open: http://localhost:5173
echo ============================================
echo.
timeout /t 4
start http://localhost:5173
