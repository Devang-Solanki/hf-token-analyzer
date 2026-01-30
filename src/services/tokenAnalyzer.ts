import type { WhoAmIResponse, TokenAnalysis, TokenScope, FineGrainedPermissions, ModelRepository, DatasetRepository, SpaceRepository, UserRepositories } from '@/types/huggingface';

const HF_API_BASE = 'https://huggingface.co';

/**
 * Fetch all repositories (models, datasets, spaces) for a user or organization
 */
export async function fetchUserRepositories(
  token: string,
  username: string
): Promise<UserRepositories> {
  const [models, datasets, spaces] = await Promise.all([
    fetchModels(token, username),
    fetchDatasets(token, username),
    fetchSpaces(token, username),
  ]);

  return { models, datasets, spaces };
}

/**
 * Fetch a specific model by its full ID (e.g., "mistralai/Mistral-7B-Instruct-v0.2")
 * Note: Don't encode the slash in the model ID - HF API expects the path format
 */
async function fetchModelById(token: string, modelId: string): Promise<ModelRepository | null> {
  try {
    // Don't use encodeURIComponent on the full ID as it would encode the slash
    // The API expects: /api/models/mistralai/Mistral-7B-Instruct-v0.2
    const response = await fetch(
      `${HF_API_BASE}/api/models/${modelId}`,
      {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch model ${modelId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      ...data,
      type: 'model' as const,
    };
  } catch (error) {
    console.error(`Error fetching model ${modelId}:`, error);
    return null;
  }
}

/**
 * Fetch a specific dataset by its full ID
 */
async function fetchDatasetById(token: string, datasetId: string): Promise<DatasetRepository | null> {
  try {
    const response = await fetch(
      `${HF_API_BASE}/api/datasets/${datasetId}`,
      {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch dataset ${datasetId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      ...data,
      type: 'dataset' as const,
    };
  } catch (error) {
    console.error(`Error fetching dataset ${datasetId}:`, error);
    return null;
  }
}

/**
 * Fetch a specific space by its full ID
 */
async function fetchSpaceById(token: string, spaceId: string): Promise<SpaceRepository | null> {
  try {
    const response = await fetch(
      `${HF_API_BASE}/api/spaces/${spaceId}`,
      {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch space ${spaceId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return {
      ...data,
      type: 'space' as const,
    };
  } catch (error) {
    console.error(`Error fetching space ${spaceId}:`, error);
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

  console.log('Extracting repo IDs from scopes:', scopes);

  for (const scope of scopes) {
    const entityType = scope.entity.type;
    // Try name first, then _id
    const entityName = scope.entity.name || scope.entity._id;

    console.log(`Scope entity: type=${entityType}, name=${scope.entity.name}, _id=${scope.entity._id}, resolved=${entityName}`);

    if (!entityName) {
      console.log('Skipping scope with no name or _id');
      continue;
    }

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
      default:
        console.log(`Skipping non-repo entity type: ${entityType}`);
    }
  }

  console.log('Extracted repo IDs:', { models, datasets, spaces });
  return { models, datasets, spaces };
}

/**
 * Fetch repositories from fine-grained scopes (specific repos the token has access to)
 */
export async function fetchScopedRepositories(
  token: string,
  scopes: TokenScope[]
): Promise<UserRepositories> {
  console.log('fetchScopedRepositories called with scopes:', scopes);
  
  const repoIds = extractRepoIdsFromScopes(scopes);
  
  console.log('Will fetch these repos:', repoIds);

  // Fetch all repositories in parallel
  const [models, datasets, spaces] = await Promise.all([
    Promise.all(repoIds.models.map(id => {
      console.log(`Fetching model: ${id}`);
      return fetchModelById(token, id);
    })),
    Promise.all(repoIds.datasets.map(id => {
      console.log(`Fetching dataset: ${id}`);
      return fetchDatasetById(token, id);
    })),
    Promise.all(repoIds.spaces.map(id => {
      console.log(`Fetching space: ${id}`);
      return fetchSpaceById(token, id);
    })),
  ]);

  const result = {
    models: models.filter((m): m is ModelRepository => m !== null),
    datasets: datasets.filter((d): d is DatasetRepository => d !== null),
    spaces: spaces.filter((s): s is SpaceRepository => s !== null),
  };
  
  console.log('fetchScopedRepositories result:', result);
  return result;
}

/**
 * Fetch models for a user or organization
 */
async function fetchModels(token: string, author: string): Promise<ModelRepository[]> {
  try {
    const response = await fetch(
      `${HF_API_BASE}/api/models?author=${encodeURIComponent(author)}&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch models for ${author}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.map((model: Record<string, unknown>) => ({
      ...model,
      type: 'model' as const,
    }));
  } catch (error) {
    console.error(`Error fetching models for ${author}:`, error);
    return [];
  }
}

/**
 * Fetch datasets for a user or organization
 */
async function fetchDatasets(token: string, author: string): Promise<DatasetRepository[]> {
  try {
    const response = await fetch(
      `${HF_API_BASE}/api/datasets?author=${encodeURIComponent(author)}&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch datasets for ${author}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.map((dataset: Record<string, unknown>) => ({
      ...dataset,
      type: 'dataset' as const,
    }));
  } catch (error) {
    console.error(`Error fetching datasets for ${author}:`, error);
    return [];
  }
}

/**
 * Fetch spaces for a user or organization
 */
async function fetchSpaces(token: string, author: string): Promise<SpaceRepository[]> {
  try {
    const response = await fetch(
      `${HF_API_BASE}/api/spaces?author=${encodeURIComponent(author)}&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch spaces for ${author}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.map((space: Record<string, unknown>) => ({
      ...space,
      type: 'space' as const,
    }));
  } catch (error) {
    console.error(`Error fetching spaces for ${author}:`, error);
    return [];
  }
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

/**
 * Format a date string for display
 */
export function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  
  try {
    const expirationDate = new Date(expiresAt);
    return expirationDate < new Date();
  } catch {
    return false;
  }
}

/**
 * Get time until token expiration
 */
export function getTimeUntilExpiration(expiresAt?: string): string {
  if (!expiresAt) return 'Never expires';
  
  try {
    const expirationDate = new Date(expiresAt);
    const now = new Date();
    
    if (expirationDate < now) {
      return 'Expired';
    }
    
    const diffMs = expirationDate.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    }
    
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
    }
    
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  } catch {
    return 'Unknown';
  }
}
