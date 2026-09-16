import { DEFAULT_SOURCES } from '@/lib/sources';
import { DEFAULT_RECIPIENTS } from '@/lib/recipients/defaults';
import {
  getRecipients,
  getSources,
  saveRecipients,
  saveSources,
} from '@/lib/store';
import type { Recipient, SourceConfig } from '@/lib/types';

/**
 * Seeds the store on first run so a fresh clone is immediately usable.
 * Built-in sources are re-merged on every boot, so adding a source in code
 * shows up without anyone having to wipe .data/.
 */
export async function ensureSeeded(): Promise<{
  sources: SourceConfig[];
  recipients: Recipient[];
}> {
  const [existingSources, existingRecipients] = await Promise.all([
    getSources(),
    getRecipients(),
  ]);

  let sources = existingSources;
  if (!existingSources.length) {
    sources = DEFAULT_SOURCES;
    await saveSources(sources);
  } else {
    const known = new Set(existingSources.map((s) => s.id));
    const added = DEFAULT_SOURCES.filter((s) => !known.has(s.id));
    if (added.length) {
      sources = [...existingSources, ...added];
      await saveSources(sources);
    }
  }

  let recipients = existingRecipients;
  if (!existingRecipients.length) {
    recipients = DEFAULT_RECIPIENTS;
    await saveRecipients(recipients);
  }

  return { sources, recipients };
}
