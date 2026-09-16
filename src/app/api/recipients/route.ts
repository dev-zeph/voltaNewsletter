import { NextResponse } from 'next/server';
import { ensureSeeded } from '@/lib/bootstrap';
import { saveRecipients } from '@/lib/store';
import type { AudienceTag, Recipient } from '@/lib/types';
import { AUDIENCE_TAGS } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const { recipients } = await ensureSeeded();
  return NextResponse.json({ recipients });
}

export async function POST(req: Request) {
  let body: { recipients?: unknown };
  try {
    body = (await req.json()) as { recipients?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!Array.isArray(body.recipients)) {
    return NextResponse.json(
      { error: 'Expected a recipients array.' },
      { status: 400 },
    );
  }

  const seen = new Set<string>();
  const clean: Recipient[] = [];
  for (const entry of body.recipients as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Partial<Recipient>;
    const email = typeof r.email === 'string' ? r.email.trim() : '';
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    clean.push({
      id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(),
      email,
      name: typeof r.name === 'string' ? r.name : '',
      tags: Array.isArray(r.tags)
        ? r.tags.filter((t): t is AudienceTag =>
            AUDIENCE_TAGS.includes(t as AudienceTag),
          )
        : [],
      active: r.active !== false,
    });
  }

  await saveRecipients(clean);
  return NextResponse.json({ recipients: clean });
}
