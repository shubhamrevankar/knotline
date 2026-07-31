const UUID_HEX_LENGTH = 32;

const hashSeed = (value: string): number => {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const nextState = (state: number): number => {
  let next = state || 0x9e3779b9;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
};

const formatUuid = (hex: string): string => {
  const versioned = `${hex.slice(0, 12)}4${hex.slice(13)}`;
  const variant = `${versioned.slice(0, 16)}8${versioned.slice(17)}`;
  return [
    variant.slice(0, 8),
    variant.slice(8, 12),
    variant.slice(12, 16),
    variant.slice(16, 20),
    variant.slice(20)
  ].join("-");
};

export class DeterministicIdGenerator {
  readonly #seed: string;
  #sequence = 0;

  constructor(seed = "knotline-tests") {
    if (seed.length === 0) {
      throw new RangeError("The deterministic ID seed must not be empty.");
    }
    this.#seed = seed;
  }

  next(namespace = "id"): string {
    if (namespace.length === 0) {
      throw new RangeError("The deterministic ID namespace must not be empty.");
    }

    let state = hashSeed(`${this.#seed}:${namespace}:${String(this.#sequence)}`);
    let hex = "";
    while (hex.length < UUID_HEX_LENGTH) {
      state = nextState(state);
      hex += state.toString(16).padStart(8, "0");
    }
    this.#sequence += 1;
    return formatUuid(hex.slice(0, UUID_HEX_LENGTH));
  }

  nextPrefixed(prefix: string): string {
    if (!/^[a-z][a-z0-9_]*$/u.test(prefix)) {
      throw new RangeError("ID prefixes must be lower-case identifiers.");
    }
    return `${prefix}_${this.next(prefix)}`;
  }
}
