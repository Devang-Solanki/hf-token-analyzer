import type { WhoAmIResponse, TokenAnalysis, TokenScope, FineGrainedPermissions, ModelRepository, DatasetRepository, SpaceRepository, UserRepositories } from '@/types/huggingface';

const HF_API_BASE = 'https://huggingface.co';

/** Repositories requested per listing page. */
const PAGE_SIZE = 100;
/** Hard ceiling on pages per listing, so one huge account cannot hang the tab. */
const MAX_PAGES = 10;

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token.trim()}` };
}

/** Pull the `rel="next"` URL out of a Link header, if the API sent one. */
function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetch all repositories (models, datasets, spaces) for a user or organization
 */
export async function fetchUserRepositories(
  token: string,
  username: string
): Promise<UserRepositories> {
  const [models, datasets, spaces] = await Promise.all([
    fetchRepoList<ModelRepository>(token, 'models', username),
    fetchRepoList<DatasetRepository>(token, 'datasets', username),
    fetchRepoList<SpaceRepository>(token, 'spaces', username),
  ]);

  return {
    models: models.items,
    datasets: datasets.items,
    spaces: spaces.items,
    truncated: models.truncated || datasets.truncated || spaces.truncated,
  };
}

/**
 * Fetch one repository by its full id, e.g. "mistralai/Mistral-7B-Instruct-v0.2".
 * The id keeps its slash - the API expects a path, not an encoded segment.
 */
async function fetchRepoById<T>(
  token: string,
  kind: 'models' | 'datasets' | 'spaces',
  id: string
): Promise<T | null> {
  const type = kind.slice(0, -1) as 'model' | 'dataset' | 'space';

  try {
    const response = await fetch(`${HF_API_BASE}/api/${kind}/${id}`, {
      headers: authHeaders(token),
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${type} ${id}: ${response.status}`);
      return null;
    }

    return { ...(await response.json()), type } as T;
  } catch (error) {
    console.error(`Error fetching ${type} ${id}:`, error);
    return null;
  }
}

/**
 * Extract repository IDs from fine-grained scopes
 */
export function extractRepoIdsFromScopes(scopes: TokenScope[]): {
  models: string[];
  datasets: string[];
  spaces: string[];
} {
  const models: string[] = [];
  const datasets: string[] = [];
  const spaces: string[] = [];

  for (const scope of scopes) {
    const entityType = scope.entity.type;
    // Try name first, then _id
    const entityName = scope.entity.name || scope.entity._id;

    if (!entityName) continue;

    switch (entityType) {
      case 'model':
        models.push(entityName);
        break;
      case 'dataset':
        datasets.push(entityName);
        break;
      case 'space':
        spaces.push(entityName);
        break;
    }
  }

  return { models, datasets, spaces };
}

/**
 * Fetch repositories from fine-grained scopes (specific repos the token has access to)
 */
export async function fetchScopedRepositories(
  token: string,
  scopes: TokenScope[]
): Promise<UserRepositories> {
  const repoIds = extractRepoIdsFromScopes(scopes);

  // Fetch all individually-scoped repositories in parallel
  const [models, datasets, spaces] = await Promise.all([
    Promise.all(repoIds.models.map(id => fetchRepoById<ModelRepository>(token, 'models', id))),
    Promise.all(repoIds.datasets.map(id => fetchRepoById<DatasetRepository>(token, 'datasets', id))),
    Promise.all(repoIds.spaces.map(id => fetchRepoById<SpaceRepository>(token, 'spaces', id))),
  ]);

  return {
    models: models.filter((m): m is ModelRepository => m !== null),
    datasets: datasets.filter((d): d is DatasetRepository => d !== null),
    spaces: spaces.filter((s): s is SpaceRepository => s !== null),
    truncated: false,
  };
}

/**
 * Fetch every repository of one kind for a user or organization.
 *
 * The listing endpoints are cursor-paginated through a `Link` header. That header
 * is only readable cross-origin when the API exposes it, so when it is missing and
 * the page came back full we report the result as truncated rather than claim a
 * total we cannot stand behind - under-reporting a token's reach is worse than
 * over-warning about it.
 */
async function fetchRepoList<T>(
  token: string,
  kind: 'models' | 'datasets' | 'spaces',
  author: string
): Promise<{ items: T[]; truncated: boolean }> {
  const type = kind.slice(0, -1) as 'model' | 'dataset' | 'space';
  const items: T[] = [];
  let url: string | null =
    `${HF_API_BASE}/api/${kind}?author=${encodeURIComponent(author)}&limit=${PAGE_SIZE}`;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    try {
      const response = await fetch(url, { headers: authHeaders(token) });

      if (!response.ok) {
        console.error(`Failed to fetch ${kind} for ${author}: ${response.status}`);
        return { items, truncated: true };
      }

      const page = (await response.json()) as Record<string, unknown>[];
      items.push(...page.map((repo) => ({ ...repo, type }) as T));
      pages += 1;

      const next = parseNextLink(response.headers.get('Link'));
      if (next) {
        url = next;
        continue;
      }

      url = null;
      if (page.length === PAGE_SIZE) {
        return { items, truncated: true };
      }
    } catch (error) {
      console.error(`Error fetching ${kind} for ${author}:`, error);
      return { items, truncated: true };
    }
  }

  return { items, truncated: url !== null };
}

/**
 * Analyzes a HuggingFace API token by making requests directly from the browser.
 * All data stays client-side - no server involved.
 */
export async function analyzeToken(token: string): Promise<TokenAnalysis> {
  if (!token || token.trim() === '') {
    return {
      isValid: false,
      tokenType: 'unknown',
      organizations: [],
      permissions: getDefaultPermissions(),
      error: 'Token is required',
    };
  }

  try {
    // Call the whoami-v2 endpoint to get token information
    const response = await fetch(`${HF_API_BASE}/api/whoami-v2`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          isValid: false,
          tokenType: 'unknown',
          organizations: [],
          permissions: getDefaultPermissions(),
          error: 'Invalid or expired token',
        };
      }
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data: WhoAmIResponse = await response.json();
    return parseWhoAmIResponse(data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Check if it's a CORS error
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return {
        isValid: false,
        tokenType: 'unknown',
        organizations: [],
        permissions: getDefaultPermissions(),
        error: 'Network error - this may be due to CORS restrictions. The HuggingFace API may not allow direct browser requests.',
      };
    }

    return {
      isValid: false,
      tokenType: 'unknown',
      organizations: [],
      permissions: getDefaultPermissions(),
      error: errorMessage,
    };
  }
}

function parseWhoAmIResponse(data: WhoAmIResponse): TokenAnalysis {
  const auth = data.auth;
  const accessToken = auth?.accessToken;

  // Determine token type
  let tokenType: TokenAnalysis['tokenType'] = 'unknown';
  if (accessToken?.role) {
    tokenType = accessToken.role;
  } else if (auth?.type === 'access_token') {
    tokenType = 'read'; // Default assumption for basic tokens
  }

  // Calculate permissions based on token type and fine-grained scopes
  const permissions = calculatePermissions(tokenType, accessToken?.fineGrained);

  // Extract fine-grained scopes if available
  const fineGrainedScopes: TokenScope[] = accessToken?.fineGrained?.scoped || [];
  const globalPermissions: string[] = accessToken?.fineGrained?.global || [];

  return {
    isValid: true,
    tokenType,
    tokenName: accessToken?.displayName,
    createdAt: accessToken?.createdAt,
    expiresAt: auth?.expiresAt,
    user: {
      id: data.id,
      name: data.name,
      fullname: data.fullname,
      email: data.email,
      avatarUrl: data.avatarUrl,
      isPro: data.isPro,
      emailVerified: data.emailVerified,
      canPay: data.canPay,
    },
    organizations: data.orgs || [],
    permissions,
    fineGrainedScopes: fineGrainedScopes.length > 0 ? fineGrainedScopes : undefined,
    globalPermissions: globalPermissions.length > 0 ? globalPermissions : undefined,
  };
}

function calculatePermissions(
  tokenType: TokenAnalysis['tokenType'],
  fineGrained?: FineGrainedPermissions
): TokenAnalysis['permissions'] {
  // Base permissions for different token types
  const basePermissions = getDefaultPermissions();

  switch (tokenType) {
    case 'god':
      // Admin token - full access
      return {
        canReadModels: true,
        canWriteModels: true,
        canReadDatasets: true,
        canWriteDatasets: true,
        canReadSpaces: true,
        canWriteSpaces: true,
        canManageRepos: true,
        canAccessGatedRepos: true,
        canWriteDiscussions: true,
        canWritePosts: true,
        canAccessBilling: true,
        canManageOrgs: true,
        isAdmin: true,
      };

    case 'write':
      // Write token - read and write access
      return {
        canReadModels: true,
        canWriteModels: true,
        canReadDatasets: true,
        canWriteDatasets: true,
        canReadSpaces: true,
        canWriteSpaces: true,
        canManageRepos: true,
        canAccessGatedRepos: true,
        canWriteDiscussions: true,
        canWritePosts: true,
        canAccessBilling: false,
        canManageOrgs: false,
        isAdmin: false,
      };

    case 'read':
      // Read token - read-only access
      return {
        canReadModels: true,
        canWriteModels: false,
        canReadDatasets: true,
        canWriteDatasets: false,
        canReadSpaces: true,
        canWriteSpaces: false,
        canManageRepos: false,
        canAccessGatedRepos: true,
        canWriteDiscussions: false,
        canWritePosts: false,
        canAccessBilling: false,
        canManageOrgs: false,
        isAdmin: false,
      };

    case 'fineGrained':
      // Fine-grained token - permissions based on scopes
      return calculateFineGrainedPermissions(fineGrained);

    default:
      return basePermissions;
  }
}

function calculateFineGrainedPermissions(
  fineGrained?: FineGrainedPermissions
): TokenAnalysis['permissions'] {
  const permissions = getDefaultPermissions();

  if (!fineGrained) {
    return permissions;
  }

  // Check global permissions
  if (fineGrained.global) {
    permissions.canWriteDiscussions = fineGrained.global.includes('discussion.write');
    permissions.canWritePosts = fineGrained.global.includes('post.write');
  }

  // Check if can read gated repos
  permissions.canAccessGatedRepos = fineGrained.canReadGatedRepos || false;

  // Analyze scoped permissions
  if (fineGrained.scoped) {
    for (const scope of fineGrained.scoped) {
      const entityType = scope.entity.type;
      const perms = scope.permissions;

      // Check for read permissions
      const hasRead = perms.some((p: string) => p.includes('read') || p.includes('Read'));
      // Check for write permissions
      const hasWrite = perms.some((p: string) => p.includes('write') || p.includes('Write'));

      switch (entityType) {
        case 'model':
          if (hasRead) permissions.canReadModels = true;
          if (hasWrite) permissions.canWriteModels = true;
          break;
        case 'dataset':
          if (hasRead) permissions.canReadDatasets = true;
          if (hasWrite) permissions.canWriteDatasets = true;
          break;
        case 'space':
          if (hasRead) permissions.canReadSpaces = true;
          if (hasWrite) permissions.canWriteSpaces = true;
          break;
        case 'org':
          if (hasWrite) permissions.canManageOrgs = true;
          break;
        case 'user':
          // User-level permissions
          if (perms.some((p: string) => p.includes('billing'))) {
            permissions.canAccessBilling = true;
          }
          break;
      }

      // Check for repo management permissions
      if (perms.some((p: string) => p.includes('repo') && p.includes('manage'))) {
        permissions.canManageRepos = true;
      }
    }
  }

  return permissions;
}

function getDefaultPermissions(): TokenAnalysis['permissions'] {
  return {
    canReadModels: false,
    canWriteModels: false,
    canReadDatasets: false,
    canWriteDatasets: false,
    canReadSpaces: false,
    canWriteSpaces: false,
    canManageRepos: false,
    canAccessGatedRepos: false,
    canWriteDiscussions: false,
    canWritePosts: false,
    canAccessBilling: false,
    canManageOrgs: false,
    isAdmin: false,
  };
}

/**
 * Test a specific API endpoint with the token
 */
export async function testEndpoint(
  token: string,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET'
): Promise<{ success: boolean; status: number; message: string }> {
  try {
    const response = await fetch(`${HF_API_BASE}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return {
        success: true,
        status: response.status,
        message: 'Access granted',
      };
    }

    if (response.status === 401) {
      return {
        success: false,
        status: response.status,
        message: 'Unauthorized - token does not have access',
      };
    }

    if (response.status === 403) {
      return {
        success: false,
        status: response.status,
        message: 'Forbidden - insufficient permissions',
      };
    }

    return {
      success: false,
      status: response.status,
      message: `Request failed with status ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
}

