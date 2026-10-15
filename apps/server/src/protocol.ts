import { z } from 'zod';
import type { ClientToServer } from '@koth/shared';

const slotIndex = z.union([z.literal(0), z.literal(1)]);

const clientMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    role: z.enum(['cabinet', 'controller']),
    name: z.string().max(64).optional(),
  }),
  z.object({ type: z.literal('input'), side: z.enum(['left', 'right', 'plunger']), pressed: z.boolean() }),
  z.object({ type: z.literal('hazard'), kind: z.enum(['tilt', 'extraBumper', 'invertGravity']), target: slotIndex }),
  z.object({ type: z.literal('drain'), loserSlot: slotIndex }),
  z.object({ type: z.literal('score'), slot: slotIndex, rallyPoints: z.number().int().min(0).max(10_000_000) }),
]);

/** Parses and validates a raw socket frame. Returns null for anything malformed. */
export function parseClientMessage(raw: string): ClientToServer | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = clientMessage.safeParse(json);
  return result.success ? (result.data satisfies ClientToServer) : null;
}

export function sanitizeName(name: string | undefined, fallback: string): string {
  const clean = (name ?? '').replace(/[^\p{L}\p{N} _.\-!?]/gu, '').trim().slice(0, 16);
  return clean.length > 0 ? clean : fallback;
}
