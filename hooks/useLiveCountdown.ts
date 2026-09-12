import { useEffect, useState } from 'react';
import { formatRemaining } from '@/utils/time';

export interface LiveCountdown {
  remaining: string;
  expired: boolean;
  msLeft: number;
  now: Date;
}

export function useLiveCountdown(expiresAt: string | null | undefined): LiveCountdown {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) {
    return {
      remaining: '00:00:00',
      expired: true,
      msLeft: 0,
      now,
    };
  }

  const msLeft = Math.max(0, new Date(expiresAt).getTime() - now.getTime());
  return {
    remaining: formatRemaining(expiresAt, now),
    expired: msLeft <= 0,
    msLeft,
    now,
  };
}
