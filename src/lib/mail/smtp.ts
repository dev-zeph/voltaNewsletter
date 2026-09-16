// ============================================================================
// Bob — Gmail SMTP transport via nodemailer.
// ============================================================================

import nodemailer from 'nodemailer';
import type { SendArgs, SendResult } from '@/lib/mail';

const SEND_TIMEOUT_MS = 20_000;

export async function sendViaSmtp(args: SendArgs): Promise<SendResult> {
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';
  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT ?? 465);
  const from = process.env.MAIL_FROM ?? `"Volta" <${user}>`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  try {
    await transporter.verify();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      transport: 'smtp',
      recipients: args.to,
      error: `SMTP auth failed: ${detail}. Most likely cause: SMTP_PASS is your regular Gmail password, not a 16-character Google App Password. Generate one at myaccount.google.com/apppasswords (requires 2-Step Verification to be on for the account).`,
    };
  }

  try {
    const sendPromise = transporter.sendMail({
      from,
      to: from,
      bcc: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('SMTP send timed out after 20s')), SEND_TIMEOUT_MS);
    });

    const info = await Promise.race([sendPromise, timeoutPromise]);

    return {
      ok: true,
      transport: 'smtp',
      recipients: args.to,
      messageId: info.messageId,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      transport: 'smtp',
      recipients: args.to,
      error: `SMTP send failed: ${detail}`,
    };
  }
}
