@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  echo Website dependencies are missing. Run pnpm install in TJAI-WEB first.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:5173"
node "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5173 --strictPort
pause
