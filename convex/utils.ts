export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function nowMs(): number {
  return Date.now();
}
