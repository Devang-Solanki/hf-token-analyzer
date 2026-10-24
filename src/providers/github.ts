import { paginate } from './http';
import {
  invalidReport,
  listPhrase,
  sortFindings,
  type AccountRef,
  type Expiry,
  type Finding,
  type Level,
  type PermissionEntry,
  type Provider,
  type ResourceGroup,
  type TokenReport,
  type Verdict,
} from './types';

const API = 'https://api.github.com';
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

const ID = 'github';
const NAME = 'GitHub';

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Token formats are documented at
 * https://github.blog/2021-04-05-behind-githubs-new-authentication-token-formats/
 * The 40-hex form is a legacy classic PAT, kept because they still work.
 */
const PREFIXES = ['ghp_', 'github_pat_', 'gho_', 'ghu_', 'ghs_', 'ghr_'];

function detect(token: string): boolean {
  const value = token.trim();
  if (PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
  return /^[0-9a-f]{40}$/.test(value);
}

const TOKEN_KINDS: Record<string, string> = {
  ghp_: 'Classic personal access token',
  github_pat_: 'Fine-grained personal access token',
  gho_: 'OAuth app token',
  ghu_: 'GitHub App user token',
  ghs_: 'GitHub App installation token',
  ghr_: 'GitHub App refresh token',
};

function describeKind(token: string, hasScopeHeader: boolean): { kind: string; fineGrained: boolean } {
  const value = token.trim();
  for (const [prefix, label] of Object.entries(TOKEN_KINDS)) {
    if (value.startsWith(prefix)) {
      // Only classic tokens carry an X-OAuth-Scopes header. Everything else
      // either uses fine-grained permissions or an app's installation grants,
      // none of which GitHub reports through the API.
      return { kind: label, fineGrained: prefix !== 'ghp_' && prefix !== 'gho_' };
    }
  }
  return {
    kind: hasScopeHeader ? 'Classic personal access token' : 'Token of unrecognised format',
    fineGrained: !hasScopeHeader,
  };
}

/**
 * Capabilities a responder actually asks about, derived from GitHub's scopes.
 * One scope can grant several, which is the point: `repo` alone is both read
 * and write over every private repository the account can reach.
 */
const CAPABILITIES: { label: string; risky?: boolean; scopes: string[] }[] = [
  { label: 'Read private repositories', scopes: ['repo'] },
  { label: 'Write to private repositories', risky: true, scopes: ['repo'] },
  { label: 'Write to public repositories', risky: true, scopes: ['repo', 'public_repo'] },
  { label: 'Delete repositories', risky: true, scopes: ['delete_repo'] },
  { label: 'Change Actions workflows', risky: true, scopes: ['workflow'] },
  { label: 'Read packages', scopes: ['repo', 'read:packages', 'write:packages'] },
  { label: 'Publish packages', risky: true, scopes: ['write:packages'] },
  { label: 'Delete packages', risky: true, scopes: ['delete:packages'] },
  { label: 'Read organization membership', scopes: ['read:org', 'write:org', 'admin:org'] },
  { label: 'Administer organizations', risky: true, scopes: ['admin:org'] },
  {
    label: 'Manage repository webhooks',
    risky: true,
    scopes: ['repo', 'write:repo_hook', 'admin:repo_hook'],
  },
  {
    label: 'Add SSH keys to the account',
    risky: true,
    scopes: ['write:public_key', 'admin:public_key'],
  },
  { label: 'Add GPG keys to the account', risky: true, scopes: ['write:gpg_key', 'admin:gpg_key'] },
  { label: 'Create and edit gists', risky: true, scopes: ['gist'] },
  { label: 'Read account email', scopes: ['user', 'user:email', 'read:user'] },
  { label: 'Change account profile', risky: true, scopes: ['user'] },
  { label: 'Read security alerts', scopes: ['repo', 'security_events'] },
  { label: 'Read Codespaces secrets', risky: true, scopes: ['codespace', 'codespace:secrets'] },
  { label: 'Administer the enterprise', risky: true, scopes: ['admin:enterprise'] },
  {
    label: 'Manage billing',
    risky: true,
    scopes: ['manage_billing:enterprise', 'manage_billing:copilot'],
  },
  { label: 'Read the audit log', scopes: ['audit_log', 'read:audit_log'] },
];

/** Scopes that let the holder keep access after the token itself is revoked. */
const PERSISTENCE_SCOPES = ['write:public_key', 'admin:public_key', 'write:gpg_key', 'admin:gpg_key'];
/** Scopes that amount to control of the account or its organizations. */
const TAKEOVER_SCOPES = ['admin:org', 'delete_repo', 'admin:enterprise', ...PERSISTENCE_SCOPES];
const WRITE_SCOPES = [
  'repo',
  'public_repo',
  'workflow',
  'write:packages',
  'delete:packages',
  'write:org',
  'write:repo_hook',
  'admin:repo_hook',
  'gist',
  'user',
  'codespace',
  'codespace:secrets',
];

function buildPermissions(scopes: Set<string>): PermissionEntry[] {
  return CAPABILITIES.map(({ label, risky, scopes: grants }) => ({
    label,
    risky,
    allowed: grants.some((scope) => scopes.has(scope)),
  }));
}

function buildVerdict(scopes: Set<string>, fineGrained: boolean): Verdict {
  if (fineGrained) {
    return {
      level: 'info',
      headline: 'Permissions not disclosed',
      summary:
        'GitHub does not report which permissions a fine-grained or app token holds, so its reach cannot be read from the token itself. List the repositories under Access to see what it actually opens.',
    };
  }

  const held = (list: string[]) => list.filter((scope) => scopes.has(scope));

  const takeover = held(TAKEOVER_SCOPES);
  if (takeover.length > 0) {
    return {
      level: 'total',
      headline: 'Can take over the account',
      summary: `${listPhrase(takeover.map((s) => `\`${s}\``))} ${
        takeover.length === 1 ? 'grants' : 'grant'
      } control of the account or its organizations. Treat a leak of this token as a full account compromise, not a repository one.`,
    };
  }

  if (scopes.has('repo')) {
    return {
      level: 'elevated',
      headline: 'Full control of every repository it can reach',
      summary:
        'The `repo` scope is not limited to your own repositories: it covers every private repository this account can access, organization repositories included.',
    };
  }

  const writes = held(WRITE_SCOPES);
  if (writes.length > 0) {
    return {
      level: 'elevated',
      headline: 'Can change things',
      summary: `${listPhrase(writes.map((s) => `\`${s}\``))} ${
        writes.length === 1 ? 'allows' : 'allow'
      } writes. Nothing here reaches private repository contents.`,
    };
  }

  if (scopes.size === 0) {
    return {
      level: 'contained',
      headline: 'Public read-only access',
      summary:
        'This token holds no scopes. It can read public data and the account profile, and change nothing.',
    };
  }

  return {
    level: 'contained',
    headline: 'Read-only access',
    summary: 'Every scope on this token is a read scope. Nothing can be changed with it.',
  };
}

function buildFindings(
  scopes: Set<string>,
  fineGrained: boolean,
  ssoHeader: string | null
): Finding[] {
  const findings: Finding[] = [];
  const has = (scope: string) => scopes.has(scope);

  if (has('admin:org')) {
    findings.push({
      level: 'total',
      title: 'Can administer organizations',
      detail:
        '`admin:org` can add and remove members, change team permissions and alter organization settings. A leak reaches every repository the organization owns, not just this account.',
    });
  }

  if (has('delete_repo')) {
    findings.push({
      level: 'total',
      title: 'Can delete repositories',
      detail: '`delete_repo` permanently removes repositories. There is no undo on the API.',
    });
  }

  if (has('admin:enterprise')) {
    findings.push({
      level: 'total',
      title: 'Can administer the enterprise',
      detail: '`admin:enterprise` reaches enterprise-wide policy and every organization under it.',
    });
  }

  const persistence = PERSISTENCE_SCOPES.filter(has);
  if (persistence.length > 0) {
    findings.push({
      level: 'total',
      title: 'Can plant credentials that outlive the token',
      detail: `${listPhrase(
        persistence.map((s) => `\`${s}\``)
      )} can add an SSH or signing key to the account. A key added this way keeps working after this token is revoked, so revoking alone does not end the access - audit the account's keys too.`,
    });
  }

  if (has('repo')) {
    findings.push({
      level: 'elevated',
      title: 'Reaches every private repository',
      detail:
        '`repo` is account-wide, not repository-specific. It covers private repositories owned by organizations this account belongs to. A fine-grained token naming only the repositories the job touches limits the damage.',
    });
  }

  if (has('workflow')) {
    findings.push({
      level: 'elevated',
      title: 'Can change CI workflows',
      detail:
        '`workflow` can commit changes to `.github/workflows`. A pushed workflow runs with the repository\'s own secrets, so this scope is a path to every other credential stored there.',
    });
  }

  if (has('write:packages')) {
    findings.push({
      level: 'elevated',
      title: 'Can publish packages',
      detail:
        '`write:packages` publishes to the account\'s registries. Anything consuming those packages trusts what this token pushes.',
    });
  }

  if (has('codespace') || has('codespace:secrets')) {
    findings.push({
      level: 'elevated',
      title: 'Reaches Codespaces secrets',
      detail: 'Codespaces secrets are development credentials, often for other systems entirely.',
    });
  }

  if (has('gist')) {
    findings.push({
      level: 'elevated',
      title: 'Reaches every gist on the account',
      detail:
        '`gist` reads secret gists as well as public ones, and secret only means unlisted - not private. Gists are a common resting place for config files and keys pasted in a hurry. The same scope publishes new gists under the account\'s name, which makes it an exfiltration route as well as a disclosure one.',
    });
  }

  if (ssoHeader) {
    findings.push({
      level: 'elevated',
      title: 'SAML authorization required',
      detail:
        'GitHub reported that this token is not authorized for at least one SAML-protected organization. Repository listings here will be missing whatever those organizations own.',
    });
  }

  if (fineGrained) {
    findings.push({
      level: 'info',
      title: 'Permissions cannot be listed',
      detail:
        'GitHub exposes no endpoint that reports a fine-grained or app token\'s permissions. Establishing them would mean calling each endpoint to see what succeeds, which this tool does not do with a credential that may not be yours.',
    });
  } else if (scopes.size === 0) {
    findings.push({
      level: 'contained',
      title: 'No scopes granted',
      detail: 'A classic token with no scopes reads public data only. This is the safest it gets.',
    });
  }

  findings.push({
    level: 'info',
    title: 'Expiry cannot be read',
    detail:
      'GitHub returns token expiry in a response header it does not expose to browsers, so this tool cannot see it. Check the token in your GitHub settings to confirm whether it expires.',
  });

  return sortFindings(findings);
}

interface GitHubUser {
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url: string;
  html_url: string;
  two_factor_authentication?: boolean;
  site_admin?: boolean;
  plan?: { name: string };
}

interface GitHubOrg {
  login: string;
  description?: string | null;
  avatar_url: string;
}

interface GitHubGist {
  id: string;
  html_url: string;
  description?: string | null;
  public: boolean;
  files?: Record<string, { filename?: string }>;
  owner?: { login: string };
}

interface GitHubRepo {
  full_name: string;
  html_url: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  stargazers_count?: number;
  owner: { login: string };
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

async function analyze(token: string): Promise<TokenReport> {
  let response: Response;
  try {
    response = await fetch(`${API}/user`, { headers: headers(token) });
  } catch {
    return invalidReport(
      { id: ID, name: NAME },
      'Could not reach api.github.com. Check your connection.'
    );
  }

  if (response.status === 401) {
    return invalidReport({ id: ID, name: NAME }, 'GitHub rejected this token as invalid or revoked.');
  }
  if (!response.ok) {
    return invalidReport(
      { id: ID, name: NAME },
      `GitHub answered ${response.status}. A rate limit or an organization policy may be blocking this token.`
    );
  }

  const user = (await response.json()) as GitHubUser;
  const scopeHeader = response.headers.get('X-OAuth-Scopes');
  const ssoHeader = response.headers.get('X-GitHub-SSO');
  const scopes = new Set(
    (scopeHeader ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  );

  const { kind, fineGrained } = describeKind(token, scopeHeader !== null);

  // Organizations need read:org on a classic token, so a refusal here is
  // expected rather than an error worth surfacing.
  let accounts: AccountRef[] = [];
  try {
    const orgsResponse = await fetch(`${API}/user/orgs?per_page=${PAGE_SIZE}`, {
      headers: headers(token),
    });
    if (orgsResponse.ok) {
      const orgs = (await orgsResponse.json()) as GitHubOrg[];
      accounts = orgs.map((org) => ({
        handle: org.login,
        fullname: org.description ?? undefined,
        url: `https://github.com/${org.login}`,
        avatarUrl: org.avatar_url,
        badges: [],
        warnings: orgsResponse.headers.get('X-GitHub-SSO') ? ['SAML authorization required'] : [],
      }));
    }
  } catch {
    /* listing organizations is best effort */
  }

  const badges: string[] = [];
  if (user.plan?.name) badges.push(user.plan.name);
  if (user.two_factor_authentication) badges.push('2FA enabled');
  if (user.site_admin) badges.push('Site admin');

  const expiry: Expiry = {
    kind: 'unknown',
    reason: 'GitHub sends token expiry in a header that browsers are not allowed to read.',
  };

  return {
    provider: ID,
    providerName: NAME,
    isValid: true,
    tokenKind: kind,
    expiry,
    identity: {
      handle: user.login,
      fullname: user.name ?? undefined,
      url: user.html_url,
      avatarUrl: user.avatar_url,
      email: user.email,
      badges,
    },
    accounts,
    permissions: fineGrained ? [] : buildPermissions(scopes),
    scopes: [],
    rawScopes: [...scopes].sort(),
    verdict: buildVerdict(scopes, fineGrained),
    findings: buildFindings(scopes, fineGrained, ssoHeader),
    notes: fineGrained
      ? ['GitHub does not report the permissions held by fine-grained or app tokens.']
      : [],
  };
}

/** A gist has no name; GitHub itself displays the first file. */
function gistLabel(gist: GitHubGist): string {
  const first = Object.keys(gist.files ?? {})[0];
  if (first) return first;
  if (gist.description) return gist.description;
  return gist.id;
}

async function listResources(token: string, report: TokenReport): Promise<ResourceGroup[]> {
  const init = { headers: headers(token) };

  const [repos, gists] = await Promise.all([
    paginate<GitHubRepo>(
      `${API}/user/repos?per_page=${PAGE_SIZE}&affiliation=owner,collaborator,organization_member&sort=updated`,
      init,
      PAGE_SIZE,
      MAX_PAGES
    ),
    // Gists hold secrets far more often than their owners remember. A token
    // without the `gist` scope is refused here, which is not an error.
    paginate<GitHubGist>(`${API}/gists?per_page=${PAGE_SIZE}`, init, PAGE_SIZE, MAX_PAGES),
  ]);

  const groups = new Map<string, ResourceGroup>();
  const groupFor = (owner: string, truncated: boolean) => {
    let group = groups.get(owner);
    if (!group) {
      group = { owner, truncated, writable: false, resources: [] };
      groups.set(owner, group);
    }
    if (truncated) group.truncated = true;
    return group;
  };

  for (const repo of repos.items) {
    const group = groupFor(repo.owner.login, repos.truncated);
    const writable = Boolean(repo.permissions?.push);
    if (writable) group.writable = true;
    group.resources.push({
      id: repo.full_name,
      url: repo.html_url,
      kind: repo.fork ? 'fork' : 'repository',
      private: repo.private,
      writable,
      likes: repo.stargazers_count,
    });
  }

  const self = report.identity?.handle;
  // Writing a gist needs the `gist` scope, not repository push rights, so this
  // is stated rather than inherited from the owner's repositories. With no
  // scope data (fine-grained and app tokens) it is left unknown.
  const gistWritable = report.rawScopes.length > 0 ? report.rawScopes.includes('gist') : undefined;

  for (const gist of gists.items) {
    const owner = gist.owner?.login ?? self;
    if (!owner) continue;
    groupFor(owner, gists.truncated).resources.push({
      id: gistLabel(gist),
      url: gist.html_url,
      kind: 'gist',
      private: !gist.public,
      visibilityLabel: gist.public ? 'Public' : 'Secret',
      writable: gistWritable,
    });
  }

  return [...groups.values()].sort((a, b) => b.resources.length - a.resources.length);
}

export const githubProvider: Provider = {
  id: ID,
  name: NAME,
  tokenUrl: 'https://github.com/settings/tokens',
  detect,
  analyze,
  listResources,
};

export const _internal = {
  buildVerdict,
  buildFindings,
  buildPermissions,
  detect,
  describeKind,
  gistLabel,
};

export type { Level };
