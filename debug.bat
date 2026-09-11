@echo off
cd /d "%~dp0"
IF EXIST "backend\.venv\Scripts\python.exe" (
    "backend\.venv\Scripts\python.exe" backend\desktop.py
) ELSE IF EXIST ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" backend\desktop.py
) ELSE (
    echo No se encontro el entorno virtual .venv en la carpeta.
)
pause