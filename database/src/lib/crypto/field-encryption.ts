import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level field encryption (AES-256-GCM).
 *
 * Payload format: `<keyId>.<iv>.<authTag>.<ciphertext>` (base64url parts).
 * - A fresh 96-bit IV per value, so equal inputs give different outputs.
 * - `context` (e.g. "payouts.sort_code") is bound as additional
 *   authenticated data, so a ciphertext copied into another column fails.
 * - The key id lets us rotate: encrypt with the first (active) key and
 *   decrypt with whichever key the payload names.
 *
 * Keys come from FIELD_ENCRYPTION_KEYS: "k2:<base64>,k1:<base64>", 32 bytes
 * each, active key first. Generate one with `npm run key:generate`.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;

export type FieldCipher = {
  encrypt(plaintext: string, context: string): string;
  decrypt(payload: string, context: string): string;
};

export class FieldEncryptionError extends Error {
  override name = "FieldEncryptionError";
}

export function parseKeyring(value: string | undefined): Map<string, Buffer> {
  if (!value?.trim()) {
    throw new FieldEncryptionError("FIELD_ENCRYPTION_KEYS is not set");
  }
  const keys = new Map<string, Buffer>();
  for (const entry of value.split(",")) {
    const [id, encoded, ...rest] = entry.trim().split(":");
    if (!id || !encoded || rest.length > 0 || !KEY_ID_PATTERN.test(id)) {
      throw new FieldEncryptionError('FIELD_ENCRYPTION_KEYS entries must look like "k1:<base64>"');
    }
    const key = Buffer.from(encoded, "base64");
    if (key.length !== KEY_BYTES) {
      throw new FieldEncryptionError(`Encryption key "${id}" must be ${KEY_BYTES} bytes`);
    }
    if (keys.has(id)) {
      throw new FieldEncryptionError(`Duplicate encryption key id "${id}"`);
    }
    keys.set(id, key);
  }
  return keys;
}

export function createFieldCipher(keyring: Map<string, Buffer>): FieldCipher {
  const [activeId] = keyring.keys();
  if (!activeId) throw new FieldEncryptionError("Keyring is empty");
  const activeKey = keyring.get(activeId)!;

  return {
    encrypt(plaintext, context) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, activeKey, iv);
      cipher.setAAD(Buffer.from(context, "utf8"));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [activeId, iv, tag, ciphertext]
        .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
        .join(".");
    },

    decrypt(payload, context) {
      const parts = payload.split(".");
      if (parts.length !== 4) throw new FieldEncryptionError("Malformed encrypted value");
      const [keyId, iv, tag, ciphertext] = parts as [string, string, string, string];
      const key = keyring.get(keyId);
      if (!key) throw new FieldEncryptionError(`Unknown encryption key "${keyId}"`);
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64url"));
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(Buffer.from(tag, "base64url"));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        // Don't leak why (wrong key, wrong context, tampering).
        throw new FieldEncryptionError("Could not decrypt value");
      }
    },
  };
}

let cached: FieldCipher | undefined;

/** Cipher using FIELD_ENCRYPTION_KEYS from the environment. */
export function getFieldCipher(): FieldCipher {
  cached ??= createFieldCipher(parseKeyring(process.env.FIELD_ENCRYPTION_KEYS));
  return cached;
}
