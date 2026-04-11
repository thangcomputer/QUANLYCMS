@echo off
echo Starting Backend Server...
start "Backend Server" cmd /k "npm run dev"
echo Starting Frontend Client...
cd client
start "Frontend Client" cmd /k "npm run dev"
echo Both servers have been launched in separate windows!
