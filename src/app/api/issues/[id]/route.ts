import { NextResponse } from 'next/server';
import { getIssue, saveIssue } from '@/lib/store';
import type { Issue, IssueSection } from '@/lib/types';
import { SECTIONS } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) {
    return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
  }
  return NextResponse.json({ issue });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) {
    return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
  }
  if (issue.status === 'sent') {
    return NextResponse.json(
      { error: 'This issue has already gone out and cannot be edited.' },
      { status: 409 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const next: Issue = { ...issue };
  if (typeof body.subject === 'string') next.subject = body.subject;
  if (typeof body.intro === 'string') next.intro = body.intro;
  if (typeof body.signoff === 'string') next.signoff = body.signoff;
  if (body.mode === 'single' || body.mode === 'segmented') {
    next.mode = body.mode;
  }
  if (Array.isArray(body.sections)) {
    next.sections = (body.sections as unknown[])
      .filter((s): s is IssueSection => {
        if (!s || typeof s !== 'object') return false;
        const c = s as Partial<IssueSection>;
        return (
          typeof c.section === 'string' &&
          SECTIONS.includes(c.section) &&
          typeof c.title === 'string' &&
          Array.isArray(c.itemIds)
        );
      })
      .map((s) => ({
        section: s.section,
        title: s.title,
        itemIds: s.itemIds.filter((i): i is string => typeof i === 'string'),
      }))
      .filter((s) => s.itemIds.length > 0);
  }

  await saveIssue(next);
  return NextResponse.json({ issue: next });
}
