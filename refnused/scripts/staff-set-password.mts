/**
 * Sets a staff member's password. Use it for the first owner; after that,
 * staff set their own at /admin/security.
 *
 *   npm run staff:set-password -- --email jo@example.co.uk
 *
 * The password is asked for at the prompt (or read from stdin) rather than
 * passed as an argument, so it never lands in shell history.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { PASSWORD_MIN_LENGTH } from "@refnused/database/auth/password";
import { setStaffPasswordByEmail, StaffPasswordError } from "@/auth/staff-password";
import { createDatabase } from "@refnused/database/db/client";

const { values } = parseArgs({ options: { email: { type: "string" } } });

if (!values.email) {
  console.error("Usage: npm run staff:set-password -- --email <email>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/** Reads one line without echoing it to the terminal. */
async function readHidden(prompt: string) {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) return line;
    return "";
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise<string>((resolve) => {
    let value = "";
    const finish = (result: string) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(result);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          finish("");
          process.exit(130);
        }
        if (char === "\r" || char === "\n") return finish(value);
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

const password = await readHidden(`New password (at least ${PASSWORD_MIN_LENGTH} characters): `);
if (process.stdin.isTTY && password !== (await readHidden("Repeat the password: "))) {
  console.error("The passwords don't match.");
  process.exit(1);
}

const { db, close } = createDatabase(process.env.DATABASE_URL, { max: 1 });
try {
  await setStaffPasswordByEmail(db, { email: values.email, password });
  console.log(`Password set for ${values.email}. Any existing sessions were signed out.`);
  console.log("They can sign in at /admin/sign-in, then complete two-step verification.");
} catch (error) {
  if (error instanceof StaffPasswordError) console.error(error.message);
  else if (error instanceof Error && error.name === "ZodError")
    console.error(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  else console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
