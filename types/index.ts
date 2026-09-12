export type AccountStatus = 'active' | 'suspended' | 'banned' | 'deleted';
export type UserRole = 'user' | 'moderator' | 'admin';
export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'failed'
  | 'manual_review';

export type DatingIntention =
  | 'food_company'
  | 'something_fun'
  | 'dating_open'
  | 'something_real'
  | 'casual'
  | 'open_vibe'
  // Legacy values — mapped away in UI
  | 'long_term'
  | 'short_term'
  | 'open'
  | 'figuring_out';

export type InterestOption = 'men' | 'women' | 'everyone';

export type LiveSessionStatus = 'active' | 'expired' | 'ended';

export type PingStatus = 'pending' | 'mutual' | 'withdrawn' | 'expired' | 'rejected';

export type MatchStatus = 'active' | 'unmatched' | 'blocked';

export type DateStatus =
  | 'proposed'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type TonightActivity =
  | 'dinner'
  | 'drinks'
  | 'coffee'
  | 'activity'
  | 'walk'
  | 'movie'
  | 'chill'
  | 'surprise';

export type RadiusMiles = 5 | 10 | 15 | 25 | 50;

export type FoodCuisine =
  | 'italian'
  | 'mexican'
  | 'sushi'
  | 'steakhouse'
  | 'american'
  | 'seafood'
  | 'anything';

export type SubscriptionStatus =
  | 'inactive'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'trialing';

export type ReportReason =
  | 'harassment'
  | 'fake_profile'
  | 'impersonation'
  | 'scam_fraud'
  | 'underage'
  | 'sexual_content'
  | 'threatening'
  | 'hate_speech'
  | 'spam'
  | 'inappropriate_offline'
  | 'scam_spam'
  | 'inappropriate_content'
  | 'safety_concern'
  | 'no_show'
  | 'other';

export interface AppUser {
  id: string;
  email: string | null;
  dateOfBirth: string;
  ageConfirmedAt: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  communityStandardsAcceptedAt: string | null;
  onboardingCompletedAt: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  userId: string;
  displayName: string;
  bio: string | null;
  /** YYYY-MM-DD — private; used for 18+ completion, not shown publicly */
  dateOfBirth?: string | null;
  genderId: string | null;
  datingIntention: DatingIntention | null;
  heightCm: number | null;
  occupation: string | null;
  school: string | null;
  hometown: string | null;
  neighborhoodLabel: string | null;
  zodiac: string | null;
  /** Optional lifestyle / profile extras — stored on users + profiles when set */
  pronouns?: string | null;
  drinking?: string | null;
  smoking?: string | null;
  interests?: string[] | null;
  foodPreference?: string | null;
  verificationStatus: VerificationStatus;
  mainPhotoUrl: string | null;
  /** Up to 3 profile photos; index 0 is main (mirrors mainPhotoUrl). */
  photoUrls?: string[];
  aboutPromptId?: string | null;
  aboutPromptText?: string | null;
  aboutVideoUrl?: string | null;
  tonightPromptId?: string | null;
  tonightPromptText?: string | null;
  tonightVideoUrl?: string | null;
  profileCompletion: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export interface DatingPreferences {
  userId: string;
  interestedIn: InterestOption;
  minAge: number;
  maxAge: number;
  maxDistanceMiles: number;
  intentions: DatingIntention[];
}

export type ProfileVideoKind =
  | 'about_you'
  | 'tonight_signature'
  | 'tonight_chemistry'
  | 'tonight_clip';

export interface ProfileVideo {
  id: string;
  userId: string;
  promptId: string | null;
  promptText: string;
  kind: ProfileVideoKind;
  videoUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
  sortOrder: number;
}

export interface LiveSession {
  id: string;
  userId: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  status: LiveSessionStatus;
  radiusMiles: RadiusMiles;
  availableFrom: string | null;
  availableUntil: string | null;
  availabilityLabel: string | null;
  activities?: TonightActivity[];
  /** Optional when Dinner is selected — not a dating preference */
  foodCuisines?: FoodCuisine[];
  /** Tonight Boost active for this Ping session only */
  isBoosted?: boolean;
  boostedAt?: string | null;
}

export interface DiscoveryVideoPrompt {
  promptId: string;
  promptText: string;
  kind: ProfileVideoKind;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number;
}

export interface DiscoveryCard {
  userId: string;
  displayName: string;
  age: number;
  neighborhoodLabel: string | null;
  distanceMiles: number;
  verificationStatus: VerificationStatus;
  datingIntention: DatingIntention | null;
  bio: string | null;
  mainPhotoUrl: string | null;
  liveSessionId: string;
  liveUntil: string;
  availabilityLabel: string | null;
  activities: TonightActivity[];
  isBoosted: boolean;
  rankScore: number;
  /** Signature first, then About You — curated prompts only */
  videoPrompts: DiscoveryVideoPrompt[];
  foodCuisines?: FoodCuisine[];
}

export interface Ping {
  id: string;
  senderId: string;
  recipientId: string;
  senderLiveSessionId: string;
  recipientLiveSessionId: string;
  status: PingStatus;
  createdAt: string;
  expiresAt: string;
}

export interface Match {
  id: string;
  userAId: string;
  userBId: string;
  matchedAt: string;
  status: MatchStatus;
}

export interface Conversation {
  id: string;
  matchId: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface PlannedDate {
  id: string;
  matchId: string;
  proposedBy: string;
  scheduledAt: string;
  activityLabel: string | null;
  venueName: string | null;
  venueAddress: string | null;
  neighborhoodLabel: string | null;
  status: DateStatus;
}

export interface SendPingResult {
  ping: Ping;
  mutual: boolean;
  matchId?: string;
  conversationId?: string;
}

export interface ProfileCompletionRequirements {
  name: boolean;
  age: boolean;
  gender: boolean;
  preference: boolean;
  mainPhoto: boolean;
  videos: boolean;
  location: boolean;
  communityStandards: boolean;
}

export type EntitlementKey =
  | 'unlimited_pings'
  | 'unlimited_messages'
  | 'advanced_filters'
  | 'see_all_received_pings'
  | 'extended_radius'
  | 'priority_discovery'
  | 'saved_filters'
  | 'read_receipts';
