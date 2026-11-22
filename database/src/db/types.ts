import type { MySqlDatabase } from "drizzle-orm/mysql-core";
import type { MySql2PreparedQueryHKT, MySql2QueryResultHKT } from "drizzle-orm/mysql2";

import type * as schema from "./schema";

/**
 * The Drizzle MySQL database with our schema (mysql2 driver), in the apps
 * and in tests. Services take this so they can be tested against a real
 * database.
 */
export type AppDb = MySqlDatabase<MySql2QueryResultHKT, MySql2PreparedQueryHKT, typeof schema>;
