#!/usr/bin/env node
/**
 * Prints the LAN addresses this machine can serve I'm Live on, so people on
 * the same Wi-Fi/local network know where to point their browsers.
 * (The server binds 0.0.0.0; the app also shows a QR code in Studio/call pages.)
 */
import os from "node:os";

const nets = os.networkInterfaces();
const addresses = [];
for (const [name, addrs] of Object.entries(nets)) {
  for (const addr of addrs ?? []) {
    if (addr.family === "IPv4" && !addr.internal) {
      addresses.push(`http://${addr.address}:8787  (${name})`);
    }
  }
}

console.log("\n  I'm Live — LAN addresses (share these with devices on your network):\n");
if (addresses.length === 0) {
  console.log("  No network interfaces found. Connect to a Wi-Fi/LAN network and rerun.");
} else {
  for (const a of addresses) console.log(`    ${a}`);
}
console.log("\n  Start the server with: npm run lan  (serves the built app + API on :8787)\n");
