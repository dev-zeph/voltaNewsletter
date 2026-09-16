// ============================================================================
// Bob — the newsletter email itself. Builds a full HTML email (table-based,
// inline-styled, Outlook/Gmail safe) and a plain-text alternative.
// ============================================================================

import type { Item, NewsletterPayload } from '@/lib/types';

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

const ACCENT = '#0f6e5f'; // deep teal, reads modern against Volta's dark logo mark
const INK = '#16181d';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';
const BG = '#f4f5f7';
const CARD_BG = '#ffffff';
const TAG_BG = '#e7f4f1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escapes text for safe interpolation into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes an href. Falls back to '#' for anything empty or unsafe. */
function escUrl(url: string | undefined | null): string {
  if (!url) return '#';
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return '#';
  return esc(trimmed);
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatIssueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// HTML render
// ---------------------------------------------------------------------------

function renderPreheader(payload: NewsletterPayload): string {
  const first = payload.sections[0]?.items[0];
  const text = first ? `${first.title}. ${first.blurb}` : payload.intro;
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(
    text,
  ).slice(0, 150)}</div>`;
}

function renderHeader(payload: NewsletterPayload): string {
  const audienceLine =
    payload.audience !== 'all'
      ? `<tr><td style="padding:4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">For ${esc(
          payload.audienceLabel,
        )}</td></tr>`
      : '';
  return `
  <tr>
    <td style="padding:32px 32px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:0.08em;color:${INK};">
            VOLTA
          </td>
        </tr>
        <tr>
          <td style="padding:2px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">
            ${esc(formatIssueDate(payload.issueDate))}
          </td>
        </tr>
        ${audienceLine}
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-top:2px solid ${ACCENT};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>`;
}

function renderIntro(payload: NewsletterPayload): string {
  return `
  <tr>
    <td style="padding:24px 32px 8px;">
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:${INK};">
        ${esc(payload.intro)}
      </p>
    </td>
  </tr>`;
}

function renderAmountTag(amount: string): string {
  return `<span style="display:inline-block;margin-top:6px;padding:3px 10px;border-radius:12px;background-color:${TAG_BG};color:${ACCENT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;">${esc(
    amount,
  )}</span>`;
}

/**
 * Event dates arrive as raw ISO timestamps from the events scraper. Printing
 * "2026-09-16T21:00:00.000Z" in the one tag whose entire job is telling a reader
 * when to show up defeats the point, so format it, and include the time because
 * for an event that is the useful half.
 */
function formatEventDate(raw: string): string {
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return raw;
  const d = new Date(ts);
  const day = d.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
  });
  // Midnight almost always means "no time was published", not an event at 12am.
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return hasTime ? `${day}, ${time}` : day;
}

function renderEventDateTag(eventDate: string): string {
  return `<span style="display:inline-block;margin-top:6px;padding:3px 10px;border-radius:12px;background-color:${TAG_BG};color:${ACCENT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;">${esc(
    formatEventDate(eventDate),
  )}</span>`;
}

function renderItem(item: Item, isLast: boolean): string {
  const borderBottom = isLast ? '' : `border-bottom:1px solid ${RULE};`;
  const metaBits = [item.sourceName, formatDate(item.publishedAt)]
    .filter(Boolean)
    .map(esc);
  const metaLine = metaBits.join(' &middot; ');

  let tag = '';
  if (item.section === 'funding' && item.entities?.amount) {
    tag = renderAmountTag(item.entities.amount);
  } else if (item.section === 'events' && item.meta?.eventDate) {
    tag = renderEventDateTag(item.meta.eventDate);
  }

  return `
        <tr>
          <td style="padding:16px 0;${borderBottom}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                  <a href="${escUrl(
                    item.url,
                  )}" style="color:${INK};font-size:16px;font-weight:600;line-height:22px;text-decoration:none;">${esc(
    item.title,
  )}</a>
                </td>
              </tr>
              <tr>
                <td style="padding-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:21px;color:${INK};">
                  ${esc(item.blurb)}
                </td>
              </tr>
              ${tag ? `<tr><td style="padding-top:2px;">${tag}</td></tr>` : ''}
              <tr>
                <td style="padding-top:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${MUTED};">
                  ${metaLine}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function renderSection(section: { title: string; items: Item[] }): string {
  if (!section.items.length) return '';
  const rows = section.items
    .map((item, i) => renderItem(item, i === section.items.length - 1))
    .join('');
  return `
  <tr>
    <td style="padding:20px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding-bottom:10px;border-bottom:2px solid ${ACCENT};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${INK};">
            ${esc(section.title)}
          </td>
        </tr>
        ${rows}
      </table>
    </td>
  </tr>`;
}

function renderEmptyNote(): string {
  return `
  <tr>
    <td style="padding:24px 32px;">
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:${MUTED};">
        I did not find anything worth sending this time. I will keep looking and check back in a few days.
      </p>
    </td>
  </tr>`;
}

function renderSignoff(payload: NewsletterPayload): string {
  return `
  <tr>
    <td style="padding:28px 32px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 32px 8px;">
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:${INK};white-space:pre-line;">
        ${esc(payload.signoff)}
      </p>
    </td>
  </tr>`;
}

function renderFooter(): string {
  return `
  <tr>
    <td style="padding:20px 32px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="border-top:1px solid ${RULE};font-size:0;line-height:0;padding-bottom:16px;">&nbsp;</td></tr>
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:${MUTED};">
            Sent by Bob for Volta, Halifax's innovation hub.<br />
            <a href="{{unsubscribe}}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function renderNewsletterHtml(payload: NewsletterPayload): string {
  const sectionsHtml = payload.sections.map(renderSection).join('');
  const hasAnyItems = payload.sections.some((s) => s.items.length > 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(payload.subject)}</title>
<style>
  @media (max-width: 620px) {
    .bob-container { width: 100% !important; }
    .bob-pad { padding-left: 20px !important; padding-right: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BG};">
${renderPreheader(payload)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="bob-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:${CARD_BG};">
        ${renderHeader(payload)}
        ${renderIntro(payload)}
        ${hasAnyItems ? sectionsHtml : renderEmptyNote()}
        ${renderSignoff(payload)}
        ${renderFooter()}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Plain-text render
// ---------------------------------------------------------------------------

export function renderNewsletterText(payload: NewsletterPayload): string {
  const lines: string[] = [];

  lines.push('VOLTA');
  lines.push(formatIssueDate(payload.issueDate));
  if (payload.audience !== 'all') {
    lines.push(`For ${payload.audienceLabel}`);
  }
  lines.push('');
  lines.push(payload.intro);
  lines.push('');

  const hasAnyItems = payload.sections.some((s) => s.items.length > 0);

  if (!hasAnyItems) {
    lines.push(
      'I did not find anything worth sending this time. I will keep looking and check back in a few days.',
    );
  } else {
    for (const section of payload.sections) {
      if (!section.items.length) continue;
      lines.push('----------------------------------------');
      lines.push(section.title.toUpperCase());
      lines.push('----------------------------------------');
      lines.push('');
      for (const item of section.items) {
        lines.push(item.title);
        lines.push(item.blurb);
        if (item.section === 'funding' && item.entities?.amount) {
          lines.push(`Amount: ${item.entities.amount}`);
        }
        if (item.section === 'events' && item.meta?.eventDate) {
          lines.push(`When: ${formatEventDate(item.meta.eventDate)}`);
        }
        const metaBits = [item.sourceName, formatDate(item.publishedAt)].filter(
          Boolean,
        );
        if (metaBits.length) lines.push(metaBits.join(' - '));
        lines.push(item.url);
        lines.push('');
      }
    }
  }

  lines.push('----------------------------------------');
  lines.push('');
  lines.push(payload.signoff);
  lines.push('');
  lines.push('Sent by Bob for Volta, Halifax\'s innovation hub.');
  lines.push('Unsubscribe: {{unsubscribe}}');

  return lines.join('\n');
}
