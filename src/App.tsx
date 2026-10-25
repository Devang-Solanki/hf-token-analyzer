import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { detectProvider, PROVIDERS } from '@/providers';
import type {
  AccountRef,
  Expiry,
  Finding,
  Level,
  PermissionEntry,
  Provider,
  ResourceGroup,
  ResourceRef,
  TokenReport,
} from '@/providers';
import { formatDate, timeUntil } from '@/lib/time';
import {
  AlertTriangle,
  Box,
  Check,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  GitFork,
  Globe,
  Heart,
  Info,
  LayoutTemplate,
  Loader2,
  Lock,
  Minus,
  ShieldAlert,
  ShieldCheck,
  Star,
  StickyNote,
} from 'lucide-react';

const SEVERITY_CLASS: Record<Level, string> = {
  contained: 'sev sev-contained',
  elevated: 'sev sev-elevated',
  breach: 'sev sev-breach',
  total: 'sev sev-total',
  info: 'sev',
};

const LEVEL_WORD: Record<Level, string> = {
  total: 'Critical',
  breach: 'Critical',
  elevated: 'Worth fixing',
  contained: 'Good',
  info: 'For information',
};

interface Filters {
  kinds: Set<string>;
  visibility: Set<string>;
  writableOnly: boolean;
  gatedOnly: boolean;
  query: string;
}

const EMPTY_FILTERS: Filters = {
  kinds: new Set(),
  visibility: new Set(),
  writableOnly: false,
  gatedOnly: false,
  query: '',
};

/** The wording a provider uses, so a secret gist never reads as "Private". */
function visibilityOf(resource: ResourceRef): string {
  return resource.visibilityLabel ?? (resource.private ? 'Private' : 'Public');
}

/** HuggingFace reports write access per owner; GitHub reports it per repository. */
function isWritable(resource: ResourceRef, group: ResourceGroup): boolean {
  return resource.writable ?? Boolean(group.writable);
}

function filtersActive(filters: Filters): boolean {
  return (
    filters.kinds.size > 0 ||
    filters.visibility.size > 0 ||
    filters.writableOnly ||
    filters.gatedOnly ||
    filters.query.trim() !== ''
  );
}

const VERDICT_KEY: { level: Level; name: string; meaning: string }[] = [
  { level: 'contained', name: 'Read-only', meaning: 'downloads what you can already see' },
  { level: 'contained', name: 'Scoped', meaning: 'reaches only the resources it names' },
  { level: 'elevated', name: 'Write', meaning: 'changes anything the account owns' },
  { level: 'total', name: 'Admin', meaning: 'deletes repositories and manages organizations' },
];

function App() {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<TokenReport | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ResourceGroup[] | null>(null);
  const [isListing, setIsListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [isDarkMode, setIsDarkMode] = useState(
    () =>
      typeof document === 'undefined' ||
      document.documentElement.getAttribute('data-theme') !== 'light'
  );
  const tokenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    try {
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    } catch {
      /* storage can be unavailable; the class is what matters */
    }
  }, [isDarkMode]);

  // Recognised from the token's format alone. Nothing is sent anywhere until
  // the user asks for the analysis.
  const detected = useMemo(() => (token.trim() ? detectProvider(token) : null), [token]);

  const handleAnalyze = useCallback(async () => {
    const value = token.trim();
    if (!value) return;

    const match = detectProvider(value);
    if (!match) {
      setReport(null);
      setProvider(null);
      setAnalysisError(
        `That is not a token format this tool recognises. It reads ${PROVIDERS.map(
          (p) => p.name
        ).join(' and ')} tokens, and sends nothing anywhere until it recognises one.`
      );
      return;
    }

    setIsLoading(true);
    setAnalysisError(null);
    setGroups(null);
    setListError(null);
    setFilters(EMPTY_FILTERS);

    try {
      const result = await match.analyze(value);
      setProvider(match);
      setReport(result.isValid ? result : null);
      if (!result.isValid) {
        setAnalysisError(result.error ?? 'This token could not be read.');
      }
    } catch (error) {
      setReport(null);
      setAnalysisError(
        error instanceof Error
          ? error.message
          : 'Something went wrong reading the token. Check your connection and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const handleClear = useCallback(() => {
    setToken('');
    setReport(null);
    setProvider(null);
    setAnalysisError(null);
    setGroups(null);
    setListError(null);
    setFilters(EMPTY_FILTERS);
    tokenInputRef.current?.focus();
  }, []);

  const handleList = useCallback(async () => {
    if (!provider || !report) return;

    setIsListing(true);
    setListError(null);
    try {
      setGroups(await provider.listResources(token, report));
    } catch (error) {
      setListError(
        error instanceof Error
          ? `Could not list repositories: ${error.message}`
          : 'Could not list repositories. Check your connection and try again.'
      );
    } finally {
      setIsListing(false);
    }
  }, [provider, report, token]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && token.trim() && !isLoading) {
        handleAnalyze();
      }
    },
    [token, isLoading, handleAnalyze]
  );

  const totals = useMemo(() => {
    if (!groups) return null;
    return {
      count: groups.reduce((sum, group) => sum + group.resources.length, 0),
      truncated: groups.some((group) => group.truncated),
    };
  }, [groups]);

  const facets = useMemo(() => {
    const kinds = new Map<string, number>();
    const visibility = new Map<string, number>();
    let writable = 0;
    let gated = 0;

    for (const group of groups ?? []) {
      for (const resource of group.resources) {
        kinds.set(resource.kind, (kinds.get(resource.kind) ?? 0) + 1);
        const label = visibilityOf(resource);
        visibility.set(label, (visibility.get(label) ?? 0) + 1);
        if (isWritable(resource, group)) writable += 1;
        if (resource.gated) gated += 1;
      }
    }

    return { kinds: [...kinds], visibility: [...visibility], writable, gated };
  }, [groups]);

  const filtered = useMemo(() => {
    if (!groups) return null;
    const query = filters.query.trim().toLowerCase();

    return groups
      .map((group) => ({
        group,
        resources: group.resources.filter(
          (resource) =>
            (filters.kinds.size === 0 || filters.kinds.has(resource.kind)) &&
            (filters.visibility.size === 0 ||
              filters.visibility.has(visibilityOf(resource))) &&
            (!filters.writableOnly || isWritable(resource, group)) &&
            (!filters.gatedOnly || Boolean(resource.gated)) &&
            (query === '' || resource.id.toLowerCase().includes(query))
        ),
      }))
      .filter((entry) => entry.resources.length > 0);
  }, [groups, filters]);

  const shown = filtered?.reduce((sum, entry) => sum + entry.resources.length, 0) ?? 0;

  const toggleFacet = useCallback((key: 'kinds' | 'visibility', value: string) => {
    setFilters((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  }, []);

  const needsAttention = report
    ? report.findings.filter(
        (f) => f.level === 'breach' || f.level === 'total' || f.level === 'elevated'
      ).length
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        Skip to results
      </a>

      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt=""
                width="30"
                height="28"
                className="h-[1.75rem] w-auto shrink-0"
              />
              <span className="text-[0.8125rem] font-semibold uppercase tracking-[0.12em] text-accent-text">
                [ Token Analyzer ]
              </span>
            </span>
            <a
              href="https://devanghacks.in"
              className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-accent-text"
            >
              devanghacks.in <span aria-hidden="true">&#8599;</span>
            </a>
          </div>
          <ThemeSwitch dark={isDarkMode} onChange={setIsDarkMode} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 sm:px-6">
        <section className={report ? 'pt-8' : 'pt-10 sm:pt-14'}>
          {!report && (
            <>
              <h1 className="max-w-[20ch] text-[clamp(2rem,5.4vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.02em]">
                What can this token do?
              </h1>
              <p className="prose-width mt-4 text-[0.875rem] leading-relaxed text-muted-foreground">
                Paste a {PROVIDERS.map((p) => p.name).join(' or ')} access token to see its
                permissions, the accounts it reaches and the repositories it can change. The token
                is read in your browser and sent only to the service it belongs to.
              </p>
            </>
          )}

          <div className={`max-w-xl ${report ? '' : 'mt-8'}`}>
            <label htmlFor="token" className="block text-sm font-medium">
              Access token
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  id="token"
                  ref={tokenInputRef}
                  type={showToken ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="hf_... or ghp_..."
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pr-11 font-mono"
                  aria-describedby="token-hint"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  aria-pressed={showToken}
                  className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAnalyze} disabled={isLoading || !token.trim()}>
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    'Analyze token'
                  )}
                </Button>
                {(report || analysisError) && (
                  <Button variant="outline" onClick={handleClear}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <p id="token-hint" className="mt-2.5 text-[0.8125rem] text-muted-foreground">
              {detected ? (
                <>
                  Recognised as a {detected.name} token. It will be sent to {detected.name} and
                  nowhere else.
                </>
              ) : (
                <>
                  Reads{' '}
                  {PROVIDERS.map((p, index) => (
                    <span key={p.id}>
                      {index > 0 && ' and '}
                      <a
                        href={p.tokenUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link"
                      >
                        {p.name}
                      </a>
                    </span>
                  ))}{' '}
                  tokens.
                </>
              )}
            </p>
          </div>

          {!report && !analysisError && (
            <div className="mt-14 section-rule pt-8">
              <h2 className="display max-w-[34ch] text-[1.0625rem] font-medium tracking-[-0.01em]">
                Every token lands in one of four places.
              </h2>
              <ul className="mt-5 max-w-2xl">
                {VERDICT_KEY.map(({ level, name, meaning }) => (
                  <li
                    key={name}
                    className={`${SEVERITY_CLASS[level]} sev-rail flex flex-wrap items-baseline gap-x-3 gap-y-0.5 bg-card px-4 py-3`}
                  >
                    <span className="sev-text text-sm font-medium">{name}</span>
                    <span className="text-sm text-muted-foreground">{meaning}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div id="results" className="scroll-mt-4">
          {analysisError && (
            <Notice level="breach" title="That token could not be read">
              {analysisError}
            </Notice>
          )}

          {report && (
            <>
              <section
                className={`${SEVERITY_CLASS[report.verdict.level]} sev-rail mt-12 bg-card px-5 py-6 sm:px-7 sm:py-8`}
                aria-labelledby="verdict"
              >
                <p className="data-label">{report.providerName}</p>
                <h2
                  id="verdict"
                  className="sev-text mt-1 text-[clamp(1.5rem,3.6vw,2.25rem)] font-medium leading-[1.1] tracking-[-0.02em]"
                >
                  {report.verdict.headline}
                </h2>
                <p className="prose-width mt-3 text-[0.875rem] leading-relaxed">
                  <Prose text={report.verdict.summary} />
                </p>

                <dl className="mt-7 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-rule pt-6 sm:grid-cols-2 lg:grid-cols-4">
                  <Datum label="Type">{report.tokenKind}</Datum>
                  <Datum label="Expires">
                    <ExpiryValue expiry={report.expiry} />
                  </Datum>
                  <Datum label="Organizations">
                    <span className="mono">{report.accounts.length}</span>
                  </Datum>
                  <Datum label="Resources reached">
                    {totals ? (
                      <span className="mono">
                        {totals.count}
                        {totals.truncated ? '+' : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Not listed yet</span>
                    )}
                  </Datum>
                </dl>
              </section>

              {report.identity && (
                <section className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <Avatar src={report.identity.avatarUrl} className="h-11 w-11 rounded-full" />
                  <div className="min-w-0">
                    <a
                      href={report.identity.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link font-medium"
                    >
                      {report.identity.fullname || report.identity.handle}
                    </a>
                    <p className="mono text-muted-foreground">@{report.identity.handle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {report.identity.badges.map((badge) => (
                      <Badge key={badge}>{badge}</Badge>
                    ))}
                  </div>
                </section>
              )}

              <Tabs defaultValue="findings" className="mt-10">
                <TabsList label="Token analysis sections" className="border-b border-rule pb-2">
                  <TabsTrigger value="findings">
                    Findings{needsAttention > 0 ? ` (${needsAttention})` : ''}
                  </TabsTrigger>
                  <TabsTrigger value="permissions">Permissions</TabsTrigger>
                  <TabsTrigger value="access">Access</TabsTrigger>
                </TabsList>

                <TabsContent value="findings" className="pt-8">
                  <SectionHead
                    title="Findings"
                    note={
                      needsAttention > 0
                        ? `${needsAttention} worth acting on`
                        : 'Nothing needs attention'
                    }
                  />
                  <ul className="mt-5 space-y-px">
                    {report.findings.map((finding) => (
                      <FindingRow key={finding.title} finding={finding} />
                    ))}
                  </ul>

                  <div className="mt-10 section-rule pt-6">
                    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                      {report.tokenName && (
                        <Datum label="Token name">
                          <span className="mono">{report.tokenName}</span>
                        </Datum>
                      )}
                      <Datum label="Created">
                        <span className="mono">{formatDate(report.createdAt)}</span>
                      </Datum>
                      <Datum label="Expires">
                        <span className="mono">
                          {report.expiry.kind === 'at'
                            ? formatDate(report.expiry.iso)
                            : report.expiry.kind === 'never'
                              ? 'No expiry'
                              : 'Not reported'}
                        </span>
                      </Datum>
                      {report.identity?.email && (
                        <Datum label="Account email">
                          <span className="mono">{report.identity.email}</span>
                        </Datum>
                      )}
                    </dl>
                  </div>
                </TabsContent>

                <TabsContent value="permissions" className="pt-8">
                  {report.permissions.length > 0 ? (
                    <>
                      <SectionHead
                        title="Permissions"
                        note="Write access marked"
                      />
                      <ul className="mt-5 grid grid-cols-1 gap-px sm:grid-cols-2">
                        {report.permissions.map((permission, index) => (
                          <PermissionRow
                            key={permission.label}
                            permission={permission}
                            wide={
                              index === report.permissions.length - 1 &&
                              report.permissions.length % 2 === 1
                            }
                          />
                        ))}
                      </ul>
                    </>
                  ) : (
                    <>
                      <SectionHead title="Permissions" note="Not reported" />
                      {report.notes.map((note) => (
                        <p
                          key={note}
                          className="prose-width mt-5 text-sm leading-relaxed text-muted-foreground"
                        >
                          {note} The repositories it opens are listed under Access, which is the
                          only evidence of its reach available without probing each endpoint.
                        </p>
                      ))}
                    </>
                  )}

                  {report.rawScopes.length > 0 && (
                    <div className="mt-10 section-rule pt-6">
                      <SectionHead
                        title="Scopes"
                        note="Verbatim from provider"
                      />
                      <div className="mt-5 flex flex-wrap gap-1.5">
                        {report.rawScopes.map((scope) => (
                          <Badge key={scope} className="mono">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {report.scopes.length > 0 && (
                    <div className="mt-10 section-rule pt-6">
                      <SectionHead title="Scoped resources" note="Exact targets named" />
                      <ul className="mt-5 space-y-px">
                        {report.scopes.map((scope) => (
                          <li key={`${scope.kind}-${scope.label}`} className="bg-card px-4 py-3">
                            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                              <span className="data-label">{scope.kind}</span>
                              <span className="mono font-medium">{scope.label}</span>
                              {scope.target === 'account' && (
                                <Badge variant="elevated">Whole account</Badge>
                              )}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {scope.permissions.map((perm) => (
                                <Badge key={perm} className="mono">
                                  {perm}
                                </Badge>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="access" className="pt-8">
                  {report.accounts.length > 0 && (
                    <div className="mb-10">
                      <SectionHead
                        title="Organizations"
                        note={`${report.accounts.length} reachable`}
                      />
                      <ul className="mt-5 space-y-px">
                        {report.accounts.map((account) => (
                          <AccountRow key={account.handle} account={account} />
                        ))}
                      </ul>
                    </div>
                  )}

                  <SectionHead
                    title="Repositories"
                    note="What this token opens"
                  />

                  {listError && (
                    <Notice level="breach" title="Listing stopped early">
                      {listError}
                    </Notice>
                  )}

                  {!groups ? (
                    <div className="mt-5 bg-card px-5 py-8">
                      <p className="prose-width text-sm leading-relaxed text-muted-foreground">
                        Listing repositories takes a few extra requests to {report.providerName}, so
                        it runs only when you ask for it.
                      </p>
                      <Button onClick={handleList} disabled={isListing} className="mt-4">
                        {isListing ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Listing repositories
                          </>
                        ) : (
                          'List repositories'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-10">
                      {totals && totals.truncated && (
                        <Notice level="elevated" title="Counts are a floor, not a total">
                          At least one listing stopped before the end, so this token may reach more
                          than is shown here.
                        </Notice>
                      )}

                      {(totals?.count ?? 0) > 0 && (
                        <AccessFilters
                          facets={facets}
                          filters={filters}
                          onToggle={toggleFacet}
                          onQuery={(query) => setFilters((prev) => ({ ...prev, query }))}
                          onFlag={(key, value) =>
                            setFilters((prev) => ({ ...prev, [key]: value }))
                          }
                          onClear={() => setFilters(EMPTY_FILTERS)}
                          shown={shown}
                          total={totals?.count ?? 0}
                        />
                      )}

                      {filtered?.map(({ group, resources }) => (
                        <ResourceGroupSection
                          key={group.owner}
                          group={{ ...group, resources }}
                          totalCount={group.resources.length}
                        />
                      ))}

                      {(totals?.count ?? 0) > 0 && shown === 0 && (
                        <p className="prose-width text-sm leading-relaxed text-muted-foreground">
                          Nothing matches these filters.{' '}
                          <button
                            type="button"
                            onClick={() => setFilters(EMPTY_FILTERS)}
                            className="link"
                          >
                            Show all {totals?.count ?? 0}
                          </button>
                          .
                        </p>
                      )}

                      {(totals?.count ?? 0) === 0 && (
                        <p className="prose-width text-sm leading-relaxed text-muted-foreground">
                          This token did not open any repository. For a scoped token that usually
                          means its scopes name resources that no longer exist, or that an
                          organization restriction is blocking the request.
                        </p>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </main>

      <footer className="mt-auto border-t border-rule">
        <div className="prose-width mx-auto max-w-4xl px-4 py-8 text-[0.8125rem] leading-relaxed text-muted-foreground sm:px-6">
          <p>
            Your token is read in the browser and sent only to the service it belongs to. This page
            counts anonymous visits with Umami; that never includes your token or anything read
            with it.
          </p>
          <p className="mt-2">
            Built for the security community.{' '}
            <a
              href="https://github.com/Devang-Solanki/hf-token-analyzer"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Source on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

/**
 * The day/night switch from devanghacks.in. `checked` is night, matching the
 * original, and the checkbox stays a real checkbox so it keeps its keyboard
 * behaviour and its label.
 */
function ThemeSwitch({
  dark,
  onChange,
}: {
  dark: boolean;
  onChange: (dark: boolean) => void;
}) {
  return (
    <div className="theme-switch-wrap" title="Toggle light / dark theme">
      <label className="switch">
        <input
          type="checkbox"
          aria-label="Toggle light and dark theme"
          checked={dark}
          onChange={(event) => onChange(event.target.checked)}
        />
        <div className="slider round white">
          <img className="clouds cloud1" src="/theme-switch/clouds.png" alt="" />
          <img className="clouds cloud2" src="/theme-switch/clouds.png" alt="" />
          <div className="night" />
          <img className="balloon" src="/theme-switch/balloon.png" alt="" />
          <p className="star">&#10022;</p>
          <p className="star">&#10022;</p>
          <p className="star">&#10022;</p>
          <p className="star">&#10022;</p>
          <p className="star">&#10022;</p>
          <img className="spaceship" src="/theme-switch/spaceship.png" alt="" />
        </div>
      </label>
    </div>
  );
}

/** Renders `backticked` fragments as inline code without a markdown dependency. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code key={index} className="mono bg-secondary px-1 py-0.5 text-[var(--code-ink)]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        )
      )}
    </>
  );
}

function ExpiryValue({ expiry }: { expiry: Expiry }) {
  if (expiry.kind === 'never') {
    return <span className="sev sev-elevated sev-text font-medium">Never</span>;
  }
  if (expiry.kind === 'unknown') {
    return <span className="text-muted-foreground">Not reported</span>;
  }
  const remaining = timeUntil(expiry.iso);
  if (remaining === 'Expired') {
    return <span className="sev sev-breach sev-text font-medium">Expired</span>;
  }
  return <span className="mono">{remaining}</span>;
}

function SeverityIcon({ level }: { level: Level }) {
  const className = 'h-4 w-4 shrink-0 sev-text';
  if (level === 'breach' || level === 'total') return <ShieldAlert className={className} />;
  if (level === 'elevated') return <AlertTriangle className={className} />;
  if (level === 'contained') return <ShieldCheck className={className} />;
  return <Info className={className} />;
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className={`${SEVERITY_CLASS[finding.level]} sev-rail bg-card px-4 py-4`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <SeverityIcon level={finding.level} />
        <h4 className="font-medium">{finding.title}</h4>
        <span className="ml-auto sev-chip">{LEVEL_WORD[finding.level]}</span>
      </div>
      <p className="prose-width mt-1.5 text-sm leading-relaxed text-muted-foreground">
        <Prose text={finding.detail} />
      </p>
    </li>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h3 className="display text-[1.0625rem] font-medium tracking-[-0.01em]">{title}</h3>
      {note && <p className="data-label">{note}</p>}
    </div>
  );
}

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="data-label">{label}</dt>
      <dd className="mt-1 break-words">{children}</dd>
    </div>
  );
}

function Notice({
  level,
  title,
  children,
}: {
  level: Level;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={level === 'breach' ? 'alert' : 'status'}
      className={`${SEVERITY_CLASS[level]} sev-rail mt-6 bg-card px-4 py-4`}
    >
      <div className="flex items-center gap-2.5">
        <SeverityIcon level={level} />
        <h4 className="font-medium">{title}</h4>
      </div>
      <p className="prose-width mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

/** Avatar with a graceful fallback when the image fails to load. */
function Avatar({ src, className }: { src?: string; className: string }) {
  const [failed, setFailed] = useState(!src);

  if (failed) {
    return <div className={`${className} bg-secondary`} aria-hidden="true" />;
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${className} border border-rule object-cover`}
      onError={() => setFailed(true)}
    />
  );
}

function PermissionRow({ permission, wide }: { permission: PermissionEntry; wide?: boolean }) {
  const { label, allowed, risky } = permission;
  const level: Level = allowed && risky ? 'elevated' : allowed ? 'contained' : 'info';

  return (
    <li
      className={`${SEVERITY_CLASS[level]} flex items-center gap-3 bg-card px-4 py-3 ${
        wide ? 'sm:col-span-2' : ''
      } ${allowed ? '' : 'text-muted-foreground'}`}
    >
      {allowed ? (
        <Check className="h-4 w-4 shrink-0 sev-text" />
      ) : (
        <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className={`text-sm ${allowed ? 'font-medium' : ''}`}>{label}</span>
      <span className="sr-only">{allowed ? ': allowed' : ': not allowed'}</span>
    </li>
  );
}

function AccountRow({ account }: { account: AccountRef }) {
  return (
    <li>
      <a
        href={account.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3.5 rounded-md bg-card px-4 py-4 hover:bg-secondary"
      >
        <Avatar src={account.avatarUrl} className="h-10 w-10 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {account.fullname && <span className="truncate font-medium">{account.fullname}</span>}
            <span className="mono text-muted-foreground">@{account.handle}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {account.role && <Badge>Your role: {account.role}</Badge>}
            {account.badges.map((badge) => (
              <Badge key={badge}>{badge}</Badge>
            ))}
            {account.warnings.map((warning) => (
              <Badge key={warning} variant="elevated">
                <AlertTriangle className="h-3 w-3" />
                {warning}
              </Badge>
            ))}
          </div>
        </div>
      </a>
    </li>
  );
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-rule text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
      {count !== undefined && <span className="mono text-[0.6875rem] opacity-70">{count}</span>}
    </button>
  );
}

function FacetDivider() {
  return <span className="mx-1 h-5 w-px self-center bg-rule" aria-hidden="true" />;
}

interface Facets {
  kinds: [string, number][];
  visibility: [string, number][];
  writable: number;
  gated: number;
}

/**
 * Filters are framed around the question people actually bring to a leaked
 * credential - what is private, and what can it change - rather than being a
 * plain taxonomy of the listing.
 */
function AccessFilters({
  facets,
  filters,
  onToggle,
  onQuery,
  onFlag,
  onClear,
  shown,
  total,
}: {
  facets: Facets;
  filters: Filters;
  onToggle: (key: 'kinds' | 'visibility', value: string) => void;
  onQuery: (query: string) => void;
  onFlag: (key: 'writableOnly' | 'gatedOnly', value: boolean) => void;
  onClear: () => void;
  shown: number;
  total: number;
}) {
  const active = filtersActive(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label htmlFor="resource-search" className="sr-only">
            Filter by name
          </label>
          <Input
            id="resource-search"
            type="search"
            placeholder="Filter by name"
            value={filters.query}
            onChange={(event) => onQuery(event.target.value)}
            className="h-9 font-mono text-[0.8125rem]"
          />
        </div>
        <p className="data-label" role="status">
          {active ? `${shown} of ${total} shown` : `${total} in total`}
        </p>
        {active && (
          <button
            type="button"
            onClick={onClear}
            className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground hover:text-accent-text"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-stretch gap-1.5">
        {facets.kinds.map(([kind, count]) => (
          <FilterChip
            key={kind}
            active={filters.kinds.has(kind)}
            count={count}
            onClick={() => onToggle('kinds', kind)}
          >
            {KIND_PLURAL[kind] ?? kind}
          </FilterChip>
        ))}

        {facets.kinds.length > 0 && facets.visibility.length > 0 && <FacetDivider />}

        {facets.visibility.map(([label, count]) => (
          <FilterChip
            key={label}
            active={filters.visibility.has(label)}
            count={count}
            onClick={() => onToggle('visibility', label)}
          >
            {label}
          </FilterChip>
        ))}

        {(facets.writable > 0 || facets.gated > 0) && <FacetDivider />}

        {facets.writable > 0 && (
          <FilterChip
            active={filters.writableOnly}
            count={facets.writable}
            onClick={() => onFlag('writableOnly', !filters.writableOnly)}
          >
            Writable
          </FilterChip>
        )}

        {facets.gated > 0 && (
          <FilterChip
            active={filters.gatedOnly}
            count={facets.gated}
            onClick={() => onFlag('gatedOnly', !filters.gatedOnly)}
          >
            Gated
          </FilterChip>
        )}
      </div>
    </div>
  );
}

const KIND_ICON: Record<string, typeof Box> = {
  model: Box,
  dataset: Database,
  space: LayoutTemplate,
  repository: FileCode2,
  fork: GitFork,
  gist: StickyNote,
};

const KIND_PLURAL: Record<string, string> = {
  model: 'Models',
  dataset: 'Datasets',
  space: 'Spaces',
  repository: 'Repositories',
  fork: 'Forks',
  gist: 'Gists',
};

function ResourceGroupSection({
  group,
  totalCount,
}: {
  group: ResourceGroup;
  totalCount?: number;
}) {
  const byKind = useMemo(() => {
    const map = new Map<string, ResourceRef[]>();
    for (const resource of group.resources) {
      const list = map.get(resource.kind);
      if (list) list.push(resource);
      else map.set(resource.kind, [resource]);
    }
    return [...map.entries()];
  }, [group.resources]);

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 border-b border-rule pb-3">
        <h4 className="mono font-medium">@{group.owner}</h4>
        <span className="data-label">
          {totalCount !== undefined && totalCount !== group.resources.length
            ? `${group.resources.length} of ${totalCount}${group.truncated ? '+' : ''} shown`
            : `${group.resources.length}${group.truncated ? '+' : ''} reachable`}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {group.role && <Badge>{group.role}</Badge>}
          {group.writable && <Badge variant="elevated">Writable</Badge>}
        </div>
      </div>

      <div className="mt-4 space-y-5">
        {byKind.map(([kind, resources]) => (
          <div key={kind}>
            <p className="data-label">
              {KIND_PLURAL[kind] ?? `${kind[0].toUpperCase()}${kind.slice(1)}s`} (
              {resources.length})
            </p>
            <ul className="mt-2 space-y-px">
              {resources.map((resource) => (
                <li key={resource.id}>
                  <ResourceRow resource={resource} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResourceRow({ resource }: { resource: ResourceRef }) {
  const Icon = KIND_ICON[resource.kind] ?? FileCode2;

  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-md bg-card px-4 py-3 hover:bg-secondary"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="mono min-w-0 flex-1 truncate">{resource.id}</span>

      <span className="hidden items-center gap-3 text-[0.8125rem] text-muted-foreground sm:flex">
        {resource.downloads !== undefined && (
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" aria-hidden="true" />
            {resource.downloads.toLocaleString()}
            <span className="sr-only">downloads</span>
          </span>
        )}
        {resource.likes !== undefined && (
          <span className="flex items-center gap-1">
            {resource.kind === 'repository' || resource.kind === 'fork' ? (
              <Star className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Heart className="h-3 w-3" aria-hidden="true" />
            )}
            {resource.likes}
            <span className="sr-only">
              {resource.kind === 'repository' || resource.kind === 'fork' ? 'stars' : 'likes'}
            </span>
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-1.5">
        {resource.writable && <Badge variant="elevated">Writable</Badge>}
        {resource.private ? (
          <Badge>
            {/* Unlisted is not locked: anyone with the link gets in. */}
            {resource.visibilityLabel === 'Secret' ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            {resource.visibilityLabel ?? 'Private'}
          </Badge>
        ) : (
          <Badge>
            <Globe className="h-3 w-3" />
            {resource.visibilityLabel ?? 'Public'}
          </Badge>
        )}
        {resource.gated && <Badge variant="elevated">Gated</Badge>}
      </span>
    </a>
  );
}

export default App;
