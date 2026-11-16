// Shared by every list search: Unicode-normalized, case-insensitive, whitespace-collapsed terms.
export const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export const searchTerms = (query: string): string[] => normalize(query).split(' ').filter(Boolean);
