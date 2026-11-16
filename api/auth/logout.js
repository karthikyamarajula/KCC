import { SESSION_COOKIE_NAME } from "../../lib/auth.js";

export default function logout(request, response) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");

    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "Method not allowed." });
    }

    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
    );
    return response.status(200).json({ success: true });
}
