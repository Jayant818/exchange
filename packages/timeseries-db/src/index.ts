import pg from "pg";
import "dotenv/config";

const globalForPool = globalThis as any;

const pool =
  globalForPool.pool ||
  new pg.Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5433,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "password",
    database: process.env.DB_NAME || "exchange",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.pool = pool;
}

export { pool };
