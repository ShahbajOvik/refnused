import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadRootEnv } from "./root-env";

const KEYS = ["RE_A", "RE_B", "RE_C", "RE_D"];

describe("loadRootEnv", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "root-env-"));
    for (const k of KEYS) delete process.env[k];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const k of KEYS) delete process.env[k];
  });

  it("loads the files in Next.js order, earlier files winning", () => {
    writeFileSync(join(dir, ".env.development.local"), "RE_A=dev-local\n");
    writeFileSync(join(dir, ".env.local"), "RE_A=local\nRE_B=local\n");
    writeFileSync(join(dir, ".env"), "RE_B=base\nRE_C='quoted value'\n");
    loadRootEnv(dir, "development");
    expect(process.env.RE_A).toBe("dev-local");
    expect(process.env.RE_B).toBe("local");
    expect(process.env.RE_C).toBe("quoted value");
  });

  it("never overrides values already set (shell, Vercel, CI)", () => {
    process.env.RE_A = "from-platform";
    writeFileSync(join(dir, ".env.local"), "RE_A=local\n");
    loadRootEnv(dir, "production");
    expect(process.env.RE_A).toBe("from-platform");
  });

  it("skips .env.local in test mode and copes with no files", () => {
    writeFileSync(join(dir, ".env.local"), "RE_D=local\n");
    loadRootEnv(dir, "test");
    expect(process.env.RE_D).toBeUndefined();
  });
});
