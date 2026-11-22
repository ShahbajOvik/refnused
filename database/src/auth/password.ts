import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

import { z } from "zod";

/*
 * Staff password hashing with scrypt, using OWASP's recommended cost
 * (N=2^16, r=8, p=2). Parameters are stored with each hash so the cost can
 * be raised later without breaking existing passwords.
 */

const COST = { N: 2 ** 16, r: 8, p: 2 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** scrypt needs 128 * N * r bytes (64 MiB here); Node's default limit is lower. */
const MAX_MEMORY = 128 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Rules for a new password. Spaces are allowed, so passphrases work. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use ${PASSWORD_MAX_LENGTH} characters or fewer`);

function deriveKey(password: string, salt: Buffer, options: ScryptOptions, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, { ...COST, maxmem: MAX_MEMORY }, KEY_LENGTH);
  const { N, r, p } = COST;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** True when `password` matches. A malformed stored hash never matches. */
export async function verifyPassword(password: string, stored: string) {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !N || !r || !p || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  if (expected.length === 0) return false;
  try {
    const key = await deriveKey(
      password,
      Buffer.from(salt, "base64url"),
      { N: Number(N), r: Number(r), p: Number(p), maxmem: MAX_MEMORY },
      expected.length,
    );
    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
