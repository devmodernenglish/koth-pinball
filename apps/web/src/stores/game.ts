import { defineStore } from 'pinia';
import type { ErrorCode, GameState, Player, PlayerId, SlotIndex } from '@koth/shared';

export interface ToastMessage {
  id: number;
  code: ErrorCode;
  message: string;
}

/** Mirrors the latest server snapshot. Holds no game rules of its own. */
export const useGameStore = defineStore('game', {
  state: () => ({
    game: null as GameState | null,
    playerId: null as PlayerId | null,
    connected: false,
    toast: null as ToastMessage | null,
  }),
  getters: {
    mySlot(state): SlotIndex | null {
      const slot = state.game?.slots.find((s) => s.occupant.kind === 'human' && s.occupant.playerId === state.playerId);
      return slot ? slot.index : null;
    },
    me(state): Player | null {
      return (state.playerId && state.game?.players[state.playerId]) || null;
    },
    queuePosition(state): number | null {
      if (!state.playerId || !state.game) return null;
      const i = state.game.queue.indexOf(state.playerId);
      return i === -1 ? null : i + 1;
    },
    queueEntries(state): Player[] {
      const game = state.game;
      if (!game) return [];
      return game.queue.flatMap((id) => (game.players[id] ? [game.players[id]] : []));
    },
    humanCount(state): number {
      return Object.keys(state.game?.players ?? {}).length;
    },
  },
  actions: {
    applyState(game: GameState) {
      this.game = game;
    },
    setPlayerId(id: PlayerId | null) {
      this.playerId = id;
    },
    setConnected(connected: boolean) {
      this.connected = connected;
    },
    showToast(code: ErrorCode, message: string) {
      this.toast = { id: Date.now(), code, message };
    },
    clearToast() {
      this.toast = null;
    },
  },
});
