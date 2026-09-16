// ============================================================================
// Bob — source dispatcher. This is the one place that guarantees a bad
// feed degrades a run instead of failing it: fetchSource never throws.
// ============================================================================

import type { SourceConfig, SourceResult } from '@/lib/types';
import { fetchRss } from './rss';
import { fetchAgentSearch } from './agent-search';
import { fetchGoogleNews } from './gnews';
import { fetchVoltaEvents, fetchVoltaNews } from './volta';

export async function fetchSource(cfg: SourceConfig): Promise<SourceResult> {
  const start = Date.now();
  try {
    let items;
    if (cfg.kind === 'rss') {
      items = await fetchRss(cfg);
    } else if (cfg.kind === 'gnews') {
      items = await fetchGoogleNews(cfg);
    } else if (cfg.kind === 'agent') {
      items = await fetchAgentSearch(cfg);
    } else if (cfg.kind === 'html') {
      items = cfg.id.includes('event') ? await fetchVoltaEvents(cfg) : await fetchVoltaNews(cfg);
    } else {
      throw new Error(`fetchSource: unknown source kind "${cfg.kind}" for ${cfg.id}`);
    }

    return {
      sourceId: cfg.id,
      sourceName: cfg.name,
      ok: true,
      items,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      sourceId: cfg.id,
      sourceName: cfg.name,
      ok: false,
      items: [],
      ms: Date.now() - start,
      error: String(err instanceof Error ? err.message : err),
    };
  }
}

export async function fetchAllSources(cfgs: SourceConfig[]): Promise<SourceResult[]> {
  const enabled = cfgs.filter((cfg) => cfg.enabled);
  const settled = await Promise.allSettled(enabled.map((cfg) => fetchSource(cfg)));

  return settled.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;

    // fetchSource itself never throws, but guard anyway: Promise.allSettled
    // can still report a rejection if something upstream (e.g. a bad
    // SourceConfig) blew up before fetchSource's own try block ran.
    const cfg = enabled[i];
    return {
      sourceId: cfg.id,
      sourceName: cfg.name,
      ok: false,
      items: [],
      ms: 0,
      error: String(result.reason instanceof Error ? result.reason.message : result.reason),
    };
  });
}

export { DEFAULT_SOURCES } from './defaults';
