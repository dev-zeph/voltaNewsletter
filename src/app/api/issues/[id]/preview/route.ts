import { renderIssue } from '@/lib/pipeline/issue';
import { getIssue } from '@/lib/store';
import type { AudienceTag } from '@/lib/types';
import { AUDIENCE_TAGS } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Raw HTML, for an <iframe srcDoc> in the compose view. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) {
    return new Response('<p>Issue not found.</p>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const raw = new URL(req.url).searchParams.get('audience') ?? 'all';
  const audience: AudienceTag | 'all' = AUDIENCE_TAGS.includes(
    raw as AudienceTag,
  )
    ? (raw as AudienceTag)
    : 'all';

  const { html } = await renderIssue(issue, audience);
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
