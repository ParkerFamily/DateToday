/**
 * Local preview content — video-prompt dating, not photo grids.
 * Never show headcounts or empty-pool social proof on Live.
 * Never use on the pre-auth welcome screen.
 */
import { TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import type { DiscoveryVideoPrompt } from '@/types';

export const demoCity = {
  label: 'Atlanta',
  neighborhood: 'Midtown',
} as const;

/** Prompt the person answered on camera */
export interface DemoVideoPrompt {
  id: string;
  name: string;
  age: number;
  neighborhood: string;
  distanceMiles: number;
  /** Still frame from their video answer */
  videoThumbUrl: string;
  /** About You curated prompt text */
  aboutPromptId: string;
  aboutPrompt: string;
  aboutDuration: number;
  signatureDuration: number;
  activities: string[];
  foodCuisines?: readonly string[];
  isLive: boolean;
  verified: boolean;
}

export const DEMO_VIDEO_PROMPTS: DemoVideoPrompt[] = [
  {
    id: 'demo-maya',
    name: 'Maya',
    age: 24,
    neighborhood: 'Midtown',
    distanceMiles: 1.8,
    videoThumbUrl:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=900&fit=crop&q=80',
    aboutPromptId: 'about-friends-warn',
    aboutPrompt: 'My friends would warn you that I…',
    aboutDuration: 16,
    signatureDuration: 12,
    activities: ['Drinks', 'Dinner'],
    foodCuisines: ['italian', 'sushi'] as const,
    isLive: true,
    verified: true,
  },
  {
    id: 'demo-jordan',
    name: 'Jordan',
    age: 27,
    neighborhood: 'Old Fourth Ward',
    distanceMiles: 3.2,
    videoThumbUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=900&fit=crop&q=80',
    aboutPromptId: 'about-laugh',
    aboutPrompt: 'The quickest way to make me laugh is…',
    aboutDuration: 14,
    signatureDuration: 11,
    activities: ['Drinks', 'Walk'],
    foodCuisines: [] as const,
    isLive: true,
    verified: true,
  },
  {
    id: 'demo-aisha',
    name: 'Aisha',
    age: 23,
    neighborhood: 'Buckhead',
    distanceMiles: 4.1,
    videoThumbUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=900&fit=crop&q=80',
    aboutPromptId: 'about-vibing',
    aboutPrompt: "You'll know we're vibing if…",
    aboutDuration: 18,
    signatureDuration: 15,
    activities: ['Drinks', 'Chill'],
    foodCuisines: [] as const,
    isLive: true,
    verified: false,
  },
  {
    id: 'demo-lena',
    name: 'Lena',
    age: 25,
    neighborhood: 'Inman Park',
    distanceMiles: 2.6,
    videoThumbUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=900&fit=crop&q=80',
    aboutPromptId: 'about-talk-all-night',
    aboutPrompt: 'Something I can talk about all night is…',
    aboutDuration: 17,
    signatureDuration: 13,
    activities: ['Dinner', 'Drinks'],
    foodCuisines: ['sushi', 'anything'] as const,
    isLive: true,
    verified: true,
  },
];

export function demoVideoPromptsFor(person: DemoVideoPrompt): DiscoveryVideoPrompt[] {
  return [
    {
      promptId: TONIGHT_SIGNATURE_PROMPT.id,
      promptText: TONIGHT_SIGNATURE_PROMPT.text,
      kind: 'tonight_signature',
      videoUrl: null,
      thumbnailUrl: person.videoThumbUrl,
      durationSeconds: person.signatureDuration,
    },
    {
      promptId: person.aboutPromptId,
      promptText: person.aboutPrompt,
      kind: 'about_you',
      videoUrl: null,
      thumbnailUrl: person.videoThumbUrl,
      durationSeconds: person.aboutDuration,
    },
  ];
}

export const DEMO_PINGS = {
  received: [
    {
      id: 'ping-r1',
      name: 'Maya',
      age: 24,
      neighborhood: 'Midtown',
      videoThumbUrl: DEMO_VIDEO_PROMPTS[0].videoThumbUrl,
      isLive: true,
      prompt: TONIGHT_SIGNATURE_PROMPT.text,
    },
    {
      id: 'ping-r2',
      name: 'Lena',
      age: 25,
      neighborhood: 'Inman Park',
      videoThumbUrl: DEMO_VIDEO_PROMPTS[3].videoThumbUrl,
      isLive: true,
      prompt: DEMO_VIDEO_PROMPTS[3].aboutPrompt,
    },
    {
      id: 'ping-r3',
      name: 'Aisha',
      age: 23,
      neighborhood: 'Buckhead',
      videoThumbUrl: DEMO_VIDEO_PROMPTS[2].videoThumbUrl,
      isLive: true,
      prompt: DEMO_VIDEO_PROMPTS[2].aboutPrompt,
    },
  ],
  sent: [
    {
      id: 'ping-s1',
      name: 'Jordan',
      age: 27,
      neighborhood: 'Old Fourth Ward',
      videoThumbUrl: DEMO_VIDEO_PROMPTS[1].videoThumbUrl,
      isLive: true,
      prompt: TONIGHT_SIGNATURE_PROMPT.text,
    },
  ],
  matches: [
    {
      id: 'ping-m1',
      name: 'Maya',
      age: 24,
      neighborhood: 'Midtown',
      videoThumbUrl: DEMO_VIDEO_PROMPTS[0].videoThumbUrl,
      isLive: true,
      prompt: 'You both want to meet tonight.',
      conversationId: 'preview',
      matchId: 'match-maya',
    },
  ],
} as const;

function tonightAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export const DEMO_DATES = [
  {
    id: 'date-tonight-maya',
    partnerName: 'Maya',
    scheduledAt: tonightAt(20, 30),
    venueName: 'Barcelona Wine Bar',
    neighborhood: 'Midtown',
    activityLabel: 'Drinks',
    status: 'accepted' as const,
    section: 'tonight' as const,
    photoUrl: DEMO_VIDEO_PROMPTS[0].videoThumbUrl,
  },
  {
    id: 'date-up-jordan',
    partnerName: 'Jordan',
    scheduledAt: tonightAt(19, 0),
    venueName: 'Two Urban Licks',
    neighborhood: 'Old Fourth Ward',
    activityLabel: 'Dinner',
    status: 'proposed' as const,
    section: 'upcoming' as const,
    photoUrl: DEMO_VIDEO_PROMPTS[1].videoThumbUrl,
  },
];
