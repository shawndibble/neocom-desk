export const CORP_NAME = 'Brass Meridian Logistics';
export const ROSTER_COUNT = 187;
export const OFFICER = { characterId: 2119876543, name: 'Kestrel Vane' };
export const REVIEW_LINK = 'https://neocomdesk.com/vetting';

export interface RosterMember {
  characterId: number;
  name: string;
  title?: string;
  seen?: string;
  waiting?: { by: string; ago: string };
  you?: boolean;
}

export const ROSTER: readonly RosterMember[] = [
  { characterId: 2118000009, name: 'Ren Halvard', title: 'Miner', seen: 'online now' },
  { characterId: 2118000030, name: 'Renna Oku', title: 'Hauler', seen: '2 hours ago' },
  { characterId: 2118000031, name: 'Renwick Dane', title: 'Miner', seen: '3 days ago' },
  { characterId: 2118000032, name: 'Lauren Brask', title: 'Industrialist', seen: '41 days ago' },
  { characterId: 2118000004, name: 'Joss Arden', title: 'Fleet Commander', seen: 'yesterday' },
  { characterId: 2118000022, name: 'Hesper Lune', title: 'Recruiter', seen: '5 hours ago' },
  { characterId: 2118000008, name: 'Dara Quill', title: 'Hauler', seen: '12 days ago' },
  {
    characterId: 2118000006,
    name: 'Pell Okonru',
    title: 'Industrialist',
    seen: 'yesterday',
    waiting: { by: 'Ilse Marrow', ago: '2 days ago' },
  },
  { characterId: 2118000005, name: 'Arden Ore', title: 'Miner', seen: '4 days ago' },
  { characterId: 2118000020, name: 'Ilse Marrow', title: 'Director', seen: 'online now' },
  { characterId: 2118000021, name: 'Bram Soto', title: 'Director', seen: '1 hour ago' },
  {
    characterId: 2119876543,
    name: 'Kestrel Vane',
    title: 'Director',
    seen: 'online now',
    you: true,
  },
];

export const PICKED = ROSTER[0];

export const CORP_TITLES = [
  'Fleet Commander',
  'Industrialist',
  'Recruiter',
  'Hauler',
  'Miner',
] as const;

export const EVE_ROLES = [
  'Director',
  'Personnel Manager',
  'Accountant',
  'Junior Accountant',
  'Station Manager',
  'Security Officer',
] as const;

export const ROLE_PICKED = 'Accountant';

export interface MailLine {
  text: string;
}

export const MAIL = {
  from: OFFICER.name,
  to: PICKED.name,
  subject: `Review requested before ${ROLE_PICKED}`,
  paragraphs: [
    `Hi ${PICKED.name},`,
    `I asked for a review before you are made ${ROLE_PICKED} in ${CORP_NAME}. Other officers decide it. I cannot sign it off.`,
    'What happens: you sign in with your characters and choose which to share. Neocom Desk reads them once: corporation history, wallet, contracts, contacts, skills, and who you exchanged mail with (never the subject or the text). No sign-in is kept.',
    'You can see who opens the report, delete it at any time, or decline. If you decline, the reviewers are told and nothing is read.',
  ],
  open: `Open it: ${REVIEW_LINK}`,
  signInAs: `Sign in as ${PICKED.name}.`,
  sign: OFFICER.name,
} as const;

export type MailState = 'none' | 'sent' | 'sentOld';

export interface WaitingRow {
  id: string;
  characterId: number;
  name: string;
  role: string;
  asked: string;
  mail: MailState;
  mailAgo?: string;
}

export const WAITING_ROWS: readonly WaitingRow[] = [
  {
    id: 'w1',
    characterId: 2118000009,
    name: 'Ren Halvard',
    role: 'Accountant',
    asked: '5 minutes ago',
    mail: 'none',
  },
  {
    id: 'w2',
    characterId: 2118000022,
    name: 'Hesper Lune',
    role: 'Recruiter',
    asked: '6 hours ago',
    mail: 'sent',
    mailAgo: '6 hours ago',
  },
  {
    id: 'w3',
    characterId: 2118000008,
    name: 'Dara Quill',
    role: 'Junior Accountant',
    asked: '3 days ago',
    mail: 'sentOld',
    mailAgo: '3 days ago',
  },
];

export interface SharedRow {
  id: string;
  characterId: number;
  name: string;
  corp: string;
  kind: string;
  result: string;
  signed: string;
  read: string;
}

export const SHARED_ROWS: readonly SharedRow[] = [
  {
    id: 's1',
    characterId: 2118000004,
    name: 'Joss Arden',
    corp: CORP_NAME,
    kind: 'Promotion to Director',
    result: '1 flag',
    signed: '1 of 2',
    read: '23 hours ago',
  },
];
