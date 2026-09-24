@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js が見つかりません。
  echo Node.js 22 以上をインストールしてから、もう一度実行してください。
  echo https://nodejs.org/
  pause
  exit /b 1
)

echo WebROMS を起動します...
echo 起動時に表示される WebROMS の URL をブラウザで開いてください。
echo このウィンドウを開いたままにしてください。
echo.

node server.js

echo.
echo WebROMS は停止しました。
pause
