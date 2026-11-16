import { next } from "@vercel/functions";
import { hasAuthConfiguration, verifySessionCookie } from "./lib/auth.js";

function noStoreHeaders(extraHeaders = {}) {
    return {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...extraHeaders
    };
}

function redirectTo(pathname, requestUrl) {
    return new Response(null, {
        status: 303,
        headers: noStoreHeaders({ Location: new URL(pathname, requestUrl).toString() })
    });
}

export default function protectPos(request) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/login") return redirectTo("/login.html", request.url);
    if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return next();
    if (pathname === "/manifest.json" || pathname === "/app-icon.svg") return next();

    if (pathname === "/login.html" && !hasAuthConfiguration()) return next();
    if (!hasAuthConfiguration()) {
        return new Response("POS authentication is not configured. Set the required Vercel environment variables.", {
            status: 503,
            headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" })
        });
    }

    const authenticated = verifySessionCookie(
        request.headers.get("cookie"),
        process.env.KCC_SESSION_SECRET
    );

    if (pathname === "/login.html") {
        return authenticated ? redirectTo("/", request.url) : next();
    }
    if (authenticated) return next();

    if (pathname === "/" || pathname === "/index.html") {
        return redirectTo("/login.html", request.url);
    }

    return new Response("Authentication required.", {
        status: 401,
        headers: noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" })
    });
}
