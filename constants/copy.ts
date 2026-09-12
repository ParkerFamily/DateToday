export const brand = {
  name: 'DateToday',
  short: 'd:t',
  tagline: 'Go live. Get pinged. Go out.',
  secondary: 'Single today. Date tonight.',
} as const;

export const copy = {
  offlineTitle: "You're Offline",
  offlineBody: "You're hidden from tonight's Live feed and won't receive dating pings.",
  startPinging: 'START PINGING',
  stopPinging: 'STOP PINGING',
  goLive: 'GO LIVE',
  yourePinging: "YOU'RE PINGING",
  itsAPing: "IT'S TONIGHT.",
  tonightsOn: "TONIGHT'S ON",
  seeWhosLive: 'VIEW YOUR PING',
  editTonight: 'EDIT TONIGHT',
  quietAround: "Nobody new fits tonight yet.",
  quietHint: "You're live — we'll notify you when someone matching your preferences comes online.",
  finishProfile: 'Finish your profile to go live.',
  dontMissPing: "Don't miss a match.",
  notificationPitch:
    'DateToday can work while your phone is locked. Turn on notifications so we can tell you when someone is interested.',
  locationPitch:
    'DateToday uses your location to show people who are actually available near you.',
  stopConfirmTitle: 'GO OFFLINE?',
  stopConfirmBody:
    "You'll leave tonight's live pool and stop Pinging your radius.",
  stayLive: 'Stay Live',
  goOffline: 'Go Offline',
  ageConfirm: 'I am at least 18 years old.',
  mutualBody: 'You both want to meet tonight.',
  planTheDate: 'MAKE A PLAN ⚡',
  sayHey: 'SAY HEY',
  message: 'SAY HEY',
  interested: 'INTERESTED',
  pass: 'PASS',
  interestSent: '♥ INTEREST SENT',
  itsAMatch: "IT'S A MATCH",
  itsADate: "IT'S A DATE.",
} as const;

export const tonightActivities = [
  { value: 'dinner', label: 'Dinner' },
  { value: 'drinks', label: 'Drinks' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'activity', label: 'Activity' },
  { value: 'walk', label: 'Walk' },
  { value: 'movie', label: 'Movie' },
  { value: 'chill', label: 'Chill' },
  { value: 'surprise', label: 'Surprise Me' },
] as const;

export const availabilityPresets = [
  { value: 'now', label: 'Now' },
  { value: '4_7', label: '4 PM – 7 PM' },
  { value: '7_10', label: '7 PM – 10 PM' },
  { value: 'after_10', label: 'After 10 PM' },
  { value: 'flexible', label: 'Flexible' },
  { value: 'custom', label: 'Custom' },
] as const;

export const radiusPresets = [5, 10, 15, 25, 50] as const;

/** Onboarding “Your Vibe” — up to 2. Not relationship-status boxes. */
export const datingVibes = [
  {
    value: 'food_company',
    label: 'Good food & good company',
    subtitle: 'Dinner, drinks, coffee — just don’t want to go solo.',
  },
  {
    value: 'something_fun',
    label: 'Let’s do something fun',
    subtitle: 'Activities, events, spontaneous plans.',
  },
  {
    value: 'dating_open',
    label: 'Dating & seeing where it goes',
    subtitle: null,
  },
  {
    value: 'something_real',
    label: 'Looking for something real',
    subtitle: null,
  },
  {
    value: 'casual',
    label: 'Keeping it casual',
    subtitle: null,
  },
  {
    value: 'open_vibe',
    label: 'Open to the vibe',
    subtitle: null,
  },
] as const;

/** @deprecated use datingVibes */
export const datingIntentions = datingVibes;

export const interestOptions = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'everyone', label: 'Everyone' },
] as const;