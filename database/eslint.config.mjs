import { defineConfig, globalIgnores } from "eslint/config";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([...nextTs, prettier, globalIgnores(["drizzle/**"])]);

export default eslintConfig;
