import { decodeIdToken, generateCodeVerifier, generateState, GitHub, Google } from 'arctic'
import type { ServerConfig } from '../config'

export type OAuthProviderId = 'google' | 'github'

export interface OAuthIdentity {
  /** The provider's stable id for the person. */
  subject: string
  email: string | null
  emailVerified: boolean
}

export interface OAuthProvider {
  id: OAuthProviderId
  authorizationUrl(state: string, verifier: string): URL
  /** Trades the callback's code for who signed in. */
  identify(code: string, verifier: string): Promise<OAuthIdentity>
}

export { generateCodeVerifier, generateState }

export function callbackUrl(config: ServerConfig, id: OAuthProviderId): string {
  return `${config.publicOrigin}/api/auth/${id}/callback`
}

function googleProvider(config: ServerConfig): OAuthProvider | null {
  if (!config.google) return null
  const client = new Google(
    config.google.clientId,
    config.google.clientSecret,
    callbackUrl(config, 'google'),
  )
  return {
    id: 'google',
    authorizationUrl: (state, verifier) =>
      client.createAuthorizationURL(state, verifier, ['openid', 'email']),
    async identify(code, verifier) {
      const tokens = await client.validateAuthorizationCode(code, verifier)
      const claims = decodeIdToken(tokens.idToken()) as {
        sub?: string
        email?: string
        email_verified?: boolean
      }
      if (!claims.sub) throw new Error('Google sent no account id.')
      return {
        subject: claims.sub,
        email: claims.email ?? null,
        emailVerified: claims.email_verified === true,
      }
    },
  }
}

function githubProvider(config: ServerConfig): OAuthProvider | null {
  if (!config.github) return null
  const client = new GitHub(
    config.github.clientId,
    config.github.clientSecret,
    callbackUrl(config, 'github'),
  )
  const call = async (path: string, token: string) => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'world-game',
      },
    })
    if (!response.ok) throw new Error(`GitHub answered ${response.status}.`)
    return response.json() as Promise<unknown>
  }
  return {
    id: 'github',
    authorizationUrl: (state) => client.createAuthorizationURL(state, ['user:email']),
    async identify(code) {
      const token = (await client.validateAuthorizationCode(code)).accessToken()
      const user = (await call('/user', token)) as { id?: number }
      if (typeof user.id !== 'number') throw new Error('GitHub sent no account id.')
      const emails = (await call('/user/emails', token)) as {
        email: string
        primary: boolean
        verified: boolean
      }[]
      const primary = emails.find((entry) => entry.primary && entry.verified)
      return {
        subject: String(user.id),
        email: primary?.email ?? null,
        emailVerified: primary !== undefined,
      }
    },
  }
}

/** Providers are on only when their client id and secret are configured. */
export function configuredProviders(config: ServerConfig): Map<OAuthProviderId, OAuthProvider> {
  const providers = new Map<OAuthProviderId, OAuthProvider>()
  for (const provider of [googleProvider(config), githubProvider(config)]) {
    if (provider) providers.set(provider.id, provider)
  }
  return providers
}
