# Development only. USB-debug your Android phone, then the phone can open
# https://127.0.0.1:4317 even when using a phone hotspot (Wi-Fi IP will fail).

$ErrorActionPreference = "Stop"
adb reverse tcp:4317 tcp:4317
Write-Host ""
Write-Host "On the phone Chrome address bar open:"
Write-Host "  https://127.0.0.1:4317"
Write-Host "Tap Advanced -> Proceed. Keep USB connected and npm run start:lan running."
Write-Host "If adb is not found, install Android Platform Tools and enable USB debugging."
