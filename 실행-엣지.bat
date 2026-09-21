@echo off
rem Launch the exhibit in kiosk (fullscreen) mode with Microsoft Edge.  Exit: Alt+F4
set "HERE=%~dp0"
start "" msedge --kiosk "file:///%HERE%index.html" --edge-kiosk-type=fullscreen --no-first-run --disable-pinch --overscroll-history-navigation=0
