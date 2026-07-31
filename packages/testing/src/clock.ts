export interface Clock {
  now(): Date;
  nowMs(): number;
  sleep(durationMs: number): Promise<void>;
}

interface PendingSleep {
  readonly dueAtMs: number;
  readonly order: number;
  readonly resolve: () => void;
}

const toEpochMilliseconds = (instant: Date | number | string): number => {
  const milliseconds =
    instant instanceof Date
      ? instant.getTime()
      : typeof instant === "string"
        ? Date.parse(instant)
        : instant;

  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("Clock instants must resolve to a finite epoch timestamp.");
  }
  return milliseconds;
};

const requireDuration = (durationMs: number): void => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("Clock durations must be finite and non-negative.");
  }
};

export class FakeClock implements Clock {
  readonly #sleeps: PendingSleep[] = [];
  #currentMs: number;
  #nextOrder = 0;

  constructor(initialInstant: Date | number | string = "2026-01-01T00:00:00.000Z") {
    this.#currentMs = toEpochMilliseconds(initialInstant);
  }

  now(): Date {
    return new Date(this.#currentMs);
  }

  nowMs(): number {
    return this.#currentMs;
  }

  pendingSleepCount(): number {
    return this.#sleeps.length;
  }

  sleep(durationMs: number): Promise<void> {
    requireDuration(durationMs);
    if (durationMs === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.#sleeps.push({
        dueAtMs: this.#currentMs + durationMs,
        order: this.#nextOrder,
        resolve
      });
      this.#nextOrder += 1;
      this.#sleeps.sort((left, right) => left.dueAtMs - right.dueAtMs || left.order - right.order);
    });
  }

  set(instant: Date | number | string): void {
    const nextMs = toEpochMilliseconds(instant);
    if (nextMs < this.#currentMs) {
      throw new RangeError("FakeClock cannot move backwards.");
    }
    this.#currentMs = nextMs;
    this.#resolveDueSleeps();
  }

  advanceBy(durationMs: number): void {
    requireDuration(durationMs);
    this.#currentMs += durationMs;
    this.#resolveDueSleeps();
  }

  #resolveDueSleeps(): void {
    while (this.#sleeps[0]?.dueAtMs !== undefined && this.#sleeps[0].dueAtMs <= this.#currentMs) {
      this.#sleeps.shift()?.resolve();
    }
  }
}
