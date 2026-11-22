/**
 * A local MySQL 8 for development, with no system install or Docker:
 *
 *   npm run db:dev-server            (then, once: npm run db:migrate && npm run db:seed -- --demo)
 *
 * Uses the official MySQL binary that mysql-memory-server downloads for the
 * tests (cached in the OS temp folder), with a data folder that persists in
 * .mysql-dev/ at the repo root (git-ignored). Listens on 127.0.0.1 only, as
 * root without a password: for this machine, never for a server.
 *
 * DATABASE_URL=mysql://root@127.0.0.1:3306/refurbednused
 * Port: first argument or DEV_MYSQL_PORT. Stop with Ctrl+C.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";
import { createDB } from "mysql-memory-server";

const port = Number(process.argv[2] ?? process.env.DEV_MYSQL_PORT ?? 3306);
const DATABASE = "refurbednused";
const root = fileURLToPath(new URL("../../.mysql-dev/", import.meta.url));
const dataDir = join(root, "data");
const binariesDir = join(tmpdir(), "mysqlmsn", "binaries");

function findMysqld() {
  if (!existsSync(binariesDir)) return null;
  const versions = readdirSync(binariesDir)
    .filter((v) => v.startsWith("8."))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const version of versions.reverse()) {
    const bin = join(binariesDir, version, "mysql", "bin", "mysqld");
    if (existsSync(bin)) return bin;
  }
  return null;
}

let mysqld = findMysqld();
if (!mysqld) {
  // Not downloaded yet (or the temp folder was cleared): let
  // mysql-memory-server fetch it once, then use it directly.
  console.log("Downloading MySQL 8 (once)…");
  const server = await createDB({ version: "8.0.x", downloadBinaryOnce: true, logLevel: "ERROR" });
  await server.stop();
  mysqld = findMysqld();
  if (!mysqld) throw new Error(`No mysqld found in ${binariesDir}`);
}
const baseDir = join(mysqld, "..", "..");

mkdirSync(root, { recursive: true });
if (!existsSync(dataDir)) {
  console.log(`Creating a new MySQL data folder in ${dataDir}`);
  const init = spawnSync(
    mysqld,
    ["--no-defaults", "--initialize-insecure", `--basedir=${baseDir}`, `--datadir=${dataDir}`],
    { stdio: "inherit" },
  );
  if (init.status !== 0) process.exit(init.status ?? 1);
}

const server = spawn(
  mysqld,
  [
    "--no-defaults",
    `--basedir=${baseDir}`,
    `--datadir=${dataDir}`,
    `--port=${port}`,
    "--bind-address=127.0.0.1",
    `--socket=${join(tmpdir(), `refnused-mysql-${port}.sock`)}`,
    "--mysqlx=OFF",
    "--character-set-server=utf8mb4",
    "--collation-server=utf8mb4_0900_ai_ci",
    `--log-error=${join(root, "error.log")}`,
  ],
  { stdio: "inherit" },
);
server.on("exit", (code) => {
  console.log(`MySQL stopped (exit ${code}). See .mysql-dev/error.log if that was unexpected.`);
  process.exit(code ?? 0);
});

// Wait until it accepts connections, then make sure the database exists.
const deadline = Date.now() + 60_000;
for (;;) {
  try {
    const conn = await mysql.createConnection({ host: "127.0.0.1", port, user: "root" });
    await conn.query(
      `create database if not exists \`${DATABASE}\` character set utf8mb4 collate utf8mb4_0900_ai_ci`,
    );
    await conn.end();
    break;
  } catch (error) {
    if (Date.now() > deadline) {
      console.error("MySQL didn't start in time:", error);
      server.kill("SIGTERM");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}
console.log(`MySQL ready: DATABASE_URL=mysql://root@127.0.0.1:${port}/${DATABASE}`);

const stop = () => server.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
