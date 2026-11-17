// @vitest-environment node
/**
 * Staff passkeys as a second factor. The cryptographic verification is
 * SimpleWebAuthn's job (and needs a real authenticator), so it is mocked;
 * everything around it (challenges, ownership, counters, lockout, session
 * rotation) runs for real against Postgres.
 */
import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const verifyRegistrationResponse = vi.fn();
const verifyAuthenticationResponse = vi.fn();
vi.mock("@simplewebauthn/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@simplewebauthn/server")>()),
  verifyRegistrationResponse: (...args: unknown[]) => verifyRegistrationResponse(...args),
  verifyAuthenticationResponse: (...args: unknown[]) => verifyAuthenticationResponse(...args),
}));

const {
  passkeyAuthenticationOptions,
  passkeyRegistrationOptions,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} = await import("@/auth/staff-passkeys");
const { createStaff } = await import("@/auth/staff-admin");
const { loadStaffSession } = await import("@/auth/staff-service");
const { evaluateStaffSession } = await import("@/auth/staff-session");
const { staffPasskeys, staffSessions } = await import("@/db/schema");
const { createTestDb } = await import("@/test/db");

import type { AppDb } from "@/db/types";

const rp = { name: "RefurbednUsed admin", id: "localhost", origin: "http://localhost:3000" };
let db: AppDb;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close?.());
beforeEach(() => {
  verifyRegistrationResponse.mockReset();
  verifyAuthenticationResponse.mockReset();
});

async function staffWithSession() {
  const { id } = await createStaff(
    db,
    { email: `pk-${randomBytes(3).toString("hex")}@example.co.uk`, name: "Pat", role: "staff" },
    { type: "system" },
  );
  const sessionToken = randomBytes(16).toString("hex");
  await db.insert(staffSessions).values({
    sessionToken,
    userId: id,
    expires: new Date(Date.now() + 3_600_000),
  });
  return { id, sessionToken };
}

const load = async (token: string) => (await loadStaffSession(db, token))!;

const fakeRegistration = (credentialId: Uint8Array) => ({
  verified: true,
  registrationInfo: {
    credentialID: credentialId,
    credentialPublicKey: new Uint8Array([1, 2, 3]),
    counter: 0,
    credentialDeviceType: "multiDevice",
    credentialBackedUp: true,
  },
});

const response = (id: string) =>
  ({
    id,
    rawId: id,
    type: "public-key",
    response: { clientDataJSON: "x", transports: ["internal"] },
  }) as never;

async function registerPasskey(token: string) {
  const credentialId = randomBytes(16);
  await passkeyRegistrationOptions(db, { record: await load(token), rp });
  verifyRegistrationResponse.mockResolvedValueOnce(fakeRegistration(credentialId));
  const result = await verifyPasskeyRegistration(db, {
    record: await load(token),
    response: response("ignored"),
    name: "Work laptop",
    rp,
  });
  return { result, credentialId: Buffer.from(credentialId).toString("base64url") };
}

describe("staff passkey registration", () => {
  it("stores a single-use challenge and enrols the passkey as the second factor", async () => {
    const { id, sessionToken } = await staffWithSession();
    const options = await passkeyRegistrationOptions(db, { record: await load(sessionToken), rp });
    expect(options?.rp).toMatchObject({ id: "localhost" });
    expect(options?.authenticatorSelection?.userVerification).toBe("required");

    const [session] = await db
      .select()
      .from(staffSessions)
      .where(eq(staffSessions.sessionToken, sessionToken));
    expect(session!.webauthnChallenge).toBe(options!.challenge);

    verifyRegistrationResponse.mockResolvedValueOnce(fakeRegistration(randomBytes(16)));
    const result = await verifyPasskeyRegistration(db, {
      record: await load(sessionToken),
      response: response("ignored"),
      name: "Work laptop",
      rp,
    });
    expect(result.ok).toBe(true);
    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: options!.challenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        requireUserVerification: true,
      }),
    );
    if (!result.ok || !result.session) throw new Error("expected rotated session");
    const rotated = await load(result.session.sessionToken);
    expect(evaluateStaffSession(rotated)).toBe("active");
    expect(rotated.mfaMethod).toBe("passkey");

    const saved = await db.select().from(staffPasskeys).where(eq(staffPasskeys.staffId, id));
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe("Work laptop");
  });

  it("rejects a reused or missing challenge", async () => {
    const { sessionToken } = await staffWithSession();
    const result = await verifyPasskeyRegistration(db, {
      record: await load(sessionToken),
      response: response("x"),
      name: "x",
      rp,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(verifyRegistrationResponse).not.toHaveBeenCalled();
  });
});

describe("staff passkey sign-in (second factor)", () => {
  it("verifies with the staff member's own passkey and updates the counter", async () => {
    const { sessionToken: setupToken, id } = await staffWithSession();
    const { credentialId } = await registerPasskey(setupToken);

    // New sign-in: first factor done, passkey needed.
    const token = randomBytes(16).toString("hex");
    await db
      .insert(staffSessions)
      .values({ sessionToken: token, userId: id, expires: new Date(Date.now() + 3_600_000) });
    expect(evaluateStaffSession(await load(token))).toBe("mfa_required");

    const options = await passkeyAuthenticationOptions(db, { record: await load(token), rp });
    expect(options?.allowCredentials).toHaveLength(1);

    verifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 7 },
    });
    const result = await verifyPasskeyAuthentication(db, {
      record: await load(token),
      response: response(credentialId),
      rp,
    });
    expect(result.ok).toBe(true);
    const [pk] = await db
      .select()
      .from(staffPasskeys)
      .where(eq(staffPasskeys.credentialId, credentialId));
    expect(pk!.counter).toBe(7);
    expect(pk!.lastUsedAt).not.toBeNull();
  });

  it("rejects someone else's passkey and counts it as a failed attempt", async () => {
    const victim = await staffWithSession();
    const { credentialId: victimCredential } = await registerPasskey(victim.sessionToken);

    const attacker = await staffWithSession();
    await registerPasskey(attacker.sessionToken);
    const token = randomBytes(16).toString("hex");
    await db.insert(staffSessions).values({
      sessionToken: token,
      userId: attacker.id,
      expires: new Date(Date.now() + 3_600_000),
    });

    await passkeyAuthenticationOptions(db, { record: await load(token), rp });
    const result = await verifyPasskeyAuthentication(db, {
      record: await load(token),
      response: response(victimCredential),
      rp,
    });
    expect(result).toEqual({ ok: false, reason: "invalid", attemptsLeft: 4 });
    expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
    expect((await load(token)).mfaFailedAttempts).toBe(1);
  });

  it("treats a failed signature check as a failed attempt", async () => {
    const { id, sessionToken: setupToken } = await staffWithSession();
    const { credentialId } = await registerPasskey(setupToken);
    const token = randomBytes(16).toString("hex");
    await db
      .insert(staffSessions)
      .values({ sessionToken: token, userId: id, expires: new Date(Date.now() + 3_600_000) });

    await passkeyAuthenticationOptions(db, { record: await load(token), rp });
    verifyAuthenticationResponse.mockRejectedValueOnce(new Error("bad signature"));
    const result = await verifyPasskeyAuthentication(db, {
      record: await load(token),
      response: response(credentialId),
      rp,
    });
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
  });
});
