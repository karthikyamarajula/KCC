import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "kcc_admin_session";

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

export function createPasswordHash(password) {
    const salt = randomBytes(SALT_LENGTH);
    const hash = scryptSync(password, salt, HASH_LENGTH, {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024
    });
    return `scrypt$${SCRYPT_COST}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function isPasswordHashConfigured(encodedHash) {
    if (typeof encodedHash !== "string") return false;
    const parts = encodedHash.split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== String(SCRYPT_COST)) return false;

    const salt = Buffer.from(parts[2], "base64url");
    const hash = Buffer.from(parts[3], "base64url");
    return salt.length === SALT_LENGTH && hash.length === HASH_LENGTH;
}

export function verifyPasswordHash(password, encodedHash) {
    if (typeof password !== "string" || password.length > 256 || !isPasswordHashConfigured(encodedHash)) {
        return false;
    }

    const [, , saltValue, hashValue] = encodedHash.split("$");
    const salt = Buffer.from(saltValue, "base64url");
    const expectedHash = Buffer.from(hashValue, "base64url");
    const actualHash = scryptSync(password, salt, HASH_LENGTH, {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024
    });

    return timingSafeEqual(actualHash, expectedHash);
}

export function hasAuthConfiguration(environment = process.env) {
    return Boolean(
        environment.KCC_ADMIN_USERNAME
        && environment.KCC_ADMIN_USERNAME.length <= 128
        && isPasswordHashConfigured(environment.KCC_ADMIN_PASSWORD_HASH)
        && typeof environment.KCC_SESSION_SECRET === "string"
        && environment.KCC_SESSION_SECRET.length >= 32
    );
}

export function createSessionToken(secret, maxAgeSeconds, now = Date.now()) {
    const payload = `v1.${Math.floor(now / 1000) + maxAgeSeconds}.${randomBytes(16).toString("base64url")}`;
    const signature = createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
    if (typeof token !== "string" || typeof secret !== "string" || secret.length < 32) return false;

    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(parts[2]) || !/^[A-Za-z0-9_-]+$/.test(parts[3])) return false;

    const expiresAt = Number(parts[1]) * 1000;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

    const payload = parts.slice(0, 3).join(".");
    const expectedSignature = createHmac("sha256", secret).update(payload).digest();
    const suppliedSignature = Buffer.from(parts[3], "base64url");
    return suppliedSignature.length === expectedSignature.length
        && timingSafeEqual(expectedSignature, suppliedSignature);
}

export function verifySessionCookie(cookieHeader, secret, now = Date.now()) {
    if (typeof cookieHeader !== "string") return false;

    const sessionCookie = cookieHeader.split(";").map(value => value.trim())
        .find(value => value.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!sessionCookie) return false;

    return verifySessionToken(sessionCookie.slice(SESSION_COOKIE_NAME.length + 1), secret, now);
}
