const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const certDir = path.join(__dirname, "..", ".certs");
const keyFile = path.join(certDir, "dev-key.pem");
const certFile = path.join(certDir, "dev-cert.pem");

const lanIPs = () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
};

if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
  process.exit(0);
}

fs.mkdirSync(certDir, { recursive: true });

const san = ["DNS:localhost", "IP:127.0.0.1", ...lanIPs().map((ip) => `IP:${ip}`)].join(",");

try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-nodes",
      "-keyout",
      keyFile,
      "-out",
      certFile,
      "-days",
      "825",
      "-subj",
      "/CN=PINGAKSH-DEV",
      "-addext",
      `subjectAltName=${san}`,
    ],
    { stdio: "inherit" }
  );
} catch (err) {
  console.error("Could not create a development certificate. Install openssl in WSL, then retry.");
  process.exit(1);
}

console.log("Created development HTTPS certificate in .certs/");
