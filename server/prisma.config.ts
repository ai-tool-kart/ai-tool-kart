/*
 * Prisma CLI configuration (Prisma 7 moved the connection URL out of
 * schema.prisma and into this file).
 *
 * Read by `prisma generate` / `prisma migrate *` only — the running server
 * never imports this. It builds its own client in src/db/client.ts.
 *
 * `?? ''` rather than prisma/config's env() helper: env() throws when the
 * variable is unset, and `prisma generate` (run on every install) needs no
 * database at all. Commands that do need one fail with Prisma's own clear
 * "no datasource url" message instead.
 */

import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
})
