const jwt = require("jsonwebtoken");

const AUTH_COOKIE_NAME = "auth";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function getPassword() {
    return String(process.env.PASSWORD || "password12").trim();
}

function getAuthSecret() {
    const password = getPassword();

    return process.env.JWT_SECRET || `gateway:${password || "missing-password"}`;
}

function parseCookies(cookieHeader = "") {
    return cookieHeader.split(";").reduce((cookies, part) => {
        const [rawKey, ...rawValue] = part.trim().split("=");

        if (!rawKey) return cookies;

        cookies[rawKey] = decodeURIComponent(rawValue.join("="));
        return cookies;
    }, {});
}

function readAuthToken(headers = {}) {
    const cookies = parseCookies(headers.cookie || headers.Cookie || "");
    return cookies[AUTH_COOKIE_NAME] || "";
}

function isSecureRequest(headers = {}) {
    const forwardedProto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "";
    return String(forwardedProto).split(",")[0].trim().toLowerCase() === "https";
}

function isAuthenticated(headers = {}) {
    const token = readAuthToken(headers);

    if (!token) return false;

    try {
        const payload = jwt.verify(token, getAuthSecret());
        return Boolean(payload && payload.access);
    } catch {
        return false;
    }
}

function buildCookie(value, options = {}) {
    const parts = [
        `${AUTH_COOKIE_NAME}=${value}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict"
    ];

    if (options.secure) {
        parts.push("Secure");
    }

    if (typeof options.maxAge === "number") {
        parts.push(`Max-Age=${options.maxAge}`);
    }

    return parts.join("; ");
}

function createAuthCookie(options = {}) {
    const token = jwt.sign(
        { access: true },
        getAuthSecret(),
        { 
            expiresIn: AUTH_COOKIE_MAX_AGE,
            issuer: "gateway",
            algorithm: "HS256"
        }
    );
    jwt.verify(token, getAuthSecret(), {
        issuer: "gateway",
        algorithms: ["HS256"]
    });

    return buildCookie(token, {
        secure: Boolean(options.secure),
        maxAge: AUTH_COOKIE_MAX_AGE
    });
}

function clearAuthCookie(options = {}) {
    return [
        `${AUTH_COOKIE_NAME}=`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        "Max-Age=0",
        "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
        options.secure ? "Secure" : ""
    ].filter(Boolean).join("; ");
}

module.exports = {
    AUTH_COOKIE_NAME,
    getPassword,
    isSecureRequest,
    isAuthenticated,
    createAuthCookie,
    clearAuthCookie
};
