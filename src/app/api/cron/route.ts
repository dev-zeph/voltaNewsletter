import { NextResponse } from 'next/server';
import { runBob } from '@/lib/pipeline/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Vercel Cron hits this every 3 days (see vercel.json). Bob gathers
 * unattended, so the board is already waiting when Bader opens the app.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 * Locally there is no secret, so the route runs open, which is what you want
 * for hitting it by hand during development.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
  }

  const { run } = await runBob({ trigger: 'cron' });
  return NextResponse.json({
    ok: run.status === 'done',
    runId: run.id,
    surfaced: run.surfacedCount,
    message: run.message,
  });
}
