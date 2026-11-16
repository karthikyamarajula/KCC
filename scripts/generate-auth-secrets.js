import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createPasswordHash } from "../lib/auth.js";

function readHiddenPassword(prompt) {
    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
        throw new Error("Run this command in an interactive terminal so the password can be entered privately.");
    }

    return new Promise((resolve, reject) => {
        let password = "";
        const finish = (error) => {
            stdin.removeListener("data", onData);
            stdin.setRawMode(false);
            stdin.pause();
            stdout.write("\n");
            if (error) reject(error);
            else resolve(password);
        };
        const onData = chunk => {
            for (const character of chunk.toString("utf8")) {
                if (character === "\u0003") {
                    finish(new Error("Secret generation cancelled."));
                    return;
                }
                if (character === "\r" || character === "\n") {
                    finish();
                    return;
                }
                if (character === "\u007f" || character === "\b") {
                    if (password.length > 0) {
                        password = password.slice(0, -1);
                        stdout.write("\b \b");
                    }
                    continue;
                }
                if (character >= " " && character <= "~") {
                    password += character;
                    stdout.write("*");
                }
            }
        };

        stdout.write(prompt);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on("data", onData);
    });
}

try {
    const options = new Set(process.argv.slice(2));
    const password = options.has("--generate-password")
        ? randomBytes(24).toString("base64url")
        : await readHiddenPassword("Admin password (hidden): ");

    if (password.length < 8) throw new Error("Use a password with at least 8 characters; 12 or more is recommended.");
    if (!options.has("--generate-password")) {
        const confirmation = await readHiddenPassword("Confirm admin password (hidden): ");
        if (password !== confirmation) throw new Error("The passwords did not match.");
    }

    const username = process.env.KCC_ADMIN_USERNAME || "KCC";
    const passwordHash = createPasswordHash(password);
    const sessionSecret = randomBytes(32).toString("base64url");
    const environment = [
        `KCC_ADMIN_USERNAME=${username}`,
        `KCC_ADMIN_PASSWORD_HASH=${passwordHash}`,
        `KCC_SESSION_SECRET=${sessionSecret}`,
        ""
    ].join("\n");

    if (options.has("--write-local")) {
        writeFileSync(".env.local", environment, { encoding: "utf8", flag: "wx" });
        stdout.write("Saved auth environment variables to the ignored .env.local file.\n");
    } else {
        stdout.write("\nCopy these values into your deployment environment:\n");
        stdout.write(environment);
    }

    stdout.write(`Admin username: ${username}\n`);
    stdout.write(`Admin password: ${password}\n`);
    stdout.write("Keep the password and session secrets private. Do not commit them.\n");
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
