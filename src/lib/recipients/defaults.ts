// ============================================================================
// Bob — seed recipient list.
//
// This is fake demo data, not a real subscriber export. Replace it by
// importing Volta's actual mailing list through the recipients UI (or by
// writing directly to the `recipients` collection via src/lib/store). Names,
// tags, and emails below are placeholders only: @example.com addresses,
// invented Halifax-flavoured names. Do not send real mail to these.
// ============================================================================

import type { Recipient } from '@/lib/types';

export const DEFAULT_RECIPIENTS: Recipient[] = [
  {
    id: 'seed-1',
    email: 'mireille.doiron@example.com',
    name: 'Mireille Doiron',
    tags: ['founders'],
    active: true,
  },
  {
    id: 'seed-2',
    email: 'kwame.boudreau@example.com',
    name: 'Kwame Boudreau',
    // Founder who also coaches other early-stage teams.
    tags: ['founders', 'coaches'],
    active: true,
  },
  {
    id: 'seed-3',
    email: 'priya.mackinnon@example.com',
    name: 'Priya MacKinnon',
    tags: ['builders'],
    active: true,
  },
  {
    id: 'seed-4',
    email: 'aldric.spinney@example.com',
    name: 'Aldric Spinney',
    tags: ['investors'],
    active: true,
  },
  {
    id: 'seed-5',
    email: 'noor.thibodeau@example.com',
    name: 'Noor Thibodeau',
    tags: ['coaches'],
    active: true,
  },
  {
    id: 'seed-6',
    email: 'declan.oquinn@example.com',
    name: "Declan O'Quinn",
    tags: ['community'],
    active: true,
  },
  {
    id: 'seed-7',
    email: 'saoirse.levesque@example.com',
    name: 'Saoirse Levesque',
    // Investor who also mentors founders through Volta's coach network.
    tags: ['investors', 'coaches'],
    active: true,
  },
  {
    id: 'seed-8',
    email: 'tobias.penny@example.com',
    name: 'Tobias Penny',
    tags: ['builders'],
    active: true,
  },
  {
    id: 'seed-9',
    email: 'yusra.comeau@example.com',
    name: 'Yusra Comeau',
    tags: ['community'],
    active: true,
  },
  {
    id: 'seed-10',
    email: 'graeme.hachey@example.com',
    name: 'Graeme Hachey',
    // Unsubscribed, kept here to prove the active filter works.
    tags: ['founders'],
    active: false,
  },
];
