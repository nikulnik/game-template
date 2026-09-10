/** localStorage wrapped so private mode / blocked storage never throws. */
export const localStore = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

/** The same for sessionStorage, which is emptied when the tab is closed: for what a reload has to carry across and nothing else. */
export const sessionStore = {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  take(key: string): string | null {
    const value = this.get(key);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    return value;
  },
};
