// A fake browser for server tests: it keeps cookies between requests.
export function testBrowser(server: { port: number }) {
  const cookies = new Map<string, string>()
  const request = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: 'manual',
    })
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';')
      const [name, ...value] = pair.split('=')
      if (/max-age=0/i.test(line) || value.join('=') === '') cookies.delete(name)
      else cookies.set(name, value.join('='))
    }
    const text = await response.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // Redirects have no body.
    }
    return { status: response.status, json, response }
  }
  return { cookies, request }
}

export type TestBrowser = ReturnType<typeof testBrowser>
