-- Paste this whole file into the Supabase SQL editor and press Run.
--
-- Bob talks to these tables from server code only, so RLS is not protecting
-- anything Bob does, it is only blocking it. Turning it off is the quick fix.
--
-- TRADE-OFF, stated plainly: with RLS off and the publishable key in a public
-- repo, anyone who finds the project URL can read AND WRITE these seven tables.
-- That is acceptable for a demo with seed data. It is not acceptable once real
-- Volta subscriber emails are in bob_recipients. The permanent fix is the
-- opposite of this file: leave RLS on and give Bob SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS from the server and keeps the tables private.

alter table bob_runs       disable row level security;
alter table bob_items      disable row level security;
alter table bob_directives disable row level security;
alter table bob_recipients disable row level security;
alter table bob_sources    disable row level security;
alter table bob_issues     disable row level security;
alter table bob_seen_urls  disable row level security;
