import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { readFile, stat } from "node:fs/promises";

const requestedRoot = process.argv[2] ?? ".";
const projectRoot = resolve(process.cwd());
const root = resolve(process.cwd(), requestedRoot);
const port = Number.parseInt(process.argv[3] ?? process.env.PORT ?? "4173", 10);
const host = process.env.HOST ?? "127.0.0.1";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
};

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://${host}`).pathname);
  if (pathname === "/vendor/colyseus.js") {
    return root === projectRoot
      ? resolve(projectRoot, "node_modules", "@colyseus", "sdk", "dist", "colyseus.js")
      : resolve(root, "vendor", "colyseus.js");
  }
  if (pathname === "/vendor/colyseus-debug.js") {
    return root === projectRoot
      ? resolve(projectRoot, "node_modules", "@colyseus", "sdk", "dist", "debug.js")
      : resolve(root, "vendor", "colyseus-debug.js");
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = normalize(join(root, relativePath));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }
  return candidate;
}

const server = createServer(async (request, response) => {
  const filePath = resolveRequestPath(request.url ?? "/");
  if (!filePath) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const fileStats = await stat(filePath);
    const finalPath = fileStats.isDirectory() ? join(filePath, "index.html") : filePath;
    const body = await readFile(finalPath);
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": MIME_TYPES[extname(finalPath).toLowerCase()] ?? "application/octet-stream",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`寿数回战本地预览：http://${host}:${port}`);
});
