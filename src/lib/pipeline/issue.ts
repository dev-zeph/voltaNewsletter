import { randomUUID } from 'node:crypto';
import { composeIntro } from '@/lib/llm/compose';
import {
  renderNewsletterHtml,
  renderNewsletterText,
} from '@/lib/render/newsletter';
import { getItemsByIds, getRecipients, getRun } from '@/lib/store';
import type {
  AudienceTag,
  Issue,
  IssueMode,
  Item,
  NewsletterPayload,
  Recipient,
} from '@/lib/types';
import { AUDIENCE_LABELS, SECTION_LABELS, SECTION_ORDER } from '@/lib/types';

/**
 * Turns the items Bader kept on the board into an editable draft issue.
 * Only 'keep' items make it in. Pending is not implicit consent.
 */
export async function buildIssue(
  runId: string,
  mode: IssueMode,
): Promise<{ issue: Issue; items: Item[] } | null> {
  const run = await getRun(runId);
  if (!run) return null;

  const all = await getItemsByIds(run.itemIds);
  const kept = all.filter((i) => i.decision === 'keep');

  const sections = SECTION_ORDER.map((section) => ({
    section,
    title: SECTION_LABELS[section],
    itemIds: kept.filter((i) => i.section === section).map((i) => i.id),
  })).filter((s) => s.itemIds.length > 0);

  const { subject, intro } = await composeIntro(
    kept.map((i) => ({ title: i.title, section: i.section, why: i.why })),
    'all',
  );

  const issue: Issue = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    subject,
    intro,
    signoff:
      'That is everything worth your time this cycle. Reply to this email if you have something the community should see.',
    mode,
    sections,
    status: 'draft',
    sentAt: null,
    sendLog: [],
  };

  return { issue, items: kept };
}

/**
 * Renders one audience's version of an issue. In 'single' mode every recipient
 * gets the same thing. In 'segmented' mode each audience gets only the items
 * tagged for them, and a section with nothing left for that audience is
 * dropped rather than rendered empty.
 */
export async function renderIssue(
  issue: Issue,
  audience: AudienceTag | 'all',
): Promise<{ html: string; text: string; payload: NewsletterPayload }> {
  const ids = issue.sections.flatMap((s) => s.itemIds);
  const items = await getItemsByIds(ids);
  const byId = new Map(items.map((i) => [i.id, i]));

  const sections = issue.sections
    .map((s) => ({
      title: s.title,
      items: s.itemIds
        .map((id) => byId.get(id))
        .filter((i): i is Item => Boolean(i))
        .filter(
          (i) =>
            audience === 'all' ||
            issue.mode === 'single' ||
            i.audiences.includes(audience),
        ),
    }))
    .filter((s) => s.items.length > 0);

  const payload: NewsletterPayload = {
    subject: issue.subject,
    intro: issue.intro,
    signoff: issue.signoff,
    audience,
    audienceLabel:
      audience === 'all' ? 'Volta Community' : AUDIENCE_LABELS[audience],
    sections,
    issueDate: new Date(issue.createdAt).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  };

  return {
    html: renderNewsletterHtml(payload),
    text: renderNewsletterText(payload),
    payload,
  };
}

/** Which audiences actually need their own email for this issue. */
export async function audiencesForIssue(
  issue: Issue,
): Promise<Array<AudienceTag | 'all'>> {
  if (issue.mode === 'single') return ['all'];
  const recipients = await getRecipients();
  const active = recipients.filter((r) => r.active);
  const tags = new Set<AudienceTag>();
  for (const r of active) for (const t of r.tags) tags.add(t);
  return [...tags];
}

export function recipientsFor(
  recipients: Recipient[],
  audience: AudienceTag | 'all',
): Recipient[] {
  const active = recipients.filter((r) => r.active && r.email);
  if (audience === 'all') return active;
  return active.filter((r) => r.tags.includes(audience));
}
