import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/api/schema.ts",
  out: "./drizzle",
});
