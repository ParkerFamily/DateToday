import React from 'react';
import { DiscoverFeed } from '@/components/discover/DiscoverFeed';

/**
 * Ping tab = feed of people your Ping found when Live.
 * Offline = teaser of tonight's pool (tap anytime) + Go Live to unlock.
 * ♥ = Interest, never Ping.
 */
export default function PingScreen() {
  return <DiscoverFeed showClose={false} />;
}
