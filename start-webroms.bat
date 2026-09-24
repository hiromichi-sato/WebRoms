@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 goto failed
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-webroms.ps1"
if errorlevel 1 goto failed
popd
exit /b 0
:failed
echo.
echo WebROMS could not start. See the message above and WINDOWS.md.
echo Extract the entire ZIP before starting. Keep all files together.
pause
exit /b 1
