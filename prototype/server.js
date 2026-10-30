// QRNG trainer: serves the page and proxies lizaonair.com/qrng (which sends no CORS headers).
// Run: node server.js   then open http://localhost:5173
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5173;
const QRNG = "https://lizaonair.com/qrng/";

async function qrngInt(min, max) {
  const res = await fetch(`${QRNG}?min=${min}&max=${max}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`QRNG HTTP ${res.status}`);
  const { value } = await res.json();
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`QRNG bad value ${value}`);
  return value;
}

// n bits, 16 per upstream call (0..65535 is the largest range that comes back correct).
async function qrngBits(n) {
  const calls = Math.ceil(n / 16);
  const words = await Promise.all(Array.from({ length: calls }, () => qrngInt(0, 65535)));
  const bits = [];
  for (const w of words) for (let i = 15; i >= 0 && bits.length < n; i--) bits.push((w >> i) & 1);
  return bits;
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname === "/api/int") {
        const min = parseInt(url.searchParams.get("min") ?? "1", 10);
        const max = parseInt(url.searchParams.get("max") ?? "2", 10);
        if (!(min < max) || max - min > 65535) return send(res, 400, { error: "bad range" });
        return send(res, 200, { value: await qrngInt(min, max), at: Date.now() });
      }
      if (url.pathname === "/api/bits") {
        const n = Math.min(Math.max(parseInt(url.searchParams.get("n") ?? "100", 10) || 100, 1), 2000);
        return send(res, 200, { bits: await qrngBits(n), at: Date.now() });
      }
      if (url.pathname === "/api/meta") {
        const r = await fetch(`${QRNG}meta`);
        return send(res, r.status, await r.text());
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return send(res, 200, fs.readFileSync(path.join(__dirname, "index.html"), "utf8"), "text/html; charset=utf-8");
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 502, { error: String(e.message || e) });
    }
  })
  .listen(PORT, () => console.log(`QRNG trainer on http://localhost:${PORT}`));
