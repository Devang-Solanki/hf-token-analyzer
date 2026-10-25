/**
 * The shape every provider reduces its token to.
 *
 * The UI renders this and nothing else, so adding a provider means writing an
 * analyzer - never touching a component. Anything a provider cannot determine
 * is represented explicitly rather than defaulted, because a confident wrong
 * answer about a credential's reach is worse than an admitted gap.
 */

export type Severity = 'contained' | 'elevated' | 'breach' | 'total';

/** 'info' means "we could not establish this", and renders without colour. */
export type Level = Severity | 'info';

export interface Verdict {
  level: Level;
  headline: string;
  summary: string;
}

export interface Finding {
  level: Level;
  title: string;
  detail: string;
}

export interface PermissionEntry {
  label: string;
  allowed: boolean;
  /** Marks a permission that can change state, not just read it. */
  risky?: boolean;
}

/**
 * Expiry is a tri-state. GitHub returns it in a header browsers are not allowed
 * to read, so "unknown" has to be a first-class answer - treating it as "never"
 * would invent a finding that may not be true.
 */
export type Expiry =
  | { kind: 'never' }
  | { kind: 'at'; iso: string }
  | { kind: 'unknown'; reason: string };

export interface Identity {
  handle: string;
  fullname?: string;
  url: string;
  avatarUrl?: string;
  email?: string | null;
  badges: string[];
}

export interface AccountRef {
  handle: string;
  fullname?: string;
  url: string;
  avatarUrl?: string;
  role?: string;
  badges: string[];
  /** Things that may block this token, e.g. SAML SSO or an IP allowlist. */
  warnings: string[];
}

export interface ScopeEntry {
  /** What the scope names: a repository, or a whole account. */
  target: 'repository' | 'account' | 'other';
  label: string;
  kind: string;
  permissions: string[];
}

export interface ResourceRef {
  id: string;
  url: string;
  kind: string;
  /** Restricted in some way. What that means is named by `visibilityLabel`. */
  private: boolean;
  /**
   * Overrides the private/public wording. A GitHub secret gist is unlisted
   * rather than private - anyone with the link can read it - so calling it
   * "Private" would overstate how protected it is.
   */
  visibilityLabel?: string;
  gated?: boolean;
  writable?: boolean;
  downloads?: number;
  likes?: number;
}

export interface ResourceGroup {
  owner: string;
  role?: string;
  writable?: boolean;
  truncated: boolean;
  resources: ResourceRef[];
}

export interface TokenReport {
  provider: string;
  providerName: string;
  isValid: boolean;
  error?: string;

  tokenName?: string;
  /** Human label for the credential type, e.g. "Classic personal access token". */
  tokenKind: string;
  createdAt?: string;
  expiry: Expiry;

  identity?: Identity;
  accounts: AccountRef[];
  /** What this provider calls a container of resources. Default "Organizations". */
  accountsLabel?: string;
  /** What this provider calls the resources themselves. Default "Repositories". */
  resourcesLabel?: string;
  permissions: PermissionEntry[];
  scopes: ScopeEntry[];
  /** The provider's own scope strings, shown verbatim so they can be compared. */
  rawScopes: string[];

  verdict: Verdict;
  findings: Finding[];
  /** Standing limitations of analysing this provider from a browser. */
  notes: string[];
}

export interface Provider {
  id: string;
  name: string;
  /** Where a user creates a token, shown in the empty state. */
  tokenUrl: string;
  /** Recognises the credential from its format alone, before any request. */
  detect(token: string): boolean;
  analyze(token: string): Promise<TokenReport>;
  /** Listing is opt-in because it costs extra requests against the provider. */
  listResources(token: string, report: TokenReport): Promise<ResourceGroup[]>;
}

export const SEVERITY_RANK: Record<Level, number> = {
  info: 0,
  contained: 1,
  elevated: 2,
  breach: 3,
  total: 4,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[b.level] - SEVERITY_RANK[a.level]);
}

/** Join for prose: "a", "a and b", "a, b and c". */
export function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function invalidReport(
  provider: Pick<Provider, 'id' | 'name'>,
  error: string
): TokenReport {
  return {
    provider: provider.id,
    providerName: provider.name,
    isValid: false,
    error,
    tokenKind: 'unknown',
    expiry: { kind: 'unknown', reason: 'The token could not be read.' },
    accounts: [],
    permissions: [],
    scopes: [],
    rawScopes: [],
    verdict: { level: 'info', headline: 'Not readable', summary: error },
    findings: [],
    notes: [],
  };
}
