// Kleine hulpjes om gegevens op de telefoon te bewaren (localStorage).
// Alles is "best effort": in een privévenster of bij volle opslag werkt de app gewoon door zonder.

export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* opslag vol of geblokkeerd */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* */
  }
}
