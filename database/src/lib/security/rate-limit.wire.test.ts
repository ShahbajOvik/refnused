// @vitest-environment node
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabase } from "../../db/client";
import type { AppDb } from "../../db/types";
import { createTestDb } from "../../test/db";
import { consumeRateLimit } from "./rate-limit";

/*
 * The other database tests use PGlite's in-process driver. Production uses
 * postgres.js over the Postgres wire protocol, which behaves differently
 * (Drizzle's postgres.js driver doesn't serialise Date parameters in raw
 * sql). This runs the rate limiter through postgres.js against a socket
 * server, as production does.
 */

let server: PGLiteSocketServer;
let closePglite: () => Promise<void>;
let db: AppDb;
let closeClient: () => Promise<void>;

beforeAll(async () => {
  const test = await createTestDb();
  closePglite = test.close;
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  server = new PGLiteSocketServer({ db: test.client, port, host: "127.0.0.1" });
  await server.start();
  ({ db, close: closeClient } = createDatabase(`postgres://postgres@127.0.0.1:${port}/postgres`, {
    max: 1,
  }));
});

afterAll(async () => {
  await closeClient?.();
  await server?.stop();
  await closePglite?.();
});

describe("rate limiting over postgres.js", () => {
  it("counts within a window and starts a new one after it", async () => {
    const key = `wire-${Date.now()}`;
    const at = new Date("2026-11-22T10:00:00Z");
    const first = await consumeRateLimit(db, { key, limit: 2, windowSeconds: 60, now: at });
    const second = await consumeRateLimit(db, { key, limit: 2, windowSeconds: 60, now: at });
    const third = await consumeRateLimit(db, { key, limit: 2, windowSeconds: 60, now: at });
    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);

    const later = new Date(at.getTime() + 61_000);
    expect(
      (await consumeRateLimit(db, { key, limit: 2, windowSeconds: 60, now: later })).allowed,
    ).toBe(true);
  });
});
