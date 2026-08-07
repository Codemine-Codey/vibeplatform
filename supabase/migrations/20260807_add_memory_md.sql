-- Add memory_md column for cross-session AI project memory.
-- Stores the .codey/memory.md content so the AI remembers project decisions
-- across sessions without needing the sandbox to be warm.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS memory_md text;
