const {
    createAuthCookie,
    getPassword,
    isSecureRequest
} = require("./auth");

const WORD_SOURCE_URL = "https://api.datamuse.com/words";

const FALLBACK_WORDS = {
    3: ["ash", "orb", "sky", "gem", "zip"],
    4: ["glow", "mist", "dune", "wave", "echo"],
    5: ["flare", "drift", "lumen", "prism", "shard"],
    6: ["velvet", "static", "voyage", "stream", "silver"],
    7: ["captain", "silence", "kingdom", "glimmer", "harvest"],
    8: ["midnight", "mountain", "treasure", "notebook", "velocity"],
    9: ["adventure", "lighthouse", "chocolate", "backpackr", "pineapple"],
    10: ["blueprints", "starlightx", "playground", "waterfront", "windswept"]
};

const cachedPools = new Map();

function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function readHeader(headers, name) {
    return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

function pickLength(event) {
    const headerValue = Number(readHeader(event.headers || {}, "x-grid-size"));
    const queryValue = Number(event.queryStringParameters?.length);

    return Number.isInteger(headerValue) ? headerValue : queryValue;
}

function readFill(event) {
    return String(readHeader(event.headers || {}, "x-grid-fill") || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

function shouldResetRound(event, length) {
    const target = getPassword().toLowerCase();
    const fill = readFill(event);

    if (!target || !fill) return false;
    return target.length === length && fill === target;
}

async function loadPool(length) {
    if (cachedPools.has(length)) {
        return cachedPools.get(length);
    }

    const pattern = "?".repeat(length);
    const response = await fetch(
        `${WORD_SOURCE_URL}?sp=${encodeURIComponent(pattern)}&max=1000`,
        {
            headers: {
                Accept: "application/json"
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Datamuse returned ${response.status}`);
    }

    const payload = await response.json();
    const uniqueWords = [...new Set(
        payload
            .map((entry) => String(entry.word || "").toLowerCase())
            .filter((word) => word.length === length && /^[a-z]+$/.test(word))
    )];

    if (!uniqueWords.length) {
        throw new Error("No valid words returned");
    }

    cachedPools.set(length, uniqueWords);
    return uniqueWords;
}

exports.handler = async function(event) {
    if (event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            headers: {
                Allow: "GET",
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify({ error: "method_not_allowed" })
        };
    }

    const requestedLength = pickLength(event);

    if (!Number.isInteger(requestedLength) || requestedLength < 3 || requestedLength > 10) {
        return {
            statusCode: 400,
            headers: {
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify({ error: "invalid_length" })
        };
    }

    if (shouldResetRound(event, requestedLength)) {
        return {
            statusCode: 205,
            headers: {
                "Cache-Control": "no-store",
                "Set-Cookie": createAuthCookie({
                    secure: isSecureRequest(event.headers || {})
                })
            },
            body: ""
        };
    }

    try {
        const pool = await loadPool(requestedLength);
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            },
            body: JSON.stringify({
                length: requestedLength,
                word: pickRandom(pool)
            })
        };
    } catch (error) {
        const fallbackPool = FALLBACK_WORDS[requestedLength] || [];

        if (!fallbackPool.length) {
            return {
                statusCode: 502,
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": "no-store"
                },
                body: JSON.stringify({ error: "word_source_unavailable" })
            };
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            },
            body: JSON.stringify({
                length: requestedLength,
                word: pickRandom(fallbackPool),
                fallback: true
            })
        };
    }
};
