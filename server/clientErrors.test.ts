import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DevMailer } from './auth/mail'
import { CLIENT_ERRORS_PER_IP_PER_HOUR } from './clientErrors'
import { loadConfig } from './config'
import { loadServerGeo, startServer, type RunningServer } from './index'
import { testBrowser } from './testBrowser'

const geo = loadServerGeo()
let server: RunningServer
let logged: string[]

beforeEach(async () => {
  logged = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void logged.push(line))
  server = await startServer({
    config: loadConfig({}, { port: 0, host: '127.0.0.1', databasePath: ':memory:', distDir: null }),
    geo,
    mailer: new DevMailer(() => {}),
  })
})

afterEach(async () => {
  await server.close()
  vi.restoreAllMocks()
})

const reports = () =>
  logged.map((line) => JSON.parse(line)).filter((entry) => entry.event === 'client_error')

describe('client crash reports', () => {
  it('logs the id, message, a short stack and only the screen name', async () => {
    const response = await testBrowser(server).request('/api/client-error', {
      body: {
        id: 'AB12CD-and-more',
        message: 'x'.repeat(1000),
        stack: Array.from({ length: 20 }, (_, i) => `at line ${i}`).join('\n'),
        route: '#/signin/secret-token',
        email: 'ana@example.com',
      },
    })
    expect(response.status).toBe(204)
    const [report] = reports()
    expect(report).toMatchObject({ level: 'error', id: 'AB12CD-a', screen: 'signin' })
    expect(report.message).toHaveLength(300)
    expect(report.stack.split('\n')).toHaveLength(6)
    expect(JSON.stringify(report)).not.toMatch(/secret-token|ana@example/)
  })

  it('limits how many reports one address may send', async () => {
    const browser = testBrowser(server)
    for (let i = 0; i < CLIENT_ERRORS_PER_IP_PER_HOUR; i++) {
      expect((await browser.request('/api/client-error', { body: { id: 'A' } })).status).toBe(204)
    }
    expect((await browser.request('/api/client-error', { body: { id: 'A' } })).status).toBe(429)
  })
})
