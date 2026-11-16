import {
    createSessionToken,
    hasAuthConfiguration,
    SESSION_COOKIE_NAME,
    verifyPasswordHash
} from "../../lib/auth.js";

const SESSION_DURATION = {
    temporary: 12 * 60 * 60,
    persistent: 30 * 24 * 60 * 60
};

function setJsonHeaders(response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
}

function parseBody(body) {
    if (typeof body === "string") return JSON.parse(body);
    if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8"));
    return body;
}

export default function login(request, response) {
    setJsonHeaders(response);

    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    if (!hasAuthConfiguration()) {
        console.error("Admin login is unavailable because Vercel authentication environment variables are missing or invalid.");
        return response.status(503).json({ error: "Admin login is not configured. Contact the site administrator." });
    }

    let body;
    try {
        body = parseBody(request.body);
    } catch (error) {
        return response.status(400).json({ error: "Invalid login request." });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)
        || typeof body.username !== "string" || typeof body.password !== "string"
        || body.username.length > 128 || body.password.length > 256
        || (body.remember !== undefined && typeof body.remember !== "boolean")) {
        return response.status(400).json({ error: "Invalid login request." });
    }

    const validUsername = body.username === process.env.KCC_ADMIN_USERNAME;
    const validPassword = verifyPasswordHash(body.password, process.env.KCC_ADMIN_PASSWORD_HASH);
    if (!validUsername || !validPassword) {
        return response.status(401).json({ error: "Invalid Admin Username or Password" });
    }

    const remember = body.remember === true;
    const maxAge = remember ? SESSION_DURATION.persistent : SESSION_DURATION.temporary;
    const token = createSessionToken(process.env.KCC_SESSION_SECRET, maxAge);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const persistentCookie = remember ? `; Max-Age=${maxAge}` : "";
    response.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${secure}${persistentCookie}`
    );
    return response.status(200).json({ success: true });
}
