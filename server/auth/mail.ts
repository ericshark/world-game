export interface Mail {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
}

/**
 * Development mail: printed to the console and kept in memory for the dev-only mailbox
 * endpoint, so sign-in can be tried and tested without an email account.
 */
export class DevMailer implements Mailer {
  readonly outbox: Mail[] = []
  private readonly log: (line: string) => void

  constructor(log: (line: string) => void = console.log) {
    this.log = log
  }

  async send(mail: Mail) {
    this.outbox.push(mail)
    if (this.outbox.length > 50) this.outbox.shift()
    this.log(`[dev mail] to ${mail.to}: ${mail.subject}\n${mail.text}`)
  }
}

/** Sends through Resend's HTTP API. */
export class ResendMailer implements Mailer {
  private readonly apiKey: string
  private readonly from: string
  private readonly fetcher: typeof fetch

  constructor(apiKey: string, from: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey
    this.from = from
    this.fetcher = fetcher
  }

  async send(mail: Mail) {
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      }),
    })
    if (!response.ok) throw new Error(`Resend refused the email (${response.status}).`)
  }
}
