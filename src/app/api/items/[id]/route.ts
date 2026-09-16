import { NextResponse } from 'next/server';
import { updateItem } from '@/lib/store';
import type { AudienceTag, Decision, Item, Section } from '@/lib/types';
import { AUDIENCE_TAGS, SECTIONS } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DECISIONS: Decision[] = ['pending', 'keep', 'drop'];

/** Keep / drop / retarget / re-section a single card. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patch: Partial<Item> = {};

  if (typeof body.decision === 'string') {
    if (!DECISIONS.includes(body.decision as Decision)) {
      return NextResponse.json({ error: 'Unknown decision.' }, { status: 400 });
    }
    patch.decision = body.decision as Decision;
  }
  if (typeof body.digDeeper === 'boolean') patch.digDeeper = body.digDeeper;
  if (typeof body.section === 'string') {
    if (!SECTIONS.includes(body.section as Section)) {
      return NextResponse.json({ error: 'Unknown section.' }, { status: 400 });
    }
    patch.section = body.section as Section;
  }
  if (Array.isArray(body.audiences)) {
    const audiences = body.audiences.filter(
      (a): a is AudienceTag =>
        typeof a === 'string' && AUDIENCE_TAGS.includes(a as AudienceTag),
    );
    patch.audiences = audiences;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const item = await updateItem(id, patch);
  if (!item) {
    return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
  }
  return NextResponse.json({ item });
}
