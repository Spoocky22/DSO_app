import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is missing. Configure .env.local locally, or add DATABASE_URL in your hosting environment such as Vercel.",
  )
}

const globalForPool = globalThis as unknown as { __dsoPool?: Pool }

export const pool =
  globalForPool.__dsoPool ??
  new Pool({ connectionString })

if (process.env.NODE_ENV !== "production") globalForPool.__dsoPool = pool

export const db = drizzle(pool, { schema })
