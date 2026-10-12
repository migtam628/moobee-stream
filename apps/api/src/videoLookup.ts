// PostgreSQL parameters have a single inferred type per index.
// The UUID id and TEXT slug must not reuse the same $1 parameter.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildVideoLookup(value: string, readyOnly = false): {
  sql: string;
  params: string[];
} {
  const isUuid = UUID_PATTERN.test(value);
  // Preserve slug lookup even for a slug that looks like a UUID.
  const predicate = isUuid
    ? '(id = $1::uuid OR slug = $2::text)'
    : 'slug = $1::text';
  return {
    sql: `SELECT * FROM videos WHERE ${predicate}${readyOnly ? " AND status = 'ready'" : ''} LIMIT 1`,
    params: isUuid ? [value, value] : [value]
  };
}
