const fs = require("fs");
const path = require("path");

const { isAuthenticated } = require("./auth");

const ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_ROOT = path.join(ROOT, "default");
const PROTECTED_ROOT = path.join(ROOT, "protected");

const PUBLIC_INDEX = path.join(DEFAULT_ROOT, "index.html");

// content types
const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
};

const SIGN_OUT_SNIPPET = `
<script data-auth-signout-widget>
(function() {
  if (window.top !== window.self) return;

  function mount() {
    if (document.getElementById("auth-signout-btn")) return;

    const button = document.createElement("button");

    button.id = "auth-signout-btn";
    button.textContent = "Sign out";

    Object.assign(button.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      zIndex: "999999",
      border: "0",
      borderRadius: "999px",
      padding: "10px 16px",
      background: "#111827",
      color: "white",
      cursor: "pointer"
    });

    button.onclick = async () => {
      try {
        await fetch("/api/out", {
          method: "POST",
          credentials: "same-origin"
        });
      } catch {}

      location.href = "/";
    };

    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
</script>
`;

function getContentType(filePath) {
    return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function isTextFile(contentType) {
    return (
        contentType.startsWith("text/") ||
        contentType.includes("javascript") ||
        contentType.includes("json") ||
        contentType.includes("svg")
    );
}

function injectSignOut(html) {
    if (html.includes("data-auth-signout-widget")) {
        return html;
    }

    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${SIGN_OUT_SNIPPET}</body>`);
    }

    return html + SIGN_OUT_SNIPPET;
}

function safeResolve(root, requestPath) {
    let clean = decodeURIComponent(requestPath || "/")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");

    if (!clean || clean.endsWith("/")) {
        clean += "index.html";
    }

    if (!path.extname(clean)) {
        clean += ".html";
    }

    const resolved = path.resolve(root, clean);

    if (!resolved.startsWith(path.resolve(root))) {
        return null;
    }

    return resolved;
}

function serveFile(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
        return {
            statusCode: 404,
            body: "Not found."
        };
    }

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

    // text files
    if (isTextFile(contentType)) {
        let content = fs.readFileSync(filePath, "utf8");

        if (options.injectSignOut && contentType.startsWith("text/html")) {
            content = injectSignOut(content);
        }

        return {
            statusCode: 200,
            headers,
            body: content
        };
    }

    // binary files
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
            body: "Method not allowed."
        };
    }

    // not logged in
    if (!isAuthenticated(event.headers || {})) {
        const pathname =
            event.rawUrl
                ? new URL(event.rawUrl).pathname
                : event.path || "/";
        
        const filePath = safeResolve(DEFAULT_ROOT, pathname);
        
        return serveFile(filePath || PUBLIC_INDEX, {
            method
        });
    }

    const pathname =
        event.rawUrl
            ? new URL(event.rawUrl).pathname
            : event.path || "/";

    const filePath = safeResolve(PROTECTED_ROOT, pathname);

    if (!filePath) {
        return {
            statusCode: 403,
            body: "Forbidden."
        };
    }

    return serveFile(filePath, {
        method,
        injectSignOut: true
    });
};