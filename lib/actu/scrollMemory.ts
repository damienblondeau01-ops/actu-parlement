// lib/actu/scrollMemory.ts
type Snap = {
  offset: number;
  focusId?: string;
  ts: number;
};

const mem = new Map<string, Snap>();

export function setScrollSnap(key: string, snap: { offset: number; focusId?: string }) {
  mem.set(key, {
    offset: Math.max(0, Number(snap.offset) || 0),
    focusId: snap.focusId,
    ts: Date.now(),
  });
}

export function getScrollSnap(key: string): Snap | null {
  return mem.get(key) ?? null;
}

export function clearScrollSnap(key: string) {
  mem.delete(key);
}
