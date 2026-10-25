import { githubProvider } from './github';
import { gitlabProvider } from './gitlab';
import { huggingfaceProvider } from './huggingface';
import type { Provider } from './types';

export const PROVIDERS: Provider[] = [huggingfaceProvider, githubProvider, gitlabProvider];

/**
 * Identify the provider from the token's format alone. Nothing is sent
 * anywhere until a provider claims the token, so a credential for a service
 * this tool does not support is never transmitted by accident.
 */
export function detectProvider(token: string): Provider | null {
  return PROVIDERS.find((provider) => provider.detect(token)) ?? null;
}

export * from './types';
