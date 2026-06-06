import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const globalForPool = globalThis as unknown as { __dsoPool?: Pool }

export const pool =
  globalForPool.__dsoPool ??
  new Pool({ connectionString: process.env.DATABASE_URL })

if (process.env.NODE_ENV !== "production") globalForPool.__dsoPool = pool

export const db = drizzle(pool, { schema })
