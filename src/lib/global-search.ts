export type SearchResult = {
  id: string;
  title: string;
  source: string;
  sourceLabel: string;
  href: string;
  status: string;
  updatedAt: string;
  description?: string;
};

export const searchSourceLabels: Record<string, string> = {
  task: "Taken",
  project: "Projecten",
  inbox: "Inbox",
  content: "Content",
  social: "Social",
  event: "Events",
  sponsor: "Sponsors",
  campaign: "Campagnes",
  community: "Community",
  knowledge: "Kennisbank",
  meeting: "Vergaderingen",
  administration: "VZW-administratie",
  shop: "Shop",
  history: "Historiek",
};

export function searchPattern(query: string) {
  const cleaned = query.trim().replace(/[%_]/g, "");
  return `%${cleaned}%`;
}

export function rankSearchResults(results: SearchResult[], query: string) {
  const needle = query.trim().toLocaleLowerCase("nl-BE");
  return [...results].sort((left, right) => {
    const leftTitle = left.title.toLocaleLowerCase("nl-BE");
    const rightTitle = right.title.toLocaleLowerCase("nl-BE");
    const score = (title: string) => title === needle ? 3 : title.startsWith(needle) ? 2 : title.includes(needle) ? 1 : 0;
    return score(rightTitle) - score(leftTitle) || right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function groupSearchResults(results: SearchResult[]) {
  return results.reduce<Record<string, SearchResult[]>>((groups, result) => {
    (groups[result.source] ??= []).push(result);
    return groups;
  }, {});
}
