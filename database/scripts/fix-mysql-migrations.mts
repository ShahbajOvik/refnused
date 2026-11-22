/**
 * Repairs a drizzle-kit (0.31) bug in generated MySQL migrations: for an
 * index mixing columns and expressions, it splits the whole list on every
 * comma (including commas inside the expression) and backtick-wraps each
 * piece, e.g.
 *   UNIQUE(`model_id`,`(coalesce(`storage_gb``,` -1))`,`colour`)
 * This turns it back into
 *   UNIQUE(`model_id`,(coalesce(`storage_gb`, -1)),`colour`)
 * Runs after `drizzle-kit generate` (npm run db:generate). Idempotent.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../drizzle/", import.meta.url));

/**
 * Finds each mangled expression part: it starts with "`(" at the start of
 * the list or after a comma, and ends where its parentheses balance, just
 * before a closing "`". Inside it, every "`,`" is a comma drizzle-kit split
 * on, so it becomes "," again.
 */
function repair(list: string): string {
  let out = "";
  let i = 0;
  while (i < list.length) {
    const startsPart = i === 0 || list[i - 1] === ",";
    if (startsPart && list.startsWith("`(", i)) {
      let depth = 0;
      let quote = false;
      let end = -1;
      for (let j = i + 1; j < list.length; j++) {
        const ch = list[j];
        if (ch === "'") quote = !quote;
        if (quote) continue;
        if (ch === "(") depth++;
        if (ch === ")" && --depth === 0 && list[j + 1] === "`") {
          end = j;
          break;
        }
      }
      if (end > 0) {
        out += list
          .slice(i + 1, end + 1)
          .split("`,`")
          .join(",");
        i = end + 2; // skip the closing backtick
        continue;
      }
    }
    out += list[i];
    i++;
  }
  return out;
}

let fixed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
  const path = `${dir}${file}`;
  const sql = readFileSync(path, "utf8");
  const out = sql.replace(/(UNIQUE|INDEX)\((.*)\)(,?)$/gm, (match, kind, list, comma) => {
    const repaired = repair(list);
    if (repaired === list) return match;
    fixed++;
    return `${kind}(${repaired})${comma}`;
  });
  if (out !== sql) writeFileSync(path, out);
}
console.log(`fix-mysql-migrations: repaired ${fixed} index definition(s)`);
