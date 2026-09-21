@echo off
rem Launch the exhibit in kiosk (fullscreen) mode with Google Chrome.  Exit: Alt+F4
set "HERE=%~dp0"
start "" chrome --kiosk "file:///%HERE%index.html" --no-first-run --disable-pinch --overscroll-history-navigation=0
