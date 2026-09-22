import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moved connection config here: schema.prisma's datasource block
// no longer accepts a `url`. This file is used by the Prisma CLI (generate,
// migrate, studio) - the running app still builds its own adapter in
// src/lib/prisma.ts, since the CLI and the app connect independently.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
