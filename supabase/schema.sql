-- ============================================================================
-- Bob's schema. Run this once in the Supabase SQL editor.
--
-- Every table stores its record as jsonb plus the few columns worth indexing.
-- That keeps the database aligned with src/lib/types.ts without a migration
-- every time a field is added, which is the right trade for a demo-stage app.
--
-- Tables are prefixed bob_ because this Supabase project may be shared with
-- other work.
-- ============================================================================

create table if not exists bob_runs (
  id          text primary key,
  started_at  timestamptz not null default now(),
  data        jsonb       not null
);
create index if not exists bob_runs_started_at_idx on bob_runs (started_at desc);

create table if not exists bob_items (
  id      text primary key,
  run_id  text not null,
  score   int  not null default 0,
  data    jsonb not null
);
create index if not exists bob_items_run_id_idx on bob_items (run_id);
create index if not exists bob_items_score_idx   on bob_items (score desc);

create table if not exists bob_directives (
  id          text primary key,
  created_at  timestamptz not null default now(),
  persistent  boolean     not null default false,
  data        jsonb       not null
);
create index if not exists bob_directives_persistent_idx on bob_directives (persistent);

create table if not exists bob_recipients (
  id    text primary key,
  data  jsonb not null
);

create table if not exists bob_sources (
  id    text primary key,
  data  jsonb not null
);

create table if not exists bob_issues (
  id          text primary key,
  created_at  timestamptz not null default now(),
  data        jsonb       not null
);
create index if not exists bob_issues_created_at_idx on bob_issues (created_at desc);

-- Canonical URLs Bob has already surfaced. Without this every run re-shows the
-- same Entrevestor story and the board stops being trustworthy.
create table if not exists bob_seen_urls (
  url      text primary key,
  seen_at  timestamptz not null default now()
);
create index if not exists bob_seen_urls_seen_at_idx on bob_seen_urls (seen_at desc);

-- ============================================================================
-- SECURITY NOTE, READ THIS
--
-- Bob talks to Supabase with the PUBLISHABLE (anon) key, which ships to the
-- browser and is visible to anyone who opens the deployed app. RLS is off, so
-- these tables are readable AND WRITABLE by anyone who finds the project URL.
--
-- That is a deliberate trade for a demo. Before this holds anything that
-- matters, and certainly before it holds a real subscriber list, do one of:
--
--   1. Enable RLS on every table above, add no public policies, and move Bob's
--      writes to the service-role key held only in a server env var. Bob is
--      entirely server-side already, so this costs nothing in the client.
--   2. Or keep RLS off and treat the project as public scratch space.
--
-- Option 1 is the right answer the moment real recipient emails go in here.
-- ============================================================================
