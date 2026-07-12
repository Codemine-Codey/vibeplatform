-- Add Neon Postgres columns to projects table.
-- The connection string (DATABASE_URL) is stored encrypted in project_secrets
-- (name='NEON_DATABASE_URL') — NOT as a column — because it contains credentials.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS neon_project_id text,
  ADD COLUMN IF NOT EXISTS neon_database_name text,
  ADD COLUMN IF NOT EXISTS neon_host text,
  ADD COLUMN IF NOT EXISTS neon_provisioned boolean DEFAULT false;
