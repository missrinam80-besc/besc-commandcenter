export function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
