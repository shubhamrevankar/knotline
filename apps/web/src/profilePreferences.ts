export type InterfacePreferences = Readonly<{
  motion: "system" | "reduce";
  contrast: "standard" | "high";
  density: "comfortable" | "compact";
}>;

const storageKey = "knotline.interface-preferences.v1";

export const defaultInterfacePreferences: InterfacePreferences = {
  motion: "system",
  contrast: "standard",
  density: "comfortable"
};

export function readInterfacePreferences(): InterfacePreferences {
  try {
    const value = JSON.parse(
      globalThis.localStorage.getItem(storageKey) ?? "{}"
    ) as Partial<InterfacePreferences>;
    return {
      motion: value.motion === "reduce" ? "reduce" : "system",
      contrast: value.contrast === "high" ? "high" : "standard",
      density: value.density === "compact" ? "compact" : "comfortable"
    };
  } catch {
    return defaultInterfacePreferences;
  }
}

export function applyInterfacePreferences(preferences: InterfacePreferences) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  root.dataset.motion = preferences.motion;
  root.dataset.contrast = preferences.contrast;
  root.dataset.density = preferences.density;
}

export function writeInterfacePreferences(preferences: InterfacePreferences) {
  globalThis.localStorage.setItem(storageKey, JSON.stringify(preferences));
  applyInterfacePreferences(preferences);
}
