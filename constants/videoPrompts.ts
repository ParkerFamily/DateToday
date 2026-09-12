/**
 * Curated DateToday video prompts — users never type their own.
 * Two required core videos persist on the profile (not re-recorded nightly).
 * Optional Tonight Clip (session-expiring) can come later.
 */

export type VideoPromptKind = 'about_you' | 'tonight_signature' | 'tonight_chemistry';

export interface VideoPromptDef {
  id: string;
  text: string;
  kind: VideoPromptKind;
  /** Signature prompt shown first in Discover */
  signature?: boolean;
}

/** Personality / energy — pick exactly one during onboarding */
export const ABOUT_YOU_PROMPTS: VideoPromptDef[] = [
  {
    id: 'about-friends-warn',
    text: 'My friends would warn you that I…',
    kind: 'about_you',
  },
  {
    id: 'about-talk-all-night',
    text: 'Something I can talk about all night is…',
    kind: 'about_you',
  },
  {
    id: 'about-vibing',
    text: "You'll know we're vibing if…",
    kind: 'about_you',
  },
  {
    id: 'about-laugh',
    text: 'The quickest way to make me laugh is…',
    kind: 'about_you',
  },
  {
    id: 'about-toxic',
    text: 'My toxic date trait is…',
    kind: 'about_you',
  },
  {
    id: 'about-win-over',
    text: 'The quickest way to win me over is…',
    kind: 'about_you',
  },
  {
    id: 'about-know-before',
    text: 'One thing you should know before going out with me…',
    kind: 'about_you',
  },
  {
    id: 'about-green-flag',
    text: 'My green flag on a first date is…',
    kind: 'about_you',
  },
  {
    id: 'about-went-well',
    text: 'I know the date went well when…',
    kind: 'about_you',
  },
];

/** Everyone records this — DateToday's signature Discover opener */
export const TONIGHT_SIGNATURE_PROMPT: VideoPromptDef = {
  id: 'tonight-whats-the-move',
  text: "You get me for tonight. What's the move?",
  kind: 'tonight_signature',
  signature: true,
};

/** Extra chemistry prompts (bank for future / Tonight Clip variants) */
export const TONIGHT_CHEMISTRY_PROMPTS: VideoPromptDef[] = [
  {
    id: 'tonight-ordering',
    text: "If we're grabbing food tonight, I'm ordering…",
    kind: 'tonight_chemistry',
  },
  {
    id: 'tonight-picking',
    text: "Drinks, dinner, or something random? I'm picking…",
    kind: 'tonight_chemistry',
  },
];

export const VIDEO_PROMPT_BANK: VideoPromptDef[] = [
  TONIGHT_SIGNATURE_PROMPT,
  ...ABOUT_YOU_PROMPTS,
  ...TONIGHT_CHEMISTRY_PROMPTS,
];

export const VIDEO_DURATION = {
  minSeconds: 8,
  maxSeconds: 20,
  countdownFrom: 3,
} as const;

export function getPromptById(id: string): VideoPromptDef | undefined {
  return VIDEO_PROMPT_BANK.find((p) => p.id === id);
}

export function promptDisplayLabel(kind: string): string {
  if (kind === 'tonight_signature' || kind === 'tonight_chemistry' || kind === 'tonight_clip') {
    return 'TONIGHT';
  }
  return 'ABOUT YOU';
}
