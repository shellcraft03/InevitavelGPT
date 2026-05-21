@echo off
setlocal enabledelayedexpansion
for /f "usebackq tokens=1,* delims==" %%A in ("coleta\.env") do (
    set _v=%%B
    set _v=!_v:"=!
    set %%A=!_v!
)
python main.py
pause
endlocal
