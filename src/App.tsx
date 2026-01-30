import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { analyzeToken, formatDate, getTimeUntilExpiration, isTokenExpired, fetchUserRepositories, fetchScopedRepositories } from '@/services/tokenAnalyzer';
import type { TokenAnalysis, UserRepositories, ModelRepository, DatasetRepository, SpaceRepository } from '@/types/huggingface';
import {
  User,
  Building2,
  Key,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Unlock,
  Database,
  Box,
  MessageSquare,
  CreditCard,
  Users,
  Crown,
  FolderGit2,
  Download,
  Heart,
  Globe,
  LockKeyhole,
  RefreshCw,
  Sun,
  Moon,
  Shield
} from 'lucide-react';

interface RepositoriesData {
  personal: UserRepositories | null;
  organizations: { [orgName: string]: UserRepositories };
}

function App() {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TokenAnalysis | null>(null);
  const [repositories, setRepositories] = useState<RepositoriesData>({ personal: null, organizations: {} });
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage or system preference on initial load
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored) {
        return stored === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Apply dark mode class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!token.trim()) return;
    
    setIsLoading(true);
    setReposLoaded(false);
    setRepositories({ personal: null, organizations: {} });
    try {
      const result = await analyzeToken(token);
      setAnalysis(result);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const handleClear = useCallback(() => {
    setToken('');
    setAnalysis(null);
    setRepositories({ personal: null, organizations: {} });
    setReposLoaded(false);
  }, []);

  const loadRepositories = useCallback(async () => {
    if (!analysis?.isValid || !analysis.user || !token) return;
    
    setIsLoadingRepos(true);
    try {
      // For fine-grained tokens, fetch specific repos from scopes
      if (analysis.tokenType === 'fineGrained' && analysis.fineGrainedScopes && analysis.fineGrainedScopes.length > 0) {
        const scopedRepos = await fetchScopedRepositories(token, analysis.fineGrainedScopes);
        setRepositories({
          personal: scopedRepos,
          organizations: {},
        });
      } else {
        // For regular tokens, fetch by author
        const personalRepos = await fetchUserRepositories(token, analysis.user.name);
        
        // Fetch organization repositories
        const orgRepos: { [orgName: string]: UserRepositories } = {};
        for (const org of analysis.organizations) {
          const repos = await fetchUserRepositories(token, org.name);
          orgRepos[org.name] = repos;
        }
        
        setRepositories({
          personal: personalRepos,
          organizations: orgRepos,
        });
      }
      setReposLoaded(true);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    } finally {
      setIsLoadingRepos(false);
    }
  }, [analysis, token]);

  const getTokenTypeBadge = (tokenType: TokenAnalysis['tokenType']) => {
    switch (tokenType) {
      case 'god':
        return <Badge className="bg-purple-500 hover:bg-purple-600"><Crown className="w-3 h-3 mr-1" /> Admin</Badge>;
      case 'write':
        return <Badge className="bg-blue-500 hover:bg-blue-600"><Unlock className="w-3 h-3 mr-1" /> Write</Badge>;
      case 'read':
        return <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" /> Read</Badge>;
      case 'fineGrained':
        return <Badge className="bg-orange-500 hover:bg-orange-600"><Key className="w-3 h-3 mr-1" /> Fine-Grained</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getTotalRepoCount = () => {
    let total = 0;
    if (repositories.personal) {
      total += repositories.personal.models.length + 
               repositories.personal.datasets.length + 
               repositories.personal.spaces.length;
    }
    Object.values(repositories.organizations).forEach(repos => {
      total += repos.models.length + repos.datasets.length + repos.spaces.length;
    });
    return total;
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && token.trim() && !isLoading) {
      handleAnalyze();
    }
  }, [token, isLoading, handleAnalyze]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Dark Mode Toggle */}
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleDarkMode}
            className="rounded-full"
            title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? (
              <Sun className="h-5 w-5 text-yellow-500" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img
              src="/logo.png"
              alt="HuggingFace Token Analyzer Logo"
              className="w-12 h-12 object-contain"
            />
            <h1 className="text-3xl font-bold text-foreground">
              HuggingFace Token Analyzer
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Analyze your HuggingFace API token to understand its permissions and capabilities.
            <span className="block mt-1 text-sm font-medium text-green-600 dark:text-green-400">
              🔒 100% client-side - your token never leaves your browser
            </span>
          </p>
        </div>

        {/* Token Input */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Enter Your Token
            </CardTitle>
            <CardDescription>
              Paste your HuggingFace API token below. Get one from{' '}
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                huggingface.co/settings/tokens
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button onClick={handleAnalyze} disabled={isLoading || !token.trim()}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Analyze'
                )}
              </Button>
              {analysis && (
                <Button variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-6">
            {/* Status Alert */}
            {analysis.isValid ? (
              <Alert variant="success" className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800 dark:text-green-200">Token Valid</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  Your token is valid and has been analyzed successfully.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Token Invalid</AlertTitle>
                <AlertDescription>
                  {analysis.error || 'The token could not be validated.'}
                </AlertDescription>
              </Alert>
            )}

            {analysis.isValid && (
              <Tabs defaultValue="overview">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="permissions">Permissions</TabsTrigger>
                  <TabsTrigger value="repositories">
                    Repositories {reposLoaded && `(${getTotalRepoCount()})`}
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-4">
                  {/* Token Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Key className="w-5 h-5" />
                        Token Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Token Name</p>
                          <p className="font-medium">{analysis.tokenName || 'Unnamed Token'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Token Type</p>
                          <div className="mt-1">{getTokenTypeBadge(analysis.tokenType)}</div>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Created</p>
                          <p className="font-medium flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDate(analysis.createdAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Expires</p>
                          <p className="font-medium flex items-center gap-1">
                            {analysis.expiresAt ? (
                              <>
                                {isTokenExpired(analysis.expiresAt) ? (
                                  <AlertTriangle className="w-4 h-4 text-red-500" />
                                ) : (
                                  <Clock className="w-4 h-4" />
                                )}
                                {getTimeUntilExpiration(analysis.expiresAt)}
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                Never expires
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* User Info */}
                  {analysis.user && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <User className="w-5 h-5" />
                          User Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <a
                          href={`https://huggingface.co/${analysis.user.name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-4 hover:bg-accent rounded-lg p-2 -m-2 transition-colors"
                        >
                          <div className="flex-shrink-0">
                            {analysis.user.avatarUrl ? (
                              <img
                                src={analysis.user.avatarUrl}
                                alt={analysis.user.name}
                                className="w-16 h-16 rounded-full border-2 border-border object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  target.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-16 h-16 rounded-full border-2 border-border bg-muted flex items-center justify-center ${analysis.user.avatarUrl ? 'hidden' : ''}`}>
                              <User className="w-8 h-8 text-muted-foreground" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 space-y-2">
                            <div>
                              <p className="font-semibold text-lg truncate">{analysis.user.fullname}</p>
                              <p className="text-muted-foreground truncate">@{analysis.user.name}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {analysis.user.isPro && (
                                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500">
                                  <Crown className="w-3 h-3 mr-1" /> PRO
                                </Badge>
                              )}
                              {analysis.user.emailVerified && (
                                <Badge variant="secondary">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Email Verified
                                </Badge>
                              )}
                              {analysis.user.canPay && (
                                <Badge variant="outline">
                                  <CreditCard className="w-3 h-3 mr-1" /> Billing Enabled
                                </Badge>
                              )}
                            </div>
                            {analysis.user.email && (
                              <p className="text-sm text-muted-foreground truncate">{analysis.user.email}</p>
                            )}
                          </div>
                        </a>
                      </CardContent>
                    </Card>
                  )}

                  {/* Organizations Section */}
                  {analysis.organizations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Building2 className="w-5 h-5" />
                          Organizations ({analysis.organizations.length})
                        </CardTitle>
                        <CardDescription>
                          Organizations this token has access to
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {analysis.organizations.map((org) => (
                            <a
                              key={org.id}
                              href={`https://huggingface.co/${org.name}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent transition-colors"
                            >
                              <div className="flex-shrink-0">
                                <img
                                  src={org.avatarUrl}
                                  alt={org.name}
                                  className="w-12 h-12 rounded-lg object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    target.nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                                <div className="w-12 h-12 rounded-lg bg-muted hidden items-center justify-center">
                                  <Building2 className="w-6 h-6 text-muted-foreground" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold truncate">{org.fullname}</p>
                                  {org.isEnterprise && (
                                    <Badge className="bg-purple-500">Enterprise</Badge>
                                  )}
                                  {org.plan && (
                                    <Badge variant="outline">{org.plan}</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">@{org.name}</p>
                                {org.roleInOrg && (
                                  <div className="mt-2">
                                    <Badge variant="secondary">
                                      Role: {org.roleInOrg}
                                    </Badge>
                                  </div>
                                )}
                                {org.securityRestrictions && org.securityRestrictions.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {org.securityRestrictions.map((restriction) => (
                                      <Badge key={restriction} variant="outline" className="text-xs">
                                        <AlertTriangle className="w-3 h-3 mr-1" />
                                        {restriction}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </a>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Permissions Tab */}
                <TabsContent value="permissions" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Token Permissions
                      </CardTitle>
                      <CardDescription>
                        What this token can and cannot do
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <PermissionItem
                          icon={<Box className="w-4 h-4" />}
                          label="Read Models"
                          allowed={analysis.permissions.canReadModels}
                        />
                        <PermissionItem
                          icon={<Box className="w-4 h-4" />}
                          label="Write Models"
                          allowed={analysis.permissions.canWriteModels}
                        />
                        <PermissionItem
                          icon={<Database className="w-4 h-4" />}
                          label="Read Datasets"
                          allowed={analysis.permissions.canReadDatasets}
                        />
                        <PermissionItem
                          icon={<Database className="w-4 h-4" />}
                          label="Write Datasets"
                          allowed={analysis.permissions.canWriteDatasets}
                        />
                        <PermissionItem
                          icon={<Box className="w-4 h-4" />}
                          label="Read Spaces"
                          allowed={analysis.permissions.canReadSpaces}
                        />
                        <PermissionItem
                          icon={<Box className="w-4 h-4" />}
                          label="Write Spaces"
                          allowed={analysis.permissions.canWriteSpaces}
                        />
                        <PermissionItem
                          icon={<Lock className="w-4 h-4" />}
                          label="Access Gated Repos"
                          allowed={analysis.permissions.canAccessGatedRepos}
                        />
                        <PermissionItem
                          icon={<Key className="w-4 h-4" />}
                          label="Manage Repositories"
                          allowed={analysis.permissions.canManageRepos}
                        />
                        <PermissionItem
                          icon={<MessageSquare className="w-4 h-4" />}
                          label="Write Discussions"
                          allowed={analysis.permissions.canWriteDiscussions}
                        />
                        <PermissionItem
                          icon={<MessageSquare className="w-4 h-4" />}
                          label="Write Posts"
                          allowed={analysis.permissions.canWritePosts}
                        />
                        <PermissionItem
                          icon={<CreditCard className="w-4 h-4" />}
                          label="Access Billing"
                          allowed={analysis.permissions.canAccessBilling}
                        />
                        <PermissionItem
                          icon={<Users className="w-4 h-4" />}
                          label="Manage Organizations"
                          allowed={analysis.permissions.canManageOrgs}
                        />
                        <PermissionItem
                          icon={<Crown className="w-4 h-4" />}
                          label="Admin Access"
                          allowed={analysis.permissions.isAdmin}
                          highlight
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Fine-Grained Scopes Section */}
                  {analysis.tokenType === 'fineGrained' && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Key className="w-5 h-5" />
                          Fine-Grained Scopes
                        </CardTitle>
                        <CardDescription>
                          Specific permissions granted to this fine-grained token
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Global Permissions */}
                          {analysis.globalPermissions && analysis.globalPermissions.length > 0 && (
                            <div>
                              <h4 className="font-medium mb-2">Global Permissions</h4>
                              <div className="flex flex-wrap gap-2">
                                {analysis.globalPermissions.map((perm) => (
                                  <Badge key={perm} variant="secondary">
                                    {perm}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Scoped Permissions */}
                          {analysis.fineGrainedScopes && analysis.fineGrainedScopes.length > 0 ? (
                            <div>
                              <h4 className="font-medium mb-2">Scoped Permissions</h4>
                              <div className="space-y-3">
                                {analysis.fineGrainedScopes.map((scope, index) => (
                                  <div
                                    key={index}
                                    className="p-3 border rounded-lg"
                                  >
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge variant="outline">
                                        {scope.entity.type}
                                      </Badge>
                                      <span className="font-medium">
                                        {scope.entity.name || scope.entity._id}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {scope.permissions.map((perm) => (
                                        <Badge key={perm} variant="secondary" className="text-xs">
                                          {perm}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            !analysis.globalPermissions?.length && (
                              <p className="text-muted-foreground text-center py-4">
                                No scoped permissions found
                              </p>
                            )
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Repositories Tab */}
                <TabsContent value="repositories">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FolderGit2 className="w-5 h-5" />
                        Repositories
                      </CardTitle>
                      <CardDescription>
                        Models, datasets, and spaces accessible with this token
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {!reposLoaded ? (
                        <div className="text-center py-8">
                          <p className="text-muted-foreground mb-4">
                            Click the button below to load all repositories accessible with this token.
                          </p>
                          <Button onClick={loadRepositories} disabled={isLoadingRepos}>
                            {isLoadingRepos ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Loading Repositories...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Load Repositories
                              </>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* For fine-grained tokens, show scoped repositories */}
                          {analysis.tokenType === 'fineGrained' && repositories.personal && (
                            <RepositorySection
                              title="Scoped Repositories (from token permissions)"
                              icon={<Key className="w-5 h-5" />}
                              repositories={repositories.personal}
                              canWrite={analysis.permissions.canWriteModels}
                            />
                          )}

                          {/* For regular tokens, show personal repositories */}
                          {analysis.tokenType !== 'fineGrained' && repositories.personal && analysis.user && (
                            <RepositorySection
                              title={`Personal (@${analysis.user.name})`}
                              icon={<User className="w-5 h-5" />}
                              repositories={repositories.personal}
                              canWrite={analysis.permissions.canWriteModels}
                            />
                          )}

                          {/* Organization Repositories (only for non-fine-grained tokens) */}
                          {analysis.tokenType !== 'fineGrained' && Object.entries(repositories.organizations).map(([orgName, repos]) => {
                            const org = analysis.organizations.find(o => o.name === orgName);
                            const canWrite = org?.roleInOrg === 'admin' || org?.roleInOrg === 'write';
                            return (
                              <RepositorySection
                                key={orgName}
                                title={`${org?.fullname || orgName} (@${orgName})`}
                                icon={<Building2 className="w-5 h-5" />}
                                repositories={repos}
                                canWrite={canWrite}
                                orgRole={org?.roleInOrg}
                              />
                            );
                          })}

                          {getTotalRepoCount() === 0 && (
                            <p className="text-muted-foreground text-center py-4">
                              No repositories found
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            Built with ❤️ for the Security community.{' '}
            <a
              href="https://github.com/Devang-Solanki/hf-token-analyzer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              View on GitHub
            </a>
          </p>
          <p className="mt-1">
            Your token is analyzed entirely in your browser. No data is sent to any server.
          </p>
        </footer>
      </div>
    </div>
  );
}

interface PermissionItemProps {
  icon: React.ReactNode;
  label: string;
  allowed: boolean;
  highlight?: boolean;
}

function PermissionItem({ icon, label, allowed, highlight }: PermissionItemProps) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        allowed
          ? highlight
            ? 'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800'
            : 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
          : 'bg-secondary border-border'
      }`}
    >
      <div
        className={`p-2 rounded-full ${
          allowed
            ? highlight
              ? 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400'
              : 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {icon}
      </div>
      <span
        className={`font-medium ${
          allowed
            ? highlight
              ? 'text-purple-700 dark:text-purple-300'
              : 'text-green-700 dark:text-green-300'
            : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
      <div className="ml-auto">
        {allowed ? (
          <CheckCircle2
            className={`w-5 h-5 ${
              highlight ? 'text-purple-500' : 'text-green-500'
            }`}
          />
        ) : (
          <XCircle className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}

interface RepositorySectionProps {
  title: string;
  icon: React.ReactNode;
  repositories: UserRepositories;
  canWrite?: boolean;
  orgRole?: string;
}

function RepositorySection({ title, icon, repositories, canWrite, orgRole }: RepositorySectionProps) {
  const totalCount = repositories.models.length + repositories.datasets.length + repositories.spaces.length;
  
  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h3 className="font-semibold text-lg">{title}</h3>
        <Badge variant="outline" className="ml-auto">
          {totalCount} repos
        </Badge>
        {orgRole && (
          <Badge variant="secondary">
            {orgRole}
          </Badge>
        )}
        {canWrite && (
          <Badge className="bg-blue-500">
            <Unlock className="w-3 h-3 mr-1" /> Write Access
          </Badge>
        )}
      </div>

      {/* Models */}
      {repositories.models.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Box className="w-4 h-4" />
            Models ({repositories.models.length})
          </h4>
          <div className="grid gap-2">
            {repositories.models.map((model) => (
              <RepoCard key={model.id} repo={model} type="model" />
            ))}
          </div>
        </div>
      )}

      {/* Datasets */}
      {repositories.datasets.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Database className="w-4 h-4" />
            Datasets ({repositories.datasets.length})
          </h4>
          <div className="grid gap-2">
            {repositories.datasets.map((dataset) => (
              <RepoCard key={dataset.id} repo={dataset} type="dataset" />
            ))}
          </div>
        </div>
      )}

      {/* Spaces */}
      {repositories.spaces.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Spaces ({repositories.spaces.length})
          </h4>
          <div className="grid gap-2">
            {repositories.spaces.map((space) => (
              <RepoCard key={space.id} repo={space} type="space" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface RepoCardProps {
  repo: ModelRepository | DatasetRepository | SpaceRepository;
  type: 'model' | 'dataset' | 'space';
}

function RepoCard({ repo, type }: RepoCardProps) {
  const getTypeIcon = () => {
    switch (type) {
      case 'model':
        return <Box className="w-4 h-4 text-blue-500" />;
      case 'dataset':
        return <Database className="w-4 h-4 text-green-500" />;
      case 'space':
        return <Globe className="w-4 h-4 text-purple-500" />;
    }
  };

  const getHfUrl = () => {
    switch (type) {
      case 'model':
        return `https://huggingface.co/${repo.id}`;
      case 'dataset':
        return `https://huggingface.co/datasets/${repo.id}`;
      case 'space':
        return `https://huggingface.co/spaces/${repo.id}`;
    }
  };

  return (
    <a
      href={getHfUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent transition-colors"
    >
      {getTypeIcon()}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{repo.id}</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {repo.downloads !== undefined && (
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              {repo.downloads.toLocaleString()}
            </span>
          )}
          {repo.likes !== undefined && (
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3" />
              {repo.likes}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {repo.private ? (
          <Badge variant="outline" className="text-xs">
            <LockKeyhole className="w-3 h-3 mr-1" />
            Private
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            <Globe className="w-3 h-3 mr-1" />
            Public
          </Badge>
        )}
        {repo.gated && (
          <Badge variant="outline" className="text-xs bg-yellow-50 border-yellow-300 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-700 dark:text-yellow-400">
            <Lock className="w-3 h-3 mr-1" />
            Gated
          </Badge>
        )}
      </div>
    </a>
  );
}

export default App;
