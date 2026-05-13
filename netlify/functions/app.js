const fs = require("fs");
const path = require("path");

const { isAuthenticated } = require("./auth");

const ROOT = process.cwd();

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



function getRequestPath(event) {
    if (event.rawUrl) {
        try {
            return new URL(event.rawUrl).pathname || "/";
        } catch {}
    }

    return event.path || "/";
}

function safeResolve(root, requestPath) {
    let clean = decodeURIComponent(requestPath || "/")
        .replace(/\\/g, "/")
        .replace(/^\/+/, "");

    // folder -> index.html
    if (!clean || clean.endsWith("/")) {
        clean += "index.html";
    }

    // extensionless -> .html
    else if (!path.extname(clean)) {
        clean += ".html";
    }

    const resolved = path.resolve(root, clean);

    if (!resolved.startsWith(path.resolve(root))) {
        return null;
    }

    return resolved;
}

function serveFile(filePath, options = {}) {
    if (!filePath || !fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);

        return {
            statusCode: 404,
            headers: {
                "Content-Type": "text/plain; charset=utf-8"
            },
            body: "Not found. "+filePath
        };
    }

    const contentType = getContentType(filePath);

    const headers = {
        "Content-Type": contentType,
        "Cache-Control": "no-store"
    };

    // head request
    if (options.method === "HEAD") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    // text response
    if (isTextFile(contentType)) {
        let content = fs.readFileSync(filePath, "utf8");


        return {
            statusCode: 200,
            headers,
            body: content
        };
    }

    // binary response
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
                "Content-Type": "text/plain; charset=utf-8"
            },
            body: "Method not allowed."
        };
    }

    const pathname = getRequestPath(event);

    // logged out -> /default/*
    if (!isAuthenticated(event.headers || {})) {
        const filePath = safeResolve(
            path.join(ROOT, "default"),
            pathname
        );

        return serveFile(filePath, {
            method
        });
    }

    // logged in -> /protected/*
    const filePath = safeResolve(
        path.join(ROOT, "protected"),
        pathname
    );

    if (!filePath) {
        return {
            statusCode: 403,
            headers: {
                "Content-Type": "text/plain; charset=utf-8"
            },
            body: "Forbidden."
        };
    }

    return serveFile(filePath, {
        method,
    });
};