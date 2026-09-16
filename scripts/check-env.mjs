#!/usr/bin/env node
/**
 * Bob preflight. Verifies every credential end to end with a real call, because
 * a key that is merely present in .env.local tells you nothing about whether it
 * works.
 *
 *   npm run check
 *
 * The Anthropic check makes one small real API request, so it costs a fraction
 * of a cent. That is the point: it is the only way to know the LLM path works.
 */

import fs from 'node:fs';
import path from 'node:path';

// Minimal .env.local reader. Next.js loads these for the app, but this script
// runs outside Next, so it has to do it itself.
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '').trim();
  }
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

// --- Anthropic -------------------------------------------------------------

async function checkAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return record(
      'Anthropic',
      null,
      'Not set. Bob falls back to the heuristic scorer, which works but writes blunter copy.',
    );
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      }),
    });

    const body = await res.json();
    if (!res.ok) {
      return record(
        'Anthropic',
        false,
        `${res.status} ${body?.error?.type ?? ''}: ${body?.error?.message ?? 'unknown error'}`,
      );
    }

    const text = (body.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    record('Anthropic', true, `claude-opus-5 responded: "${text.slice(0, 40)}"`);
  } catch (err) {
    record('Anthropic', false, err.message);
  }
}

// --- Resend ----------------------------------------------------------------

async function checkResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return record(
      'Resend',
      null,
      'Not set. Sending writes an HTML preview to .data/previews/ instead.',
    );
  }

  try {
    // Listing domains validates the key without sending anything.
    const res = await fetch('https://api.resend.com/domains', {
      headers: { authorization: `Bearer ${key}` },
    });
    const body = await res.json();

    if (!res.ok) {
      return record('Resend', false, `${res.status}: ${body?.message ?? 'key rejected'}`);
    }

    const domains = body?.data ?? [];
    const verified = domains.filter((d) => d.status === 'verified');

    if (!verified.length) {
      return record(
        'Resend',
        true,
        `Key is valid, but no verified domain (${domains.length} domain(s) on the account). Resend will only deliver to the address that owns the account, and MAIL_FROM must stay onboarding@resend.dev. Use "Send a test to" with your own address, or verify a domain to reach the real list.`,
      );
    }

    record(
      'Resend',
      true,
      `Key is valid. Verified domain(s): ${verified.map((d) => d.name).join(', ')}. Set MAIL_FROM to an address on one of those to send to the real list.`,
    );
  } catch (err) {
    record('Resend', false, err.message);
  }
}

// --- Supabase --------------------------------------------------------------

const TABLES = [
  'bob_runs',
  'bob_items',
  'bob_directives',
  'bob_recipients',
  'bob_sources',
  'bob_issues',
  'bob_seen_urls',
];

async function checkSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return record(
      'Supabase',
      null,
      'Not set. Bob stores to JSON files under .data/, which is fine locally but loses everything on a serverless deploy.',
    );
  }

  const missing = [];
  for (const table of TABLES) {
    try {
      const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      });
      if (res.status === 404 || res.status === 400) missing.push(table);
      else if (!res.ok) {
        const body = await res.text();
        return record('Supabase', false, `${table}: ${res.status} ${body.slice(0, 120)}`);
      }
    } catch (err) {
      return record('Supabase', false, err.message);
    }
  }

  if (missing.length === TABLES.length) {
    return record(
      'Supabase',
      false,
      'Connected, but no tables. Open the Supabase SQL editor and run supabase/schema.sql.',
    );
  }
  if (missing.length) {
    return record('Supabase', false, `Missing tables: ${missing.join(', ')}. Re-run supabase/schema.sql.`);
  }

  // A write test, because read access proves nothing about whether Bob can save.
  try {
    const probe = `bob-preflight-${Date.now()}`;
    const write = await fetch(`${url}/rest/v1/bob_seen_urls`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ url: probe }]),
    });
    if (!write.ok) {
      const body = await write.text();
      return record(
        'Supabase',
        false,
        `All 7 tables exist but writes are refused (${write.status}). If RLS is on, Bob needs SUPABASE_SERVICE_ROLE_KEY. ${body.slice(0, 120)}`,
      );
    }
    await fetch(`${url}/rest/v1/bob_seen_urls?url=eq.${probe}`, {
      method: 'DELETE',
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    record('Supabase', true, 'All 7 tables exist, and a write round-trip succeeded.');
  } catch (err) {
    record('Supabase', false, err.message);
  }
}

// --- run -------------------------------------------------------------------

await Promise.all([checkAnthropic(), checkResend(), checkSupabase()]);

const icon = (ok) => (ok === true ? 'OK  ' : ok === false ? 'FAIL' : 'SKIP');
console.log('\nBob preflight\n');
for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  [${icon(r.ok)}] ${r.name}`);
  console.log(`         ${r.detail}\n`);
}

const failed = results.filter((r) => r.ok === false);
if (failed.length) {
  console.log(`${failed.length} check(s) failed. Bob will still run, using the fallback for each.\n`);
  process.exit(1);
}
console.log('Everything configured is working.\n');
