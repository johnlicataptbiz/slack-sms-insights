import '@testing-library/jest-dom';

// Vitest's jsdom environment can surface a minimal localStorage implementation
// during some runs, so we provide a stable in-memory shim for components that
// persist UI state as part of their mount cycle.
if (typeof window !== 'undefined') {
  const store = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    },
    configurable: true,
  });
}
