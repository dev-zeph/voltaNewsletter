// Thin fetch client for Bob's API. Every page and component that talks to the
// backend goes through here so error handling and JSON parsing stay in one
// place. The routes may not exist yet while the backend agent is still
// working; every call surfaces a typed ApiError instead of throwing raw
// fetch/parse errors, so pages can render a graceful "API not reachable"
// state instead of crashing.

import type {
  AudienceTag,
  Directive,
  Issue,
  IssueMode,
  IssueSection,
  Item,
  Recipient,
  Run,
  SendLogEntry,
  Section,
  SourceConfig,
} from '@/lib/types';

export interface TransportInfo {
  transport: 'resend' | 'smtp' | 'dry-run';
  ready: boolean;
  detail: string;
  from: string;
}

export interface StoreInfo {
  backend: 'supabase' | 'file';
  /** False means the data will not survive a serverless deploy. */
  durable: boolean;
  detail: string;
}

export interface StateResponse {
  latestRun: Run | null;
  runs: Run[];
  items: Item[];
  recipients: Recipient[];
  sources: SourceConfig[];
  directives: Directive[];
  issues: Issue[];
  transport: TransportInfo;
  store?: StoreInfo;
  /** Present when storage is unusable. The app still renders so it can say so. */
  storeError?: string;
  llm: boolean;
}

export class ApiError extends Error {
  /** HTTP status, or 0 when the network request itself failed (server unreachable). */
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(`Could not reach ${path}. The API is not running yet.`, 0);
  }

  if (!res.ok) {
    let message = `Request to ${path} failed with status ${res.status}.`;
    try {
      const body: unknown = await res.json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        message = body.error;
      }
    } catch {
      // Non-JSON error body, likely a 404 HTML page for a route that does not exist yet.
    }
    throw new ApiError(message, res.status);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(`${path} did not return valid JSON.`, res.status);
  }
}

export function fetchState(): Promise<StateResponse> {
  return apiFetch<StateResponse>('/api/state');
}

export function startRun(): Promise<{ run: Run; items: Item[] }> {
  return apiFetch('/api/runs', { method: 'POST', body: JSON.stringify({}) });
}

export function sendErrand(
  text: string
): Promise<{ run: Run; items: Item[]; directive: Directive }> {
  return apiFetch('/api/errand', { method: 'POST', body: JSON.stringify({ text }) });
}

export interface ItemPatch {
  decision?: 'pending' | 'keep' | 'drop';
  digDeeper?: boolean;
  section?: Section;
  audiences?: AudienceTag[];
}

export function patchItem(id: string, patch: ItemPatch): Promise<{ item: Item }> {
  return apiFetch(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function buildIssue(runId: string, mode: IssueMode): Promise<{ issue: Issue; items: Item[] }> {
  return apiFetch('/api/issues', { method: 'POST', body: JSON.stringify({ runId, mode }) });
}

export interface IssuePatch {
  subject?: string;
  intro?: string;
  signoff?: string;
  mode?: IssueMode;
  sections?: IssueSection[];
}

export function patchIssue(id: string, patch: IssuePatch): Promise<{ issue: Issue }> {
  return apiFetch(`/api/issues/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function sendIssue(
  id: string,
  testTo?: string
): Promise<{ issue: Issue; results: SendLogEntry[] }> {
  return apiFetch(`/api/issues/${id}/send`, {
    method: 'POST',
    body: JSON.stringify(testTo ? { testTo } : {}),
  });
}

export function previewUrl(id: string, audience: AudienceTag | 'all'): string {
  return `/api/issues/${id}/preview?audience=${encodeURIComponent(audience)}`;
}

export function fetchRecipients(): Promise<{ recipients: Recipient[] }> {
  return apiFetch('/api/recipients');
}

export function saveRecipients(recipients: Recipient[]): Promise<{ recipients: Recipient[] }> {
  return apiFetch('/api/recipients', { method: 'POST', body: JSON.stringify({ recipients }) });
}

export function fetchSources(): Promise<{ sources: SourceConfig[] }> {
  return apiFetch('/api/sources');
}

export function saveSources(sources: SourceConfig[]): Promise<{ sources: SourceConfig[] }> {
  return apiFetch('/api/sources', { method: 'POST', body: JSON.stringify({ sources }) });
}
