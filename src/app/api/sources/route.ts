import { NextResponse } from 'next/server';
import { ensureSeeded } from '@/lib/bootstrap';
import { saveSources } from '@/lib/store';
import type { Section, SourceConfig, SourceKind, SourceTier } from '@/lib/types';
import { SECTIONS } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: SourceKind[] = ['rss', 'html', 'gnews'];

export async function GET() {
  const { sources } = await ensureSeeded();
  return NextResponse.json({ sources });
}

export async function POST(req: Request) {
  let body: { sources?: unknown };
  try {
    body = (await req.json()) as { sources?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  if (!Array.isArray(body.sources)) {
    return NextResponse.json(
      { error: 'Expected a sources array.' },
      { status: 400 },
    );
  }

  const seen = new Set<string>();
  const clean: SourceConfig[] = [];
  for (const entry of body.sources as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const s = entry as Partial<SourceConfig>;
    const url = typeof s.url === 'string' ? s.url.trim() : '';
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (!url || !name) continue;
    const id = typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID();
    if (seen.has(id)) continue;
    seen.add(id);
    clean.push({
      id,
      name,
      kind: KINDS.includes(s.kind as SourceKind) ? (s.kind as SourceKind) : 'rss',
      url,
      enabled: s.enabled !== false,
      tier: ([0, 1, 2, 3] as SourceTier[]).includes(s.tier as SourceTier)
        ? (s.tier as SourceTier)
        : 0,
      requires: typeof s.requires === 'string' ? s.requires : undefined,
      sectionHint: SECTIONS.includes(s.sectionHint as Section)
        ? (s.sectionHint as Section)
        : undefined,
      authority:
        typeof s.authority === 'number' && Number.isFinite(s.authority)
          ? Math.max(0, Math.min(1, s.authority))
          : 0.5,
      builtin: s.builtin === true,
      homepage: typeof s.homepage === 'string' ? s.homepage : undefined,
    });
  }

  await saveSources(clean);
  return NextResponse.json({ sources: clean });
}
