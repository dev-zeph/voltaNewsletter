// ============================================================================
// Bob — mail transport contract. Picks SMTP or dry-run and never throws.
// ============================================================================

import type { AudienceTag } from '@/lib/types';
import { sendViaSmtp } from '@/lib/mail/smtp';
import { sendDryRun } from '@/lib/mail/dryrun';

export interface SendArgs {
  to: string[];
  subject: string;
  html: string;
  text: string;
  audience: AudienceTag | 'all';
}

export interface SendResult {
  ok: boolean;
  transport: 'smtp' | 'dry-run';
  recipients: string[];
  error?: string;
  previewPath?: string;
  messageId?: string;
}

function hasSmtpCreds(): boolean {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(user && user.trim() && pass && pass.trim());
}

export function activeTransport(): 'smtp' | 'dry-run' {
  return hasSmtpCreds() ? 'smtp' : 'dry-run';
}

export function transportStatus(): {
  transport: 'smtp' | 'dry-run';
  ready: boolean;
  detail: string;
  from: string;
} {
  const transport = activeTransport();
  const user = process.env.SMTP_USER ?? '';
  const from = process.env.MAIL_FROM ?? (user ? `"Volta" <${user}>` : '"Volta" <bob@example.com>');

  if (transport === 'smtp') {
    return {
      transport,
      ready: true,
      detail: `Sending live from ${from} via Gmail SMTP.`,
      from,
    };
  }

  return {
    transport,
    ready: true,
    detail:
      'No SMTP credentials. Bob will write a preview file instead of sending.',
    from,
  };
}

export async function sendNewsletter(args: SendArgs): Promise<SendResult> {
  const transport = activeTransport();

  if (transport === 'dry-run') {
    try {
      return await sendDryRun(args);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        transport: 'dry-run',
        recipients: args.to,
        error: `Dry-run preview failed to write: ${detail}`,
      };
    }
  }

  try {
    const result = await sendViaSmtp(args);
    if (result.ok) return result;

    // SMTP failed. Fall back to a dry-run preview so the user still gets
    // the artifact, but keep the original error and mark it as failed.
    try {
      const fallback = await sendDryRun(args);
      return {
        ...result,
        previewPath: fallback.previewPath,
      };
    } catch {
      return result;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    try {
      const fallback = await sendDryRun(args);
      return {
        ok: false,
        transport: 'smtp',
        recipients: args.to,
        error: `SMTP send threw unexpectedly: ${detail}`,
        previewPath: fallback.previewPath,
      };
    } catch {
      return {
        ok: false,
        transport: 'smtp',
        recipients: args.to,
        error: `SMTP send threw unexpectedly: ${detail}`,
      };
    }
  }
}
