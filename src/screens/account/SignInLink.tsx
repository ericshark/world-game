import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { HomeScreen } from '../HomeScreen'
import { Sheet } from '../../ui/Sheet'

/** Where an emailed sign-in link lands: spends the link, then shows the account. */
export function SignInLink({ token }: { token: string }) {
  const { account, navigate } = useApp()
  const [failure, setFailure] = useState<string | null>(null)
  const started = useRef(false)
  const ready = account.status !== 'checking'
  const problem =
    failure ?? (account.status === 'offline' ? 'There is no game server to sign in to.' : null)

  useEffect(() => {
    // A link works once; React may run effects twice in development.
    if (!ready || started.current) return
    started.current = true
    if (account.status === 'offline') return
    account.redeemLink(token).then((failed) => {
      if (failed) setFailure(failed)
      else navigate({ name: 'settings' }, { replace: true })
    })
  }, [ready, account, token, navigate])

  return (
    <>
      <HomeScreen />
      <Sheet
        title={problem ? 'Could not sign you in' : 'Signing you in…'}
        onClose={() => navigate({ name: 'home' }, { replace: true })}
      >
        <p className="sheet__text" role={problem ? 'alert' : 'status'}>
          {problem ?? 'One moment.'}
        </p>
      </Sheet>
    </>
  )
}
