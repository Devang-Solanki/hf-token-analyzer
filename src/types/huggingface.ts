// Types based on HuggingFace API OpenAPI spec

export interface Repository {
  _id: string;
  id: string;
  name?: string;
  private: boolean;
  gated?: boolean | 'auto' | 'manual';
  downloads?: number;
  likes?: number;
  lastModified?: string;
  createdAt?: string;
  author?: string;
  sha?: string;
  disabled?: boolean;
}

export interface ModelRepository extends Repository {
  type: 'model';
  pipeline_tag?: string;
  tags?: string[];
  library_name?: string;
  modelId?: string;
}

export interface DatasetRepository extends Repository {
  type: 'dataset';
  tags?: string[];
}

export interface SpaceRepository extends Repository {
  type: 'space';
  sdk?: 'gradio' | 'streamlit' | 'docker' | 'static';
  emoji?: string;
  colorFrom?: string;
  colorTo?: string;
  runtime?: {
    stage: string;
    hardware?: {
      current: string | null;
      requested: string | null;
    };
  };
}

export interface UserRepositories {
  models: ModelRepository[];
  datasets: DatasetRepository[];
  spaces: SpaceRepository[];
}

export interface TokenScope {
  entity: {
    _id: string;
    name?: string;
    type: 'dataset' | 'model' | 'space' | 'collection' | 'org' | 'user' | 'resource-group' | 'oauth-app';
  };
  permissions: string[];
}

export interface FineGrainedPermissions {
  scoped: TokenScope[];
  global?: ('discussion.write' | 'post.write')[];
  canReadGatedRepos?: boolean;
}

export interface AccessToken {
  displayName: string;
  role: 'read' | 'write' | 'god' | 'fineGrained';
  fineGrained?: FineGrainedPermissions;
  createdAt: string;
}

export interface AuthInfo {
  type: string;
  accessToken?: AccessToken;
  expiresAt?: string;
  resource?: {
    sub: string;
  };
}

export interface ResourceGroup {
  id: string;
  name: string;
  role: 'admin' | 'write' | 'contributor' | 'read';
}

export interface Organization {
  type: 'org';
  id: string;
  name: string;
  fullname: string;
  email?: string | null;
  canPay?: boolean;
  billingMode?: 'prepaid' | 'postpaid';
  avatarUrl: string;
  periodEnd?: number | null;
  isEnterprise: boolean;
  plan?: 'team' | 'enterprise' | 'plus' | 'academia';
  roleInOrg?: 'admin' | 'write' | 'contributor' | 'read';
  pendingSSO?: boolean;
  missingMFA?: boolean;
  securityRestrictions?: ('mfa' | 'token-policy' | 'sso' | 'ip')[];
  resourceGroups?: ResourceGroup[];
}

export interface WhoAmIResponse {
  auth: AuthInfo;
  type: 'user';
  id: string;
  name: string;
  fullname: string;
  email?: string | null;
  canPay?: boolean;
  billingMode?: 'prepaid' | 'postpaid';
  avatarUrl: string;
  periodEnd?: number | null;
  emailVerified?: boolean;
  isPro: boolean;
  orgs: Organization[];
}

export interface TokenAnalysis {
  isValid: boolean;
  tokenType: 'read' | 'write' | 'god' | 'fineGrained' | 'unknown';
  tokenName?: string;
  createdAt?: string;
  expiresAt?: string;
  user?: {
    id: string;
    name: string;
    fullname: string;
    email?: string | null;
    avatarUrl: string;
    isPro: boolean;
    emailVerified?: boolean;
    canPay?: boolean;
  };
  organizations: Organization[];
  permissions: {
    canReadModels: boolean;
    canWriteModels: boolean;
    canReadDatasets: boolean;
    canWriteDatasets: boolean;
    canReadSpaces: boolean;
    canWriteSpaces: boolean;
    canManageRepos: boolean;
    canAccessGatedRepos: boolean;
    canWriteDiscussions: boolean;
    canWritePosts: boolean;
    canAccessBilling: boolean;
    canManageOrgs: boolean;
    isAdmin: boolean;
  };
  fineGrainedScopes?: TokenScope[];
  globalPermissions?: string[];
  error?: string;
}

// API endpoint capabilities that can be tested
export interface EndpointCapability {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  requiredPermission: string;
  category: 'models' | 'datasets' | 'spaces' | 'repos' | 'user' | 'orgs' | 'billing' | 'inference';
}

export const ENDPOINT_CAPABILITIES: EndpointCapability[] = [
  {
    name: 'List Models',
    endpoint: '/api/models',
    method: 'GET',
    description: 'List public models on the Hub',
    requiredPermission: 'read',
    category: 'models',
  },
  {
    name: 'List Datasets',
    endpoint: '/api/datasets',
    method: 'GET',
    description: 'List public datasets on the Hub',
    requiredPermission: 'read',
    category: 'datasets',
  },
  {
    name: 'List Spaces',
    endpoint: '/api/spaces',
    method: 'GET',
    description: 'List public Spaces on the Hub',
    requiredPermission: 'read',
    category: 'spaces',
  },
  {
    name: 'User Info',
    endpoint: '/api/whoami-v2',
    method: 'GET',
    description: 'Get information about the authenticated user',
    requiredPermission: 'read',
    category: 'user',
  },
  {
    name: 'Create Repository',
    endpoint: '/api/repos/create',
    method: 'POST',
    description: 'Create a new model, dataset, or space repository',
    requiredPermission: 'write',
    category: 'repos',
  },
  {
    name: 'Delete Repository',
    endpoint: '/api/repos/delete',
    method: 'DELETE',
    description: 'Delete a repository',
    requiredPermission: 'write',
    category: 'repos',
  },
  {
    name: 'List Organizations',
    endpoint: '/api/organizations',
    method: 'GET',
    description: 'List organizations the user belongs to',
    requiredPermission: 'read',
    category: 'orgs',
  },
  {
    name: 'Inference API',
    endpoint: '/api/inference',
    method: 'POST',
    description: 'Run inference on models',
    requiredPermission: 'read',
    category: 'inference',
  },
];
