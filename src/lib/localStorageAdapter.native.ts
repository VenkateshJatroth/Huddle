// Native storage adapter (Android & iOS)
// Explicitly polyfills globalThis.localStorage backed by SQLite
import "expo-sqlite/localStorage/install";

export function getLocalStorage(): Storage | undefined {
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return undefined;
}

