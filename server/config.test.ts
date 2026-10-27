import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('config', () => {
  it('has development defaults', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({ port: 8788, publicOrigin: 'http://localhost:8788' })
    expect(config.google).toBeNull()
    expect(config.resendApiKey).toBeNull()
    expect(config.dailySecret).toHaveLength(64)
  })

  it('reads environment variables', () => {
    const config = loadConfig({
      PORT: '9000',
      PUBLIC_ORIGIN: 'https://play.example.com/',
      DATABASE_PATH: '/data/wg.sqlite',
      DAILY_SECRET: 's3cret',
      RESEND_API_KEY: 're_123',
      GITHUB_CLIENT_ID: 'id',
      GITHUB_CLIENT_SECRET: 'secret',
      GOOGLE_CLIENT_ID: 'only-id',
      TRUST_PROXY: '1',
      CLIENT_IP_HEADER: ' Fly-Client-IP ',
    })
    expect(config).toMatchObject({
      port: 9000,
      publicOrigin: 'https://play.example.com',
      databasePath: '/data/wg.sqlite',
      dailySecret: 's3cret',
      resendApiKey: 're_123',
      github: { clientId: 'id', clientSecret: 'secret' },
      google: null,
      trustProxy: true,
      clientIpHeader: 'fly-client-ip',
    })
    expect(loadConfig({}).clientIpHeader).toBeNull()
  })

  it('refuses to run in production without a daily secret', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DAILY_SECRET/)
    expect(loadConfig({ NODE_ENV: 'production', DAILY_SECRET: 'x' }).production).toBe(true)
  })
})
