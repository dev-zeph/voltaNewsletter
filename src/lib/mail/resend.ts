import { Resend } from 'resend';
import type { SendArgs, SendResult } from '@/lib/mail';

/**
 * Resend transport. Preferred over SMTP for a deployed Bob: no app password to
 * rotate, no Gmail sending quota, and it works from a serverless function
 * without holding a connection open.
 *
 * The important gotcha: until a domain is verified in the Resend dashboard, the
 * only usable From address is `onboarding@resend.dev`, and it will only deliver
 * to the email address that owns the Resend account. Sending to the seed
 * recipient list will come back as a 403 from the API, not an exception, so
 * that case is detected and explained rather than surfaced as "send failed".
 */
export async function sendViaResend(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'Volta <onboarding@resend.dev>';

  if (!apiKey) {
    return {
      ok: false,
      transport: 'resend',
      recipients: args.to,
      error: 'RESEND_API_KEY is not set.',
    };
  }

  try {
    const resend = new Resend(apiKey);

    // Recipients go in BCC so the subscriber list never leaks in the headers.
    // Resend requires a non-empty `to`, so the From address stands in for it,
    // exactly as the SMTP transport does.
    const { data, error } = await resend.emails.send({
      from,
      to: [stripName(from)],
      bcc: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    if (error) {
      return {
        ok: false,
        transport: 'resend',
        recipients: args.to,
        error: explainResendError(error.message ?? String(error), from),
      };
    }

    return {
      ok: true,
      transport: 'resend',
      recipients: args.to,
      messageId: data?.id,
    };
  } catch (err) {
    return {
      ok: false,
      transport: 'resend',
      recipients: args.to,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** `Volta <news@example.com>` becomes `news@example.com`. */
function stripName(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return match ? match[1].trim() : from.trim();
}

/**
 * Resend's own error text is accurate but assumes you know its rules. These are
 * the two failures that will actually happen on demo day, so name the fix.
 */
function explainResendError(message: string, from: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('testing emails') || lower.includes('own email address')) {
    return `Resend is still in test mode for this account, so it will only deliver to the address that owns the Resend account. Verify a domain at resend.com/domains and set MAIL_FROM to an address on it, or use "Send a test to" with your own address. Original error: ${message}`;
  }

  if (lower.includes('domain is not verified') || lower.includes('not verified')) {
    return `The sending domain in MAIL_FROM (${from}) is not verified in Resend. Either verify it at resend.com/domains or set MAIL_FROM to "Volta <onboarding@resend.dev>". Original error: ${message}`;
  }

  if (lower.includes('api key') || lower.includes('unauthorized')) {
    return `Resend rejected the API key. Check RESEND_API_KEY is the full value starting with "re_". Original error: ${message}`;
  }

  return message;
}
