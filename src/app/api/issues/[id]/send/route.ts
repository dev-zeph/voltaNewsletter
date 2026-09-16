import { NextResponse } from 'next/server';
import { sendNewsletter } from '@/lib/mail';
import {
  audiencesForIssue,
  recipientsFor,
  renderIssue,
} from '@/lib/pipeline/issue';
import { getIssue, getRecipients, saveIssue } from '@/lib/store';
import type { Issue, SendLogEntry } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Sends the issue. With `testTo` it sends a single copy to that address and
 * leaves the issue in draft, which is how you check it before committing.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) {
    return NextResponse.json({ error: 'Issue not found.' }, { status: 404 });
  }

  let testTo = '';
  try {
    const body = (await req.json().catch(() => ({}))) as { testTo?: unknown };
    testTo = typeof body.testTo === 'string' ? body.testTo.trim() : '';
  } catch {
    testTo = '';
  }

  if (testTo) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      return NextResponse.json(
        { error: 'That does not look like an email address.' },
        { status: 400 },
      );
    }
    const { html, text } = await renderIssue(issue, 'all');
    const result = await sendNewsletter({
      to: [testTo],
      subject: `[TEST] ${issue.subject}`,
      html,
      text,
      audience: 'all',
    });
    const entry: SendLogEntry = {
      at: new Date().toISOString(),
      transport: result.transport,
      audience: 'all',
      recipients: result.recipients,
      ok: result.ok,
      error: result.error,
      previewPath: result.previewPath,
    };
    const next: Issue = { ...issue, sendLog: [...issue.sendLog, entry] };
    await saveIssue(next);
    return NextResponse.json({ issue: next, results: [entry] });
  }

  if (issue.status === 'sent') {
    return NextResponse.json(
      { error: 'This issue has already been sent.' },
      { status: 409 },
    );
  }

  const recipients = await getRecipients();
  const audiences = await audiencesForIssue(issue);
  const results: SendLogEntry[] = [];

  for (const audience of audiences) {
    const targets = recipientsFor(recipients, audience);
    if (!targets.length) continue;

    const { html, text } = await renderIssue(issue, audience);
    // A segmented audience whose items were all filtered out gets nothing
    // rather than an email with an empty body.
    if (!html.trim()) continue;

    const result = await sendNewsletter({
      to: targets.map((r) => r.email),
      subject: issue.subject,
      html,
      text,
      audience,
    });
    results.push({
      at: new Date().toISOString(),
      transport: result.transport,
      audience,
      recipients: result.recipients,
      ok: result.ok,
      error: result.error,
      previewPath: result.previewPath,
    });
  }

  if (!results.length) {
    return NextResponse.json(
      { error: 'No active recipients matched this issue.' },
      { status: 400 },
    );
  }

  const anyOk = results.some((r) => r.ok);
  const next: Issue = {
    ...issue,
    status: anyOk ? 'sent' : issue.status,
    sentAt: anyOk ? new Date().toISOString() : issue.sentAt,
    sendLog: [...issue.sendLog, ...results],
  };
  await saveIssue(next);

  return NextResponse.json({ issue: next, results });
}
