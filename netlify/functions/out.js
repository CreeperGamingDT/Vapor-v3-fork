const {
    clearAuthCookie,
    isSecureRequest
} = require("./auth");

exports.handler = async function(event) {
    if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
        return {
            statusCode: 405,
            headers: {
                Allow: "GET, POST",
                "Content-Type": "application/json; charset=utf-8"
            },
            body: JSON.stringify({ success: false, error: "method_not_allowed" })
        };
    }

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Set-Cookie": clearAuthCookie({
                secure: isSecureRequest(event.headers || {})
            })
        },
        body: JSON.stringify({ success: true })
    };
};
