// Web & fallback storage adapter
export function getLocalStorage(): Storage | undefined {
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return undefined;
}

