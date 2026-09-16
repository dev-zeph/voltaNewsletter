// ============================================================================
// Bob — mail transport contract. Picks a transport and never throws.
//
// Preference order: Resend, then Gmail SMTP, then a dry-run preview written to
// disk. Resend comes first because it is the one that works from a serverless
// function without a long-lived connection or an app password to rotate.
// ============================================================================

import type { AudienceTag, MailTransport } from '@/lib/types';
import { sendViaResend } from '@/lib/mail/resend';
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
  transport: MailTransport;
  recipients: string[];
  error?: string;
  previewPath?: string;
  messageId?: string;
}

function hasResendKey(): boolean {
  const key = process.env.RESEND_API_KEY;
  return Boolean(key && key.trim());
}

function hasSmtpCreds(): boolean {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(user && user.trim() && pass && pass.trim());
}

export function activeTransport(): MailTransport {
  if (hasResendKey()) return 'resend';
  if (hasSmtpCreds()) return 'smtp';
  return 'dry-run';
}

function defaultFrom(): string {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (hasResendKey()) return 'Volta <onboarding@resend.dev>';
  const user = process.env.SMTP_USER ?? '';
  return user ? `"Volta" <${user}>` : '"Volta" <bob@example.com>';
}

export function transportStatus(): {
  transport: MailTransport;
  ready: boolean;
  detail: string;
  from: string;
} {
  const transport = activeTransport();
  const from = defaultFrom();

  if (transport === 'resend') {
    const unverified = from.includes('onboarding@resend.dev');
    return {
      transport,
      ready: true,
      // Say the awkward part out loud. On an unverified domain Resend only
      // delivers to the account owner, and a presenter needs to know that
      // before they press Send in front of people.
      detail: unverified
        ? `Sending live from ${from} via Resend. This is Resend's shared test sender, so it will only reach the address that owns the Resend account. Verify a domain and set MAIL_FROM to send to the real list.`
        : `Sending live from ${from} via Resend.`,
      from,
    };
  }

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
      'No mail credentials set. Bob will write a preview file instead of sending, so nothing leaves the building.',
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
    const result =
      transport === 'resend' ? await sendViaResend(args) : await sendViaSmtp(args);
    if (result.ok) return result;

    // The live transport failed. Fall back to a dry-run preview so the user
    // still gets the artifact, but keep the original error and mark it failed.
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
        transport,
        recipients: args.to,
        error: `${transport} send threw unexpectedly: ${detail}`,
        previewPath: fallback.previewPath,
      };
    } catch {
      return {
        ok: false,
        transport,
        recipients: args.to,
        error: `${transport} send threw unexpectedly: ${detail}`,
      };
    }
  }
}
