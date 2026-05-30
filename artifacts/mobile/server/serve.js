/**
 * Standalone production server for Expo static builds.
 * Extended with a high-performance native media streaming engine for StreamGram downloads.
 * Supports native HTTP 206 Partial Content range seeking, pause, and resume.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

/**
 * 🎬 NEW: High-performance streaming proxy pipeline bridge.
 * Intercepts mobile Expo file system downloads and fetches from the user client layer.
 */
function handleMediaStreamPipeline(messageId, req, res) {
  const phoneHeader = req.headers["phone"] || "+254700000000";
  const rangeHeader = req.headers["range"];

  // Point toward your internal Python/Telethon core service running in your workspace
  const backendServiceUrl = `http://127.0.0.1:8000/api/download/${messageId}`;

  const proxyOptions = {
    method: "GET",
    headers: {
      phone: phoneHeader,
    },
  };

  if (rangeHeader) {
    proxyOptions.headers["range"] = rangeHeader;
  }

  // Fire up an internal HTTP handshake request to the Telethon data parser client
  const proxyReq = http.request(backendServiceUrl, proxyOptions, (proxyRes) => {
    // Forward the content-range, content-length, and status codes exactly
    res.writeHead(proxyRes.statusCode, proxyRes.headers);

    // Pipe the data chunks directly straight down to your friend's mobile screen
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Media streaming relay failure:", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: "Streaming engine proxy connection refused" }),
    );
  });

  proxyReq.end();
}

const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  // ROUTE 1: Intercept incoming mobile background downloading requests
  const downloadMatch = pathname.match(/^\/api\/download\/(\d+)/);
  if (downloadMatch) {
    const messageId = parseInt(downloadMatch[1], 10);
    return handleMediaStreamPipeline(messageId, req, res);
  }

  // ROUTE 2: Handle Manifest configurations
  if (pathname === "/" || pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }

    if (pathname === "/") {
      return serveLandingPage(req, res, landingPageTemplate, appName);
    }
  }

  // ROUTE 3: Fallback straight to static build production directories
  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
