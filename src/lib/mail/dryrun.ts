// ============================================================================
// Bob — dry-run transport. Writes the rendered email to disk instead of
// sending it, so the product is fully demoable with zero SMTP credentials.
// ============================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '@/lib/store';
import type { SendArgs, SendResult } from '@/lib/mail';

function escBanner(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendDryRun(args: SendArgs): Promise<SendResult> {
  const previewDir = path.join(DATA_DIR, 'previews');
  await fs.mkdir(previewDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}-${args.audience}.html`;
  const absolutePath = path.join(previewDir, filename);

  const banner = `<div style="background:#fff3cd;border:1px solid #ffe08a;color:#664d03;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;padding:12px 16px;margin:0;">
  <strong>DRY RUN &mdash; nothing was sent.</strong><br>
  Subject: ${escBanner(args.subject)}<br>
  Audience: ${escBanner(args.audience)}<br>
  Would-be recipients (${args.to.length}): ${escBanner(args.to.join(', '))}
</div>
`;

  const withBanner = args.html.replace(
    /<body([^>]*)>/i,
    (match) => `${match}\n${banner}`,
  );

  await fs.writeFile(absolutePath, withBanner, 'utf8');

  const relativePath = path.relative(process.cwd(), absolutePath);

  console.log(
    `[Bob] dry-run: "${args.subject}" -> ${args.audience} (${args.to.length} recipients). Preview written to ${relativePath}`,
  );

  return {
    ok: true,
    transport: 'dry-run',
    recipients: args.to,
    previewPath: relativePath,
  };
}
