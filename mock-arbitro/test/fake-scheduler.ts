import type { Scheduler } from "../src/arbiter.js";

/** Reloj y timers falsos: el tiempo solo avanza con `advance(ms)`. */
export class FakeScheduler implements Scheduler {
  private time = Date.parse("2026-11-05T14:00:00.000Z");
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.time;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + ms, fn });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** Avanza el reloj y ejecuta, en orden, los timers que vencen (incluidos los que se crean mientras tanto). */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      let nextId: number | undefined;
      let nextAt = Infinity;
      for (const [id, t] of this.timers) {
        if (t.at <= target && t.at < nextAt) {
          nextAt = t.at;
          nextId = id;
        }
      }
      if (nextId === undefined) break;
      const timer = this.timers.get(nextId)!;
      this.timers.delete(nextId);
      this.time = timer.at;
      timer.fn();
    }
    this.time = target;
  }
}
