import { describe, expect, it, vi } from 'vitest'
import {
  watchRegistration,
  type ServiceWorkerContainerLike,
  type ServiceWorkerLike,
  type ServiceWorkerRegistrationLike,
} from './serviceWorker'

function fakeTarget<T extends Record<string, unknown>>(base: T) {
  const listeners = new Map<string, (() => void)[]>()
  return {
    ...base,
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    emit(type: string) {
      for (const fn of listeners.get(type) ?? []) fn()
    },
  }
}

describe('service worker update watcher', () => {
  it('does not trigger on first install when no controller exists yet', () => {
    const worker = fakeTarget({ state: 'installing', postMessage: vi.fn() })
    const reg = fakeTarget({ waiting: null, installing: worker })
    const container = fakeTarget({ controller: null })
    const onUpdate = vi.fn()

    watchRegistration(
      reg as unknown as ServiceWorkerRegistrationLike,
      onUpdate,
      container as unknown as ServiceWorkerContainerLike,
      vi.fn(),
    )
    reg.emit('updatefound')
    worker.state = 'installed'
    worker.emit('statechange')

    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('notifies once when a worker is already waiting and reloads on apply', () => {
    const waiting = fakeTarget({ state: 'installed', postMessage: vi.fn() })
    const reg = fakeTarget({ waiting, installing: null })
    const container = fakeTarget({ controller: {} })
    const reload = vi.fn()
    const onUpdate = vi.fn()

    watchRegistration(
      reg as unknown as ServiceWorkerRegistrationLike,
      onUpdate,
      container as unknown as ServiceWorkerContainerLike,
      reload,
    )
    expect(onUpdate).toHaveBeenCalledTimes(1)

    const applyUpdate = onUpdate.mock.calls[0][0] as () => void
    applyUpdate()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload).not.toHaveBeenCalled()

    container.emit('controllerchange')
    container.emit('controllerchange')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('notifies when a new update finishes installing behind an active controller', () => {
    const installing = fakeTarget({
      state: 'installing',
      postMessage: vi.fn(),
    }) as ServiceWorkerLike & {
      emit: (type: string) => void
    }
    const reg = fakeTarget({ waiting: null, installing: null as ServiceWorkerLike | null })
    const container = fakeTarget({ controller: {} })
    const onUpdate = vi.fn()

    watchRegistration(
      reg as unknown as ServiceWorkerRegistrationLike,
      onUpdate,
      container as unknown as ServiceWorkerContainerLike,
      vi.fn(),
    )
    expect(onUpdate).not.toHaveBeenCalled()

    reg.installing = installing
    reg.emit('updatefound')
    installing.state = 'installed'
    installing.emit('statechange')
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
