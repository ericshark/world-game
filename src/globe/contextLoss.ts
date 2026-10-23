export type ContextState = 'ok' | 'lost'

/**
 * Reports when the browser takes the graphics context away (a phone low on memory, a GPU reset)
 * and gives it back. The renderer rebuilds itself on restore as long as the loss is not
 * cancelled, so the loss event's default action is prevented.
 */
export function watchContextLoss(
  canvas: HTMLCanvasElement,
  onChange: (state: ContextState) => void,
): () => void {
  const lost = (event: Event) => {
    event.preventDefault()
    onChange('lost')
  }
  const restored = () => onChange('ok')
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', restored)
  return () => {
    canvas.removeEventListener('webglcontextlost', lost)
    canvas.removeEventListener('webglcontextrestored', restored)
  }
}

/** Whether this browser can make a WebGL context at all. */
export function webglSupported(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
