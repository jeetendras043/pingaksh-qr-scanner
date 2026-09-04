require("dotenv").config();

const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const express = require("express");

const scannerRouter = require("./routes/scanner");

const app = express();
const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || "0.0.0.0";
const DEV_HTTPS = process.env.DEV_HTTPS === "true";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders(res, filePath) {
      if (filePath.endsWith(".webmanifest")) {
        res.setHeader("Content-Type", "application/manifest+json");
      }
    },
  })
);
app.use(express.json());
app.use("/", scannerRouter);

const { execFileSync } = require("child_process");

const isWslOnlyIp = (ip) => {
  const [a, b] = ip.split(".").map(Number);
  return a === 172 && b >= 16 && b <= 31;
};

const windowsWifiIPs = () => {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { $_.IPAddress }",
      ],
      { encoding: "utf8", timeout: 8000 }
    );
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) && !isWslOnlyIp(ip));
  } catch {
    return [];
  }
};

const lanIPs = () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      const family = net.family === "IPv4" || net.family === 4;
      if (family && !net.internal) ips.push(net.address);
    }
  }
  return ips;
};

const printUrls = (protocol) => {
  console.log(`Jewellery QR Scanner (${protocol.toUpperCase()})`);
  console.log(`  Laptop:              ${protocol}://localhost:${PORT}`);

  const wslIps = lanIPs();
  const wifiIps = windowsWifiIPs();

  for (const ip of wslIps) {
    if (isWslOnlyIp(ip)) {
      console.log(`  WSL only (not phone): ${protocol}://${ip}:${PORT}`);
    } else {
      console.log(`  Phone:               ${protocol}://${ip}:${PORT}`);
    }
  }

  for (const ip of wifiIps) {
    console.log(`  Phone (same Wi-Fi):  ${protocol}://${ip}:${PORT}`);
  }

  if (wslIps.some(isWslOnlyIp) && wifiIps.length === 0) {
    console.log("");
    console.log("  Phone cannot open the 172.x address. That is the WSL network, not Wi-Fi.");
    console.log("  1. In Windows PowerShell (Run as administrator):");
    console.log("     powershell -ExecutionPolicy Bypass -File scripts/enable-phone-access.ps1");
    console.log("  2. On the phone open https://YOUR-WIFI-IP:4317  (usually 192.168.x.x)");
  }

  if (DEV_HTTPS) {
    console.log("  Development only. On your phone, tap Advanced → Proceed to continue.");
  }

  console.log("");
  console.log("  Phone hotspot cannot open 172.x or most 10.x laptop IPs.");
  console.log("  Use USB debugging (best):");
  console.log("    adb reverse tcp:4317 tcp:4317");
  console.log("    then on the phone open  https://127.0.0.1:4317");
  console.log("  Or turn on Windows Mobile Hotspot and join that from the phone.");
};

if (DEV_HTTPS) {
  const key = path.join(__dirname, ".certs/dev-key.pem");
  const cert = path.join(__dirname, ".certs/dev-cert.pem");
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    console.error("Missing .certs files. Run: npm run start:lan");
    process.exit(1);
  }
  https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, app).listen(PORT, HOST, () => {
    printUrls("https");
  });
} else {
  http.createServer(app).listen(PORT, HOST, () => {
    printUrls("http");
  });
}
