/** Normalize pg's timestamps/int8 values without changing domain identities. */
export function mapPostgresRow<T>(row: Record<string, unknown>, idField = 'id'): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const name = key === 'id' ? idField : key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const converted = value instanceof Date ? value.toISOString()
      : ['version', 'current_version', 'reviewed_version'].includes(key) && value !== null ? BigInt(String(value)) : value;
    return [name, converted];
  })) as T;
}

export function mapFirstPostgresRow<T>(rows: readonly Record<string, unknown>[], idField = 'id'): T | null {
  return rows[0] === undefined ? null : mapPostgresRow<T>(rows[0], idField);
}
