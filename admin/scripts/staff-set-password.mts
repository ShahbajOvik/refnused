/**
 * Sets a staff member's password. Use it for the first owner; after that,
 * staff set their own at /admin/security.
 *
 *   npm run staff:set-password -- --email jo@example.co.uk
 *
 * The password is asked for at the prompt (or read from stdin) rather than
 * passed as an argument, so it never lands in shell history. Or set
 * STAFF_NEW_PASSWORD in .env.local (quoted if it has a #), then delete it.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { PASSWORD_MIN_LENGTH } from "@refnused/database/auth/password";
import { findStaffIdByEmail } from "@/auth/staff-admin";
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

/** True when the last key ended a line with \r, so a following \n is skipped. */
let pendingLineFeed = false;

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
        // Windows terminals send Enter as \r\n: the \n belongs to the line
        // just finished, not to the next prompt.
        if (char === "\n" && pendingLineFeed) {
          pendingLineFeed = false;
          continue;
        }
        pendingLineFeed = false;
        if (char === "\u0003") {
          finish("");
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          pendingLineFeed = char === "\r";
          return finish(value);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        // Ignore other control characters (arrow keys and the like).
        else if (char >= " ") value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

const { db, close } = createDatabase(process.env.DATABASE_URL, { max: 1 });

// Check the account first, so nobody types a password for nothing.
const email = values.email.trim().toLowerCase();
if (!(await findStaffIdByEmail(db, email))) {
  console.error(`No staff account has the email ${email}.`);
  console.error("See the accounts with: npm run staff:list");
  await close();
  process.exit(1);
}

// STAFF_NEW_PASSWORD (in .env.local, then delete it) skips the prompt, for
// terminals where typing at a hidden prompt doesn't work.
const fromEnv = process.env.STAFF_NEW_PASSWORD || undefined;
let password: string;
if (fromEnv) {
  password = fromEnv;
  console.log(
    `Using STAFF_NEW_PASSWORD (${password.length} characters). Delete it from your env file afterwards.`,
  );
} else {
  password = await readHidden(`New password (at least ${PASSWORD_MIN_LENGTH} characters): `);
  if (process.stdin.isTTY) {
    const repeat = await readHidden("Repeat the password: ");
    if (password !== repeat) {
      console.error(
        `The passwords don't match (${password.length} and ${repeat.length} characters). Run the command again.`,
      );
      if (repeat.length === 0) {
        console.error(
          "If you did type it, this terminal isn't passing keys to the prompt: put STAFF_NEW_PASSWORD='…' in .env.local, run this again, then delete that line.",
        );
      }
      await close();
      process.exit(1);
    }
  }
}

try {
  await setStaffPasswordByEmail(db, { email, password });
  console.log(`Password set for ${email}. Any existing sessions were signed out.`);
  console.log("They can sign in at /admin/sign-in.");
} catch (error) {
  if (error instanceof StaffPasswordError) console.error(error.message);
  else if (error instanceof Error && error.name === "ZodError")
    console.error(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  else console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
