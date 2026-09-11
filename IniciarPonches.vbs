Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtener la ruta exacta de la carpeta raíz
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = ScriptDir

' Definir rutas con comillas dobles para soportar espacios en la ruta
PythonExe = """" & ScriptDir & "\backend\.venv\Scripts\pythonw.exe"""
ScriptPath = """" & ScriptDir & "\backend\desktop.py"""

' Ejecutar en segundo plano
WshShell.Run PythonExe & " " & ScriptPath, 0, False