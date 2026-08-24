import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.PORT || 8899);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

http
  .createServer((req, res) => {
    if (req.url === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }
    let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (pathname === "/") pathname = "/tests/fixtures/host/page.html";
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("forbidden");
    }
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404);
        return res.end("not found: " + pathname);
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(body);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`keyfix fixture server on http://127.0.0.1:${PORT}`));
