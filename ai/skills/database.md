# Database Skill — Neon Postgres

Your app has a Neon Postgres database. DATABASE_URL is available as process.env.DATABASE_URL.

## Standard query pattern (use EXACTLY this):

```typescript
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL!)

// SELECT
const rows = await sql`SELECT * FROM users WHERE id = ${userId}`

// INSERT
await sql`INSERT INTO users (name, email) VALUES (${name}, ${email})`

// CREATE TABLE (run once at startup)
await sql`CREATE TABLE IF NOT EXISTS todos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`
```

## Rules:
- ALWAYS use tagged template literals (NOT string concatenation — SQL injection risk)
- ALWAYS create tables with CREATE TABLE IF NOT EXISTS at app startup
- NEVER hardcode the connection string — always use process.env.DATABASE_URL
- Use SERIAL PRIMARY KEY for auto-increment IDs
- Use TIMESTAMPTZ for timestamps
- All queries are async/await
