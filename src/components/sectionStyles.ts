import type { AudienceTag, Section } from '@/lib/types';

/** Muted chip classes per section, small and consistent, never a loud badge. */
export const SECTION_CHIP_STYLES: Record<Section, string> = {
  'volta-update': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  events: 'bg-amber-50 text-amber-700 border-amber-200',
  funding: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  opportunity: 'bg-violet-50 text-violet-700 border-violet-200',
  jobs: 'bg-sky-50 text-sky-700 border-sky-200',
  ecosystem: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const AUDIENCE_CHIP_STYLES: Record<AudienceTag, string> = {
  founders: 'bg-orange-50 text-orange-700 border-orange-200',
  builders: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  coaches: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  investors: 'bg-lime-50 text-lime-700 border-lime-200',
  community: 'bg-slate-50 text-slate-700 border-slate-200',
};

export const AUDIENCE_CHIP_ACTIVE_STYLES: Record<AudienceTag, string> = {
  founders: 'bg-orange-600 text-white border-orange-600',
  builders: 'bg-cyan-600 text-white border-cyan-600',
  coaches: 'bg-fuchsia-600 text-white border-fuchsia-600',
  investors: 'bg-lime-600 text-white border-lime-600',
  community: 'bg-slate-600 text-white border-slate-600',
};
