import {
  analyzeToken,
  fetchScopedRepositories,
  fetchUserRepositories,
} from '@/services/tokenAnalyzer';
import { isExpired, timeUntil } from '@/lib/time';
import type { TokenAnalysis, TokenScope, UserRepositories } from '@/types/huggingface';
import {
  invalidReport,
  listPhrase,
  sortFindings,
  type AccountRef,
  type Expiry,
  type Finding,
  type PermissionEntry,
  type Provider,
  type ResourceGroup,
  type ResourceRef,
  type ScopeEntry,
  type Severity,
  type TokenReport,
  type Verdict,
} from './types';

const ID = 'huggingface';
const NAME = 'HuggingFace';

function detect(token: string): boolean {
  return token.trim().startsWith('hf_');
}

const TOKEN_KINDS: Record<TokenAnalysis['tokenType'], string> = {
  read: 'Read token',
  write: 'Write token',
  god: 'Administrative token',
  fineGrained: 'Fine-grained token',
  unknown: 'Token of unreported type',
};

/** Referenced when deciding whether the user's own repositories are writable. */
const WRITE_MODELS_LABEL = 'Change models';

const PERMISSIONS: {
  key: keyof TokenAnalysis['permissions'];
  label: string;
  risky?: boolean;
}[] = [
  { key: 'canReadModels', label: 'Read models' },
  { key: 'canWriteModels', label: WRITE_MODELS_LABEL, risky: true },
  { key: 'canReadDatasets', label: 'Read datasets' },
  { key: 'canWriteDatasets', label: 'Change datasets', risky: true },
  { key: 'canReadSpaces', label: 'Read spaces' },
  { key: 'canWriteSpaces', label: 'Change spaces', risky: true },
  { key: 'canAccessGatedRepos', label: 'Open gated repositories' },
  { key: 'canManageRepos', label: 'Create and delete repositories', risky: true },
  { key: 'canWriteDiscussions', label: 'Post in discussions', risky: true },
  { key: 'canWritePosts', label: 'Publish posts', risky: true },
  { key: 'canAccessBilling', label: 'See billing', risky: true },
  { key: 'canManageOrgs', label: 'Manage organizations', risky: true },
  { key: 'isAdmin', label: 'Full administrative access', risky: true },
];

const RESTRICTION_NAME: Record<string, string> = {
  mfa: 'multi-factor authentication',
  sso: 'single sign-on',
  ip: 'an IP allowlist',
  'token-policy': "the organization's token policy",
};

/**
 * A fine-grained scope names either one repository or a whole account. An
 * account scope reaches every repository under it, so the two cannot be counted
 * together without understating how far the token goes.
 */
const ACCOUNT_SCOPE_TYPES = new Set(['org', 'user']);

function splitScopes(scopes?: TokenScope[]) {
  const all = scopes ?? [];
  return {
    accounts: all.filter((scope) => ACCOUNT_SCOPE_TYPES.has(scope.entity.type)),
    repos: all.filter((scope) => !ACCOUNT_SCOPE_TYPES.has(scope.entity.type)),
  };
}

function scopeName(scope: TokenScope): string {
  return `@${scope.entity.name || scope.entity._id}`;
}

function buildVerdict(analysis: TokenAnalysis, expired: boolean): Verdict {
  if (expired) {
    return {
      level: 'breach',
      headline: 'This token no longer works',
      summary: 'It expired, so every request with it will be rejected. Issue a new one.',
    };
  }

  switch (analysis.tokenType) {
    case 'god':
      return {
        level: 'total',
        headline: 'Full administrative access',
        summary:
          'Anyone holding this token can delete repositories, change organization settings and read billing. Replace it with a scoped token unless you are certain you need all of it.',
      };
    case 'write':
      return {
        level: 'elevated',
        headline: 'Can change anything you own',
        summary:
          'This token can create, modify and delete your repositories and post as you. It cannot touch billing or organization settings.',
      };
    case 'read':
      return {
        level: 'contained',
        headline: 'Read-only access',
        summary:
          'This token can download models and datasets you can see, and nothing else. It cannot change anything.',
      };
    case 'fineGrained': {
      const { accounts, repos } = splitScopes(analysis.fineGrainedScopes);
      const writes =
        analysis.permissions.canWriteModels ||
        analysis.permissions.canWriteDatasets ||
        analysis.permissions.canWriteSpaces;
      const verb = writes ? 'change' : 'read';
      const level: Severity = writes ? 'elevated' : 'contained';

      if (accounts.length > 0) {
        return {
          level,
          headline:
            accounts.length === 1 ? 'Covers a whole account' : `Covers ${accounts.length} whole accounts`,
          summary: `A scope names ${listPhrase(
            accounts.map(scopeName)
          )} rather than individual repositories, so this token can ${verb} everything there - including repositories created after the token was issued.`,
        };
      }

      if (repos.length === 0) {
        return {
          level: 'contained',
          headline: 'Reaches no repository',
          summary:
            'This token names no repository scopes, so it cannot open any repository. Any account-wide permissions it holds are listed under Permissions.',
        };
      }

      return {
        level,
        headline:
          repos.length === 1 ? 'Scoped to 1 repository' : `Scoped to ${repos.length} repositories`,
        summary: writes
          ? 'Within those repositories this token can write. Check the list below matches what you meant to grant.'
          : 'This token reads the repositories listed below and nothing beyond them.',
      };
    }
    default:
      return {
        level: 'elevated',
        headline: 'Access level unknown',
        summary:
          'The API did not report a role for this token, so its reach cannot be established from here.',
      };
  }
}

function buildFindings(analysis: TokenAnalysis, expired: boolean): Finding[] {
  const findings: Finding[] = [];

  if (expired) {
    findings.push({
      level: 'breach',
      title: 'Token has expired',
      detail:
        'Requests with this token are rejected. Issue a replacement and update wherever it is stored.',
    });
  }

  if (analysis.tokenType === 'god') {
    findings.push({
      level: 'total',
      title: 'Administrative token',
      detail:
        'This token can do anything your account can, including deleting repositories and managing organizations. Most jobs need far less; a fine-grained token scoped to the repositories you actually touch limits the damage if it leaks.',
    });
  }

  if (analysis.tokenType === 'write') {
    findings.push({
      level: 'elevated',
      title: 'Write access across your account',
      detail:
        'Write tokens are not scoped to particular repositories, so a leak exposes everything you own. Scope it down if the job only needs a few repositories.',
    });
  }

  if (!analysis.expiresAt) {
    findings.push({
      level: 'elevated',
      title: 'No expiry set',
      detail:
        'This token stays valid until someone revokes it by hand. Set an expiry so a forgotten token stops working on its own.',
    });
  }

  const restricted = analysis.organizations.filter((org) => org.securityRestrictions?.length);
  if (restricted.length > 0) {
    const kinds = new Set<string>();
    restricted.forEach((org) =>
      org.securityRestrictions?.forEach((r) => kinds.add(RESTRICTION_NAME[r] ?? r))
    );
    const many = restricted.length > 1;
    findings.push({
      level: 'elevated',
      title: `${restricted.length} organization${many ? 's' : ''} restrict${many ? '' : 's'} access`,
      detail: `Requests may be refused until this token satisfies ${listPhrase(
        Array.from(kinds)
      )}. The repository listings here can be incomplete for ${
        many ? 'those organizations' : 'that organization'
      }.`,
    });
  }

  if (analysis.tokenType === 'fineGrained') {
    const { accounts, repos } = splitScopes(analysis.fineGrainedScopes);

    if (accounts.length > 0) {
      findings.push({
        level: 'elevated',
        title:
          accounts.length === 1
            ? 'A scope covers a whole account'
            : `${accounts.length} scopes cover whole accounts`,
        detail: `${listPhrase(accounts.map(scopeName))} ${
          accounts.length === 1 ? 'is named' : 'are named'
        } as a whole, so every repository there is in reach and new ones are added automatically. Naming the individual repositories keeps that from growing on its own.`,
      });
    }

    if (repos.length > 10) {
      findings.push({
        level: 'info',
        title: `${repos.length} repositories in scope`,
        detail: 'Each scope widens what a leak reaches. Drop the ones this token no longer needs.',
      });
    } else if (repos.length > 0 && accounts.length === 0) {
      findings.push({
        level: 'contained',
        title: 'Narrow scope',
        detail: `Access is limited to ${repos.length} named repositor${
          repos.length > 1 ? 'ies' : 'y'
        }, which is the behaviour to aim for.`,
      });
    }

    if (analysis.permissions.canAccessGatedRepos) {
      findings.push({
        level: 'info',
        title: 'Reaches gated repositories',
        detail: 'This token can download gated content you have been approved for.',
      });
    }
  }

  if (analysis.tokenType === 'read') {
    findings.push({
      level: 'contained',
      title: 'Read-only',
      detail:
        'Nothing can be changed with this token. This is the right choice for anything that only downloads.',
    });
  }

  if (analysis.expiresAt && !expired) {
    findings.push({
      level: 'contained',
      title: 'Expiry set',
      detail: `Stops working in ${timeUntil(analysis.expiresAt).toLowerCase()}.`,
    });
  }

  return sortFindings(findings);
}

function buildScopes(analysis: TokenAnalysis): ScopeEntry[] {
  return (analysis.fineGrainedScopes ?? []).map((scope) => ({
    target: ACCOUNT_SCOPE_TYPES.has(scope.entity.type) ? 'account' : 'repository',
    label: scope.entity.name || scope.entity._id,
    kind: scope.entity.type,
    permissions: scope.permissions,
  }));
}

function buildAccounts(analysis: TokenAnalysis): AccountRef[] {
  return analysis.organizations.map((org) => ({
    handle: org.name,
    fullname: org.fullname,
    url: `https://huggingface.co/${org.name}`,
    avatarUrl: org.avatarUrl,
    role: org.roleInOrg,
    badges: [org.isEnterprise ? 'Enterprise' : '', org.plan ?? ''].filter(Boolean),
    warnings: (org.securityRestrictions ?? []).map((r) => RESTRICTION_NAME[r] ?? r),
  }));
}

async function analyze(token: string): Promise<TokenReport> {
  const analysis = await analyzeToken(token);

  if (!analysis.isValid) {
    return invalidReport({ id: ID, name: NAME }, analysis.error ?? 'This token could not be read.');
  }

  const expired = isExpired(analysis.expiresAt);
  const expiry: Expiry = analysis.expiresAt
    ? { kind: 'at', iso: analysis.expiresAt }
    : { kind: 'never' };

  const permissions: PermissionEntry[] = PERMISSIONS.map(({ key, label, risky }) => ({
    label,
    risky,
    allowed: analysis.permissions[key],
  }));

  return {
    provider: ID,
    providerName: NAME,
    isValid: true,
    tokenName: analysis.tokenName,
    tokenKind: TOKEN_KINDS[analysis.tokenType],
    createdAt: analysis.createdAt,
    expiry,
    identity: analysis.user && {
      handle: analysis.user.name,
      fullname: analysis.user.fullname,
      url: `https://huggingface.co/${analysis.user.name}`,
      avatarUrl: analysis.user.avatarUrl,
      email: analysis.user.email,
      badges: [
        analysis.user.isPro ? 'PRO' : '',
        analysis.user.emailVerified ? 'Email verified' : '',
        analysis.user.canPay ? 'Billing enabled' : '',
      ].filter(Boolean),
    },
    accounts: buildAccounts(analysis),
    permissions,
    scopes: buildScopes(analysis),
    rawScopes: analysis.globalPermissions ?? [],
    verdict: buildVerdict(analysis, expired),
    findings: buildFindings(analysis, expired),
    notes: [],
  };
}

function toResources(repos: UserRepositories): ResourceRef[] {
  const url = (kind: string, id: string) =>
    kind === 'model'
      ? `https://huggingface.co/${id}`
      : `https://huggingface.co/${kind}s/${id}`;

  return [
    ...repos.models.map((r) => ({ ...r, kind: 'model' })),
    ...repos.datasets.map((r) => ({ ...r, kind: 'dataset' })),
    ...repos.spaces.map((r) => ({ ...r, kind: 'space' })),
  ].map((repo) => ({
    id: repo.id,
    url: url(repo.kind, repo.id),
    kind: repo.kind,
    private: repo.private,
    gated: Boolean(repo.gated),
    downloads: repo.downloads,
    likes: repo.likes,
  }));
}

async function listResources(token: string, report: TokenReport): Promise<ResourceGroup[]> {
  if (!report.identity) return [];

  const [personal, orgResults] = await Promise.all([
    fetchUserRepositories(token, report.identity.handle),
    Promise.all(
      report.accounts.map(async (account) => ({
        account,
        repos: await fetchUserRepositories(token, account.handle),
      }))
    ),
  ]);

  // Fine-grained tokens can also name individual repositories owned by someone
  // else, which no author listing would return.
  const scoped = report.scopes.filter((scope) => scope.target === 'repository');
  if (scoped.length > 0) {
    const seen = new Set(
      [personal, ...orgResults.map((r) => r.repos)].flatMap((repos) => [
        ...repos.models.map((m) => m.id),
        ...repos.datasets.map((d) => d.id),
        ...repos.spaces.map((s) => s.id),
      ])
    );
    const extra = await fetchScopedRepositories(
      token,
      scoped.map((scope) => ({
        entity: { _id: scope.label, name: scope.label, type: scope.kind },
        permissions: scope.permissions,
      })) as TokenScope[]
    );
    personal.models.push(...extra.models.filter((m) => !seen.has(m.id)));
    personal.datasets.push(...extra.datasets.filter((d) => !seen.has(d.id)));
    personal.spaces.push(...extra.spaces.filter((s) => !seen.has(s.id)));
  }

  const groups: ResourceGroup[] = [
    {
      owner: report.identity.handle,
      truncated: personal.truncated,
      writable: report.permissions.some((p) => p.label === WRITE_MODELS_LABEL && p.allowed),
      resources: toResources(personal),
    },
    ...orgResults.map(({ account, repos }) => ({
      owner: account.handle,
      role: account.role,
      writable: account.role === 'admin' || account.role === 'write',
      truncated: repos.truncated,
      resources: toResources(repos),
    })),
  ];

  return groups.filter((group) => group.resources.length > 0);
}

export const huggingfaceProvider: Provider = {
  id: ID,
  name: NAME,
  tokenUrl: 'https://huggingface.co/settings/tokens',
  formats: ['hf_'],
  docs: {
    summary:
      'HuggingFace reports a token\'s role directly, so read, write and administrative tokens are graded without guesswork. Fine-grained tokens list the exact resources they name, which is where the interesting detail is.',
    endpoints: [
      { call: 'GET /api/whoami-v2', purpose: 'the token\'s role, name, expiry, scopes and the account it belongs to' },
      { call: 'GET /api/models?author=', purpose: 'models the account owns' },
      { call: 'GET /api/datasets?author=', purpose: 'datasets the account owns' },
      { call: 'GET /api/spaces?author=', purpose: 'spaces the account owns' },
      {
        call: 'GET /api/{models,datasets,spaces}/{id}',
        purpose: 'repositories a fine-grained token names that the account does not own',
      },
    ],
    limits: [
      'A fine-grained scope naming a user or an organization covers every repository under it, including ones created after the token was issued. That is reported as covering the whole account rather than as one resource.',
      'Listings follow the Hub\'s cursor header, which a browser cannot always read. When one stops early the count carries a + and the page says so.',
      'Organization security policies such as MFA or SSO can refuse requests, which makes a listing incomplete. That is reported as a finding rather than left to look like an empty result.',
    ],
  },
  detect,
  analyze,
  listResources,
};
