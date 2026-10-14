import { create } from 'zustand';
import type { RoomId, RoomLive } from '@/features/explore/rooms';

/** "Go Live in Foodie" from Explore Tonight, handed to the Live screen, which owns going Live. */
export type RoomGoLive = RoomLive & { room: RoomId };

type State = {
  /** The room the Live feed is showing; null = everyone Live. */
  room: RoomId | null;
  setRoom: (room: RoomId | null) => void;
  goLive: RoomGoLive | null;
  requestGoLive: (request: RoomGoLive) => void;
  takeGoLive: () => RoomGoLive | null;
};

export const useExploreRoom = create<State>((set, get) => ({
  room: null,
  setRoom: (room) => set({ room }),
  goLive: null,
  requestGoLive: (goLive) => set({ goLive }),
  takeGoLive: () => {
    const { goLive } = get();
    if (goLive) set({ goLive: null });
    return goLive;
  },
}));
