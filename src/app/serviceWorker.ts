export interface ServiceWorkerLike {
  state: string
  postMessage(message: unknown): void
  addEventListener(type: 'statechange', listener: () => void): void
}

export interface ServiceWorkerRegistrationLike {
  waiting: ServiceWorkerLike | null
  installing: ServiceWorkerLike | null
  addEventListener(type: 'updatefound', listener: () => void): void
}

export interface ServiceWorkerContainerLike {
  controller: unknown
  addEventListener(type: 'controllerchange', listener: () => void): void
}

/**
 * Watches a ServiceWorkerRegistration for a waiting or newly installed update, calling `onUpdate`
 * at most once with an `applyUpdate` callback that activates the waiting worker and reloads.
 */
export function watchRegistration(
  registration: ServiceWorkerRegistrationLike,
  onUpdate: (applyUpdate: () => void) => void,
  container: ServiceWorkerContainerLike,
  reload: () => void = () => window.location.reload(),
) {
  let notified = false
  let reloading = false

  const notify = (worker: ServiceWorkerLike) => {
    if (notified) return
    notified = true
    const applyUpdate = () => {
      container.addEventListener('controllerchange', () => {
        if (reloading) return
        reloading = true
        reload()
      })
      worker.postMessage({ type: 'SKIP_WAITING' })
    }
    onUpdate(applyUpdate)
  }

  if (registration.waiting && container.controller) {
    notify(registration.waiting)
    return
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && container.controller) {
        notify(installing)
      }
    })
  })
}

let registered = false

/** Registers the generated `/sw.js` in production builds and announces updates via `onUpdate`. */
export function registerServiceWorker(onUpdate: (applyUpdate: () => void) => void) {
  if (registered || !import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  registered = true
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => watchRegistration(reg, onUpdate, navigator.serviceWorker))
    .catch(() => {
      registered = false
    })
}
