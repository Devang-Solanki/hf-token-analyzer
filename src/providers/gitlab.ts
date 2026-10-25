import { paginate } from './http';
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
  type ScopeEntry,
  type Severity,
  type TokenReport,
  type Verdict,
} from './types';

const API = 'https://gitlab.com/api/v4';
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

const ID = 'gitlab';
const NAME = 'GitLab';

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token.trim()}` };
}

/**
 * Token prefixes, from https://docs.gitlab.com/security/tokens/
 *
 * Only `glpat-` can be introspected: it is the one the API will describe. The
 * rest are recognised so the tool can say what they are instead of calling a
 * real GitLab credential unrecognised, which would invite someone to paste it
 * somewhere less careful.
 */
const OPAQUE_PREFIXES: Record<string, string> = {
  'gldt-': 'deploy token',
  'glrt-': 'runner authentication token',
  'glrtr-': 'runner registration token',
  'glcbt-': 'CI/CD job token',
  'glptt-': 'pipeline trigger token',
  'glft-': 'feed token',
  'glimt-': 'incoming mail token',
  'gloas-': 'OAuth application secret',
  'glsoat-': 'SCIM token',
  'glagent-': 'agent for Kubernetes token',
  'glwt-': 'workspace token',
  'glffct-': 'feature flags client token',
};

function detect(token: string): boolean {
  const value = token.trim();
  return value.startsWith('glpat-') || Object.keys(OPAQUE_PREFIXES).some((p) => value.startsWith(p));
}

function opaqueKind(token: string): string | null {
  const value = token.trim();
  for (const [prefix, kind] of Object.entries(OPAQUE_PREFIXES)) {
    if (value.startsWith(prefix)) return kind;
  }
  return null;
}

/**
 * Capabilities derived from scopes, named as a responder would ask about them.
 * The scope list follows https://docs.gitlab.com/security/tokens/access_token_scopes/
 */
const CAPABILITIES: { label: string; risky?: boolean; scopes: string[] }[] = [
  { label: 'Read the API', scopes: ['api', 'read_api'] },
  { label: 'Write through the API', risky: true, scopes: ['api'] },
  { label: 'Read repositories', scopes: ['api', 'read_api', 'read_repository'] },
  { label: 'Push to repositories', risky: true, scopes: ['api', 'write_repository'] },
  { label: 'Pull container images', scopes: ['api', 'read_registry'] },
  { label: 'Push container images', risky: true, scopes: ['api', 'write_registry'] },
  { label: 'Pull through the dependency proxy', scopes: ['read_virtual_registry'] },
  { label: 'Push through the dependency proxy', risky: true, scopes: ['write_virtual_registry'] },
  { label: 'Create runners', risky: true, scopes: ['create_runner'] },
  { label: 'Manage runners', risky: true, scopes: ['manage_runner'] },
  { label: 'Reach the Kubernetes agent', risky: true, scopes: ['k8s_proxy'] },
  { label: 'Use GitLab Duo', scopes: ['ai_features'] },
  { label: 'Read the account profile', scopes: ['api', 'read_api', 'read_user'] },
  { label: 'Rotate itself', risky: true, scopes: ['api', 'self_rotate'] },
  { label: 'Act as any user', risky: true, scopes: ['sudo'] },
  { label: 'Act as an administrator', risky: true, scopes: ['admin_mode'] },
  { label: 'Download Service Ping', scopes: ['read_service_ping'] },
];

/** Scopes that amount to control of the instance rather than of a project. */
const TAKEOVER_SCOPES = ['sudo', 'admin_mode'];
const WRITE_SCOPES = ['api', 'write_repository', 'write_registry', 'write_virtual_registry'];
/** A runner runs CI jobs, so it can read every secret those jobs are given. */
const RUNNER_SCOPES = ['create_runner', 'manage_runner'];

/** https://docs.gitlab.com/api/members/#roles - 30 (Developer) is the push line. */
const ACCESS_LEVEL: Record<number, string> = {
  0: 'No access',
  5: 'Minimal',
  10: 'Guest',
  20: 'Reporter',
  30: 'Developer',
  40: 'Maintainer',
  50: 'Owner',
};
const CAN_PUSH_FROM = 30;

function buildPermissions(scopes: Set<string>): PermissionEntry[] {
  return CAPABILITIES.map(({ label, risky, scopes: grants }) => ({
    label,
    risky,
    allowed: grants.some((scope) => scopes.has(scope)),
  }));
}

function buildVerdict(
  scopes: Set<string>,
  dead: { revoked: boolean; expired: boolean; inactive: boolean },
  granular: ScopeEntry[]
): Verdict {
  if (dead.revoked) {
    return {
      level: 'breach',
      headline: 'This token has been revoked',
      summary: 'GitLab still describes it, but every request made with it will be rejected.',
    };
  }
  if (dead.expired) {
    return {
      level: 'breach',
      headline: 'This token has expired',
      summary: 'It is past its expiry date, so every request with it will be rejected.',
    };
  }
  if (dead.inactive) {
    return {
      level: 'breach',
      headline: 'This token is not active',
      summary: 'GitLab reports the token as inactive. It will not authenticate anything.',
    };
  }

  const held = (list: string[]) => list.filter((scope) => scopes.has(scope));

  const takeover = held(TAKEOVER_SCOPES);
  if (takeover.length > 0) {
    return {
      level: 'total',
      headline: takeover.includes('sudo') ? 'Can act as any user' : 'Can act as an administrator',
      summary: `${listPhrase(takeover.map((s) => `\`${s}\``))} ${
        takeover.length === 1 ? 'is an instance-wide grant' : 'are instance-wide grants'
      }. This is not a project-level credential: treat a leak as a compromise of the whole GitLab instance.`,
    };
  }

  if (granular.length > 0) {
    const accounts = granular.filter((scope) => scope.target === 'account');
    const writes = granular.some((scope) =>
      scope.permissions.some((p) => /write|admin|create|delete|push/i.test(p))
    );
    const level: Severity = writes ? 'elevated' : 'contained';
    if (accounts.length > 0) {
      return {
        level,
        headline: accounts.length === 1 ? 'Covers a whole group' : `Covers ${accounts.length} groups`,
        summary: `A granular scope names ${listPhrase(
          accounts.map((s) => s.label)
        )} rather than individual projects, so it reaches every project under ${
          accounts.length === 1 ? 'it' : 'them'
        } - including projects added later.`,
      };
    }
    return {
      level,
      headline:
        granular.length === 1 ? 'Scoped to 1 project' : `Scoped to ${granular.length} projects`,
      summary: writes
        ? 'Within those projects this token can write. Check the list below matches what you meant to grant.'
        : 'This token reads the projects listed below and nothing beyond them.',
    };
  }

  if (scopes.has('api')) {
    return {
      level: 'elevated',
      headline: 'Full API access to everything the account can reach',
      summary:
        'The `api` scope is not limited to one project: it covers every group and project this account is a member of, plus the container, dependency and package registries.',
    };
  }

  const runners = held(RUNNER_SCOPES);
  if (runners.length > 0) {
    return {
      level: 'elevated',
      headline: 'Can control CI runners',
      summary:
        'A runner executes pipeline jobs, so whoever controls one sees every variable and secret those jobs are given.',
    };
  }

  const writes = held(WRITE_SCOPES);
  if (writes.length > 0) {
    return {
      level: 'elevated',
      headline: 'Can change things',
      summary: `${listPhrase(writes.map((s) => `\`${s}\``))} ${
        writes.length === 1 ? 'allows' : 'allow'
      } writes.`,
    };
  }

  if (scopes.size === 0) {
    return {
      level: 'contained',
      headline: 'No scopes granted',
      summary: 'This token holds no scopes, so it cannot read or change anything through the API.',
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
  self: SelfToken,
  granular: ScopeEntry[],
  expired: boolean
): Finding[] {
  const findings: Finding[] = [];
  const has = (scope: string) => scopes.has(scope);

  if (self.revoked) {
    findings.push({
      level: 'breach',
      title: 'Token is revoked',
      detail: 'Nothing will authenticate with it. It can be removed from wherever it is stored.',
    });
  } else if (expired) {
    findings.push({
      level: 'breach',
      title: 'Token has expired',
      detail: 'Requests with this token are rejected. Issue a replacement and update its consumers.',
    });
  } else if (self.active === false) {
    findings.push({
      level: 'breach',
      title: 'Token is inactive',
      detail: 'GitLab reports this token as inactive, so it will not authenticate requests.',
    });
  }

  if (has('sudo')) {
    findings.push({
      level: 'total',
      title: 'Can impersonate any user',
      detail:
        '`sudo` performs API actions as any user on the instance. There is no project boundary on this: a leak is an instance-wide compromise, and the audit log will attribute the attacker\'s actions to whoever they chose to be.',
    });
  }

  if (has('admin_mode')) {
    findings.push({
      level: 'total',
      title: 'Carries administrator rights',
      detail: '`admin_mode` performs API actions as an administrator while Admin Mode is enabled.',
    });
  }

  if (has('api')) {
    findings.push({
      level: 'elevated',
      title: 'Full API access across the account',
      detail:
        '`api` is account-wide, not project-specific. It reads and writes every group and project this account belongs to, the container registry, the dependency proxy and the package registry. A token with granular scopes, or a project access token, limits the damage.',
    });
  }

  const runners = RUNNER_SCOPES.filter(has);
  if (runners.length > 0) {
    findings.push({
      level: 'elevated',
      title: 'Can create or manage CI runners',
      detail: `${listPhrase(
        runners.map((s) => `\`${s}\``)
      )} reaches the machines that execute pipelines. A runner sees every CI/CD variable the jobs assigned to it are given, so this is a route to every other secret in those projects.`,
    });
  }

  if (has('write_registry') || has('write_virtual_registry')) {
    findings.push({
      level: 'elevated',
      title: 'Can push container images',
      detail:
        'Anything pulling those images trusts what this token pushes, which makes it a supply-chain path rather than a disclosure one.',
    });
  }

  if (has('k8s_proxy')) {
    findings.push({
      level: 'elevated',
      title: 'Reaches Kubernetes through the GitLab agent',
      detail:
        '`k8s_proxy` makes Kubernetes API calls through the agent, so the blast radius extends into whatever that agent is allowed to do in the cluster.',
    });
  }

  if (has('self_rotate')) {
    findings.push({
      level: 'info',
      title: 'Can rotate itself',
      detail:
        '`self_rotate` lets the holder exchange this token for a fresh one, which survives you revoking the one you know about. Rotate from the UI rather than trusting revocation alone.',
    });
  }

  const accountScopes = granular.filter((scope) => scope.target === 'account');
  if (accountScopes.length > 0) {
    findings.push({
      level: 'elevated',
      title:
        accountScopes.length === 1
          ? 'A granular scope covers a whole group'
          : `${accountScopes.length} granular scopes cover whole groups`,
      detail: `${listPhrase(accountScopes.map((s) => s.label))} ${
        accountScopes.length === 1 ? 'is named' : 'are named'
      } as a whole, so every project under ${
        accountScopes.length === 1 ? 'it' : 'them'
      } is in reach and new ones are added automatically.`,
    });
  } else if (granular.length > 0) {
    findings.push({
      level: 'contained',
      title: 'Granular scopes in use',
      detail: `Access is limited to ${granular.length} named project${
        granular.length > 1 ? 's' : ''
      }, which is the behaviour to aim for.`,
    });
  }

  if (!self.expires_at) {
    findings.push({
      level: 'elevated',
      title: 'No expiry set',
      detail:
        'This token stays valid until someone revokes it by hand. Set an expiry so a forgotten token stops working on its own.',
    });
  }

  if (self.last_used_ips?.length) {
    findings.push({
      level: 'info',
      title: 'Recently used from these addresses',
      detail: `GitLab recorded ${listPhrase(
        self.last_used_ips
      )}. If any of those is not somewhere you run this token from, treat it as used by someone else.`,
    });
  }

  if (scopes.size === 0 && granular.length === 0) {
    findings.push({
      level: 'contained',
      title: 'No scopes granted',
      detail: 'A token with no scopes cannot read or change anything. This is the safest it gets.',
    });
  }

  return sortFindings(findings);
}

interface GranularScope {
  access?: string;
  permissions?: string[];
  project_id?: number | null;
  group_id?: number | null;
}

interface SelfToken {
  id: number;
  name?: string;
  description?: string | null;
  scopes?: string[];
  granular_scopes?: GranularScope[];
  active?: boolean;
  revoked?: boolean;
  created_at?: string;
  expires_at?: string | null;
  last_used_at?: string | null;
  last_used_ips?: string[];
  user_id?: number;
}

interface GitLabUser {
  username: string;
  name?: string;
  avatar_url?: string | null;
  web_url: string;
  public_email?: string | null;
  email?: string | null;
  is_admin?: boolean;
  bot?: boolean;
  state?: string;
}

interface GitLabGroup {
  id: number;
  full_name?: string;
  full_path: string;
  web_url: string;
  avatar_url?: string | null;
}

interface GitLabProject {
  id: number;
  path_with_namespace: string;
  web_url: string;
  visibility: 'private' | 'internal' | 'public';
  archived?: boolean;
  star_count?: number;
  forked_from_project?: unknown;
  namespace?: { full_path?: string };
  permissions?: {
    project_access?: { access_level: number } | null;
    group_access?: { access_level: number } | null;
  };
}

/**
 * Personal, project and group access tokens all carry the `glpat-` prefix, so
 * the kind has to come from the account the token authenticates as: GitLab
 * backs project and group tokens with bot users named after the resource.
 */
function describeKind(user: GitLabUser | null): string {
  if (!user) return 'Access token';
  if (/^project_\d+_bot/.test(user.username)) return 'Project access token';
  if (/^group_\d+_bot/.test(user.username)) return 'Group access token';
  if (user.bot) return 'Bot account token';
  return 'Personal access token';
}

function toScopeEntries(granular: GranularScope[] | undefined): ScopeEntry[] {
  return (granular ?? []).map((scope) => ({
    target: scope.group_id ? 'account' : scope.project_id ? 'repository' : 'other',
    label: scope.group_id
      ? `group ${scope.group_id}`
      : scope.project_id
        ? `project ${scope.project_id}`
        : (scope.access ?? 'unscoped'),
    kind: scope.group_id ? 'group' : scope.project_id ? 'project' : 'instance',
    permissions: scope.permissions ?? (scope.access ? [scope.access] : []),
  }));
}

async function analyze(token: string): Promise<TokenReport> {
  const kind = opaqueKind(token);
  if (kind) {
    // These authenticate against Git, the registry or a runner rather than the
    // REST API, so there is nothing to ask GitLab about them.
    return {
      provider: ID,
      providerName: NAME,
      isValid: true,
      tokenKind: `GitLab ${kind}`,
      expiry: {
        kind: 'unknown',
        reason: `GitLab does not describe ${kind}s through the API, so its expiry cannot be read.`,
      },
      accounts: [],
      permissions: [],
      scopes: [],
      rawScopes: [],
      verdict: {
        level: 'info',
        headline: 'Cannot be read from a browser',
        summary: `This is a GitLab ${kind}. It authenticates against Git, the registry or a runner rather than the REST API, and GitLab exposes no endpoint that describes one - so its reach cannot be established here. Look under the project or group settings that issued it.`,
      },
      findings: [
        {
          level: 'info',
          title: 'Recognised, but not introspectable',
          detail: `The format identifies this as a GitLab ${kind}. Nothing was sent anywhere: there is no endpoint to ask.`,
        },
      ],
      notes: [`GitLab ${kind}s cannot be described through the REST API.`],
    };
  }

  let response: Response;
  try {
    response = await fetch(`${API}/personal_access_tokens/self`, { headers: headers(token) });
  } catch {
    return invalidReport({ id: ID, name: NAME }, 'Could not reach gitlab.com. Check your connection.');
  }

  if (response.status === 401 || response.status === 403) {
    return invalidReport(
      { id: ID, name: NAME },
      'GitLab rejected this token as invalid, revoked or expired. If it belongs to a self-managed GitLab, note that this tool only queries gitlab.com.'
    );
  }
  if (!response.ok) {
    return invalidReport(
      { id: ID, name: NAME },
      `GitLab answered ${response.status} describing this token.`
    );
  }

  const self = (await response.json()) as SelfToken;
  const scopes = new Set(self.scopes ?? []);
  const granular = toScopeEntries(self.granular_scopes);

  // The profile needs read_user, api or read_api, so a refusal is expected
  // rather than an error worth surfacing.
  let user: GitLabUser | null = null;
  try {
    const userResponse = await fetch(`${API}/user`, { headers: headers(token) });
    if (userResponse.ok) user = (await userResponse.json()) as GitLabUser;
  } catch {
    /* identity is best effort */
  }

  let accounts: AccountRef[] = [];
  try {
    const groupsResponse = await fetch(
      `${API}/groups?min_access_level=10&per_page=${PAGE_SIZE}`,
      { headers: headers(token) }
    );
    if (groupsResponse.ok) {
      const groups = (await groupsResponse.json()) as GitLabGroup[];
      accounts = groups.map((group) => ({
        handle: group.full_path,
        fullname: group.full_name,
        url: group.web_url,
        avatarUrl: group.avatar_url ?? undefined,
        badges: [],
        warnings: [],
      }));
    }
  } catch {
    /* group listing is best effort */
  }

  const expired = Boolean(self.expires_at) && new Date(self.expires_at as string) < new Date();
  const expiry: Expiry = self.expires_at
    ? { kind: 'at', iso: self.expires_at }
    : { kind: 'never' };

  const badges: string[] = [];
  if (user?.is_admin) badges.push('Instance admin');
  if (user?.bot) badges.push('Bot account');
  if (user?.state && user.state !== 'active') badges.push(user.state);

  return {
    provider: ID,
    providerName: NAME,
    isValid: true,
    tokenName: self.name || self.description || undefined,
    tokenKind: describeKind(user),
    createdAt: self.created_at,
    expiry,
    identity: user
      ? {
          handle: user.username,
          fullname: user.name,
          url: user.web_url,
          avatarUrl: user.avatar_url ?? undefined,
          email: user.public_email || user.email,
          badges,
        }
      : undefined,
    accounts,
    accountsLabel: 'Groups',
    resourcesLabel: 'Projects',
    permissions: buildPermissions(scopes),
    scopes: granular,
    rawScopes: [...scopes].sort(),
    verdict: buildVerdict(
      scopes,
      {
        revoked: Boolean(self.revoked),
        expired,
        inactive: self.active === false,
      },
      granular
    ),
    findings: buildFindings(scopes, self, granular, expired),
    notes: [],
  };
}

async function listResources(token: string): Promise<ResourceGroup[]> {
  const { items, truncated } = await paginate<GitLabProject>(
    `${API}/projects?membership=true&per_page=${PAGE_SIZE}&order_by=last_activity_at`,
    { headers: headers(token) },
    PAGE_SIZE,
    MAX_PAGES
  );

  const groups = new Map<string, ResourceGroup>();
  for (const project of items) {
    const owner = project.namespace?.full_path ?? project.path_with_namespace.split('/')[0];
    let group = groups.get(owner);
    if (!group) {
      group = { owner, truncated, writable: false, resources: [] };
      groups.set(owner, group);
    }

    const level = Math.max(
      project.permissions?.project_access?.access_level ?? 0,
      project.permissions?.group_access?.access_level ?? 0
    );
    const writable = level >= CAN_PUSH_FROM;
    if (writable) {
      group.writable = true;
      group.role = ACCESS_LEVEL[level] ?? `level ${level}`;
    }

    group.resources.push({
      id: project.path_with_namespace,
      url: project.web_url,
      kind: project.forked_from_project ? 'fork' : 'project',
      // Internal is neither private nor public: anyone with an account on the
      // instance can read it. It gets its own label rather than being folded
      // into either one.
      private: project.visibility !== 'public',
      visibilityLabel:
        project.visibility === 'internal'
          ? 'Internal'
          : project.visibility === 'private'
            ? 'Private'
            : 'Public',
      writable,
      likes: project.star_count,
    });
  }

  return [...groups.values()].sort((a, b) => b.resources.length - a.resources.length);
}

export const gitlabProvider: Provider = {
  id: ID,
  name: NAME,
  tokenUrl: 'https://gitlab.com/-/user_settings/personal_access_tokens',
  formats: ['glpat-'],
  docs: {
    summary:
      'GitLab has one endpoint where a token describes itself, which makes it the most forthcoming of the three: scopes, granular scopes, revocation state and the addresses it was last used from all come back in a single call.',
    endpoints: [
      { call: 'GET /api/v4/personal_access_tokens/self', purpose: 'the token describing itself' },
      { call: 'GET /api/v4/user', purpose: 'identity, and the bot account that reveals whether this is a project or group token' },
      { call: 'GET /api/v4/groups', purpose: 'group membership' },
      { call: 'GET /api/v4/projects?membership=true', purpose: 'projects, followed page by page through the Link header' },
    ],
    limits: [
      'gitlab.com only. A self-managed token will be rejected. Supporting other instances means asking for a host, which means sending a credential to a server you name - worth doing, but not silently.',
      'Personal, project and group access tokens all carry the same glpat- prefix. The kind is read from the bot account the token authenticates as, so a group token is not mistaken for a personal one.',
      'Deploy, runner, job, trigger, feed, agent and SCIM tokens authenticate against Git, the registry or a runner rather than the API. They are recognised by format and reported as such, with nothing sent anywhere.',
      'A project is Private, Internal or Public. Internal means anyone with an account on the instance can read it, which is neither of the other two.',
    ],
  },
  formatNote:
    'Twelve other GitLab token types are recognised by format, but the API describes none of them. gitlab.com only.',
  detect,
  analyze,
  listResources,
};

export const _internal = {
  detect,
  opaqueKind,
  describeKind,
  buildVerdict,
  buildFindings,
  buildPermissions,
  toScopeEntries,
};
