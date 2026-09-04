# Run this in Windows PowerShell AS ADMINISTRATOR (right-click → Run as administrator)
# Development only: forwards port 4317 from Windows Wi-Fi into WSL.

$ErrorActionPreference = "Stop"
$port = 4317
$wslIp = (wsl -e hostname -I).Trim().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)[0]

if (-not $wslIp) {
  Write-Error "Could not read WSL IP. Start WSL once, then run this again."
}

Write-Host "WSL IP: $wslIp"
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$wslIp connectport=$port

netsh advfirewall firewall delete rule name="PINGAKSH Dev 4317" 2>$null
netsh advfirewall firewall add rule name="PINGAKSH Dev 4317" dir=in action=allow protocol=TCP localport=$port profile=private

Write-Host ""
Write-Host "Port $port is forwarded. On the phone use your Wi-Fi IPv4 (not 172.x):"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "172.1*" -and $_.IPAddress -notlike "172.2*" -and $_.IPAddress -notlike "172.3*" } |
  ForEach-Object { Write-Host ("  https://{0}:{1}" -f $_.IPAddress, $port) }

Write-Host ""
Write-Host "Keep npm run start:lan running in WSL, then open the https://192.168.x.x:$port URL on the phone."
