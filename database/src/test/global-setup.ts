import { createDB } from "mysql-memory-server";
import type { TestProject } from "vitest/node";

/*
 * Vitest global setup (every package's vitest.config.mts): starts one real
 * MySQL server for the test run. createTestDb() (src/test/db.ts) gives each
 * test file its own fresh database on it. The MySQL binaries are downloaded
 * on first use and cached.
 *
 * MySQL 8.0, the oldest version we support, so nothing newer slips in.
 * Override with TEST_MYSQL_VERSION (e.g. "8.4.x").
 */
export default async function setup(project: TestProject) {
  const server = await createDB({
    version: process.env.TEST_MYSQL_VERSION ?? "8.0.x",
    dbName: "bootstrap",
    username: "root",
    logLevel: "ERROR",
    downloadBinaryOnce: true,
  });
  project.provide("mysqlUrl", `mysql://${server.username}@127.0.0.1:${server.port}/`);
  return async () => {
    await server.stop();
  };
}
