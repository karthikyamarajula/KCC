import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
    createPasswordHash,
    createSessionToken,
    verifyPasswordHash,
    verifySessionCookie
} from "../lib/auth.js";
import login from "../api/auth/login.js";
import protectPos from "../proxy.js";

const sessionSecret = "a".repeat(43);
const testPassword = randomBytes(32).toString("base64url");

function makeResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test("scrypt password hash verifies only the matching password", () => {
    const hash = createPasswordHash(testPassword);
    assert.notEqual(hash, createPasswordHash(testPassword));
    assert.equal(verifyPasswordHash(testPassword, hash), true);
    assert.equal(verifyPasswordHash(randomBytes(32).toString("base64url"), hash), false);
    assert.equal(verifyPasswordHash("anything", "not-a-hash"), false);
});

test("signed sessions reject tampering and expired cookies", () => {
    const now = 1_700_000_000_000;
    const token = createSessionToken(sessionSecret, 60, now);

    assert.equal(verifySessionCookie(`kcc_admin_session=${token}`, sessionSecret, now + 59_000), true);
    assert.equal(verifySessionCookie(`kcc_admin_session=${token}x`, sessionSecret, now), false);
    assert.equal(verifySessionCookie(`kcc_admin_session=${token}`, sessionSecret, now + 60_000), false);
});

test("login remains public and the POS fails closed before secrets are configured", async () => {
    const previousEnvironment = {
        username: process.env.KCC_ADMIN_USERNAME,
        passwordHash: process.env.KCC_ADMIN_PASSWORD_HASH,
        sessionSecret: process.env.KCC_SESSION_SECRET
    };
    delete process.env.KCC_ADMIN_USERNAME;
    delete process.env.KCC_ADMIN_PASSWORD_HASH;
    delete process.env.KCC_SESSION_SECRET;

    try {
        const loginPage = await protectPos(new Request("https://pos.example/login.html"));
        assert.equal(loginPage.headers.get("x-middleware-next"), "1");

        const dashboard = await protectPos(new Request("https://pos.example/"));
        assert.equal(dashboard.status, 503);
    } finally {
        if (previousEnvironment.username === undefined) delete process.env.KCC_ADMIN_USERNAME;
        else process.env.KCC_ADMIN_USERNAME = previousEnvironment.username;
        if (previousEnvironment.passwordHash === undefined) delete process.env.KCC_ADMIN_PASSWORD_HASH;
        else process.env.KCC_ADMIN_PASSWORD_HASH = previousEnvironment.passwordHash;
        if (previousEnvironment.sessionSecret === undefined) delete process.env.KCC_SESSION_SECRET;
        else process.env.KCC_SESSION_SECRET = previousEnvironment.sessionSecret;
    }
});

test("login endpoint returns a signed HttpOnly session only for valid credentials", async () => {
    const previousEnvironment = {
        username: process.env.KCC_ADMIN_USERNAME,
        passwordHash: process.env.KCC_ADMIN_PASSWORD_HASH,
        sessionSecret: process.env.KCC_SESSION_SECRET,
        nodeEnv: process.env.NODE_ENV
    };
    process.env.KCC_ADMIN_USERNAME = "test-admin";
    process.env.KCC_ADMIN_PASSWORD_HASH = createPasswordHash(testPassword);
    process.env.KCC_SESSION_SECRET = sessionSecret;
    process.env.NODE_ENV = "production";

    try {
        const invalidResponse = makeResponse();
        login({
            method: "POST",
            body: { username: "test-admin", password: randomBytes(32).toString("base64url"), remember: false }
        }, invalidResponse);
        assert.equal(invalidResponse.statusCode, 401);
        assert.equal(invalidResponse.headers["Set-Cookie"], undefined);

        const validResponse = makeResponse();
        login({
            method: "POST",
            body: { username: "test-admin", password: testPassword, remember: true }
        }, validResponse);
        assert.equal(validResponse.statusCode, 200);
        assert.match(validResponse.headers["Set-Cookie"], /HttpOnly; SameSite=Strict; Secure; Max-Age=2592000/);
        assert.equal(validResponse.body.success, true);

        const unauthenticatedPage = await protectPos(new Request("https://pos.example/"));
        assert.equal(unauthenticatedPage.status, 303);
        assert.equal(unauthenticatedPage.headers.get("location"), "https://pos.example/login.html");

        const unauthenticatedScript = await protectPos(new Request("https://pos.example/script.js"));
        assert.equal(unauthenticatedScript.status, 401);

        const sessionCookie = validResponse.headers["Set-Cookie"].split(";")[0];
        const authenticatedScript = await protectPos(new Request("https://pos.example/script.js", {
            headers: { cookie: sessionCookie }
        }));
        assert.equal(authenticatedScript.headers.get("x-middleware-next"), "1");
    } finally {
        if (previousEnvironment.username === undefined) delete process.env.KCC_ADMIN_USERNAME;
        else process.env.KCC_ADMIN_USERNAME = previousEnvironment.username;
        if (previousEnvironment.passwordHash === undefined) delete process.env.KCC_ADMIN_PASSWORD_HASH;
        else process.env.KCC_ADMIN_PASSWORD_HASH = previousEnvironment.passwordHash;
        if (previousEnvironment.sessionSecret === undefined) delete process.env.KCC_SESSION_SECRET;
        else process.env.KCC_SESSION_SECRET = previousEnvironment.sessionSecret;
        if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnvironment.nodeEnv;
    }
});
