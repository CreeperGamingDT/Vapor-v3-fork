const fs = require("fs");
const path = require("path");

const { isAuthenticated } = require("./auth");

const ROOT_DIR = "/";
const DEFAULT_ENTRY = path.join(ROOT_DIR, "default", "index.html");
const PROTECTED_ROOT = path.join(ROOT_DIR, "protected");

const CONTENT_TYPES = {
    ".avif": "image/avif",
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xml": "application/xml; charset=utf-8"
};

const SIGN_OUT_SNIPPET = `
<script data-auth-signout-widget>
(function() {
  if (window.top !== window.self || window.__protectedSignOutReady) return;
  window.__protectedSignOutReady = true;

  function mount() {
    if (!document.body || document.querySelector(".sidebar") || document.getElementById("auth-sidebar-signout")) return;

    var style = document.createElement("style");
    style.textContent = [
      "#auth-signout-btn{position:fixed;top:16px;right:16px;z-index:2147483647;border:0;border-radius:999px;padding:10px 16px;background:rgba(15,18,32,0.88);color:#f4f7ff;font:600 13px/1 Arial,sans-serif;letter-spacing:.02em;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.28);backdrop-filter:blur(12px);}",
      "#auth-signout-btn:hover{background:rgba(35,40,66,0.96);}",
      "#auth-signout-btn:disabled{opacity:.65;cursor:wait;}"
    ].join("");
    document.head.appendChild(style);

    var button = document.createElement("button");
    button.id = "auth-signout-btn";
    button.type = "button";
    button.textContent = "Sign out";
    button.addEventListener("click", async function() {
      button.disabled = true;
      button.textContent = "Signing out...";
      try {
        await fetch("/api/out", {
          method: "POST",
          credentials: "same-origin"
        });
      } catch (error) {
      }
      window.location.href = "/";
    });
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
</script>`;

function getRequestPath(event) {
    if (event.rawUrl) {
        try {
            return new URL(event.rawUrl).pathname || "/";
        } catch {
        }
    }

    return event.path || "/";
}

function normalizePathname(pathname) {
    let normalized = pathname || "/";

    try {
        normalized = decodeURIComponent(normalized);
    } catch {
    }

    normalized = normalized.replace(/\\/g, "/");
    normalized = normalized.replace(/\/{2,}/g, "/");

    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }

    return normalized;
}

function safeResolve(rootDir, relativePath) {
    const absolutePath = path.resolve(rootDir, relativePath);
    const relative = path.relative(rootDir, absolutePath);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return null;
    }

    return absolutePath;
}

function findProtectedFile(pathname) {
    const cleanPath = normalizePathname(pathname);
    const relativePath = cleanPath.replace(/^\/+/, "");
    const ext = path.extname(relativePath);
    const candidates = [];

    if (!relativePath) {
        candidates.push("index.html");
    } else if (cleanPath.endsWith("/")) {
        candidates.push(path.join(relativePath, "index.html"));
    } else if (ext) {
        candidates.push(relativePath);
    } else {
        candidates.push(relativePath);
        candidates.push(`${relativePath}.html`);
        candidates.push(path.join(relativePath, "index.html"));
    }

    for (const candidate of candidates) {
        const resolved = safeResolve(PROTECTED_ROOT, candidate);

        if (!resolved) continue;
        if (!fs.existsSync(resolved)) continue;
        if (!fs.statSync(resolved).isFile()) continue;

        return resolved;
    }

    if (!ext) {
        const fallback = safeResolve(PROTECTED_ROOT, "index.html");
        if (fallback && fs.existsSync(fallback) && fs.statSync(fallback).isFile()) {
            return fallback;
        }
    }

    return null;
}

function getContentType(filePath) {
    return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isTextResponse(contentType) {
    return contentType.startsWith("text/") ||
        contentType.startsWith("application/javascript") ||
        contentType.startsWith("application/json") ||
        contentType.startsWith("application/xml") ||
        contentType.startsWith("application/manifest+json") ||
        contentType.startsWith("image/svg+xml");
}

function injectSignOut(html) {
    if (
        html.includes("data-auth-signout-widget") ||
        html.includes('class="sidebar"') ||
        html.includes("class='sidebar'") ||
        html.includes("auth-sidebar-signout")
    ) {
        return html;
    }

    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${SIGN_OUT_SNIPPET}\n</body>`);
    }

    if (/<\/html>/i.test(html)) {
        return html.replace(/<\/html>/i, `${SIGN_OUT_SNIPPET}\n</html>`);
    }

    return `${html}\n${SIGN_OUT_SNIPPET}`;
}

function buildFileResponse(filePath, options = {}) {
    const contentType = getContentType(filePath);
    const headers = {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
    };

    if (options.method === "HEAD") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    if (isTextResponse(contentType)) {
        let content = fs.readFileSync(filePath, "utf8");

        if (options.injectSignOut && path.extname(filePath).toLowerCase() === ".html") {
            content = injectSignOut(content);
        }

        return {
            statusCode: 200,
            headers,
            body: content
        };
    }

    return {
        statusCode: 200,
        headers,
        isBase64Encoded: true,
        body: fs.readFileSync(filePath).toString("base64")
    };
}

exports.handler = async function(event) {
    const method = event.httpMethod || "GET";

    if (method !== "GET" && method !== "HEAD") {
        return {
            statusCode: 405,
            headers: {
                Allow: "GET, HEAD",
                "Content-Type": "text/plain; charset=utf-8"
            },
            body: "Method not allowed"
        };
    }

    const pathname = getRequestPath(event);
    const authenticated = isAuthenticated(event.headers || {});

    if (!authenticated) {
        return buildFileResponse(DEFAULT_ENTRY, { method });
    }

    const protectedFile = findProtectedFile(pathname);

    if (!protectedFile) {
        return {
            statusCode: 404,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-store"
            },
            body: "Not found"
        };
    }

    return buildFileResponse(protectedFile, {
        method,
        injectSignOut: true
    });
};

