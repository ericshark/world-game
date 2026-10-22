// A small set of inline icons (24px grid, stroke-based) so the UI needs no icon font or library.

const PATHS = {
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z',
  pin: 'M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.9-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  gem: 'M6 3h12l4 6-10 12L2 9l4-6Zm-4 6h20M9 3l3 18M15 3l-3 18',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.8-4.8',
  swords: 'M4 4l9 9m-2 2 2 2 2-2-2-2M20 4l-9 9m2 2-2 2-2-2 2-2M5 19l2-2m12 2-2-2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.2-1.3L14.4 2h-4l-.4 2.4a7.4 7.4 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1c.6.6 1.4 1 2.2 1.3l.4 2.4h4l.4-2.4c.8-.3 1.6-.7 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  close: 'M6 6l12 12M18 6 6 18',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2.5 6.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01',
  flame:
    'M12 22c4 0 7-2.8 7-6.8 0-3.6-2.6-5.7-4-8.2-.6 2-1.6 3-3 3.3.6-2.8-.4-5.5-3-8.3.3 4-4 6.6-4 11.4C5 18.6 8 22 12 22Z',
  check: 'M5 12.5 10 17 19 7',
  back: 'M15 5l-7 7 7 7',
  sound: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9H4Zm12 .5 5 5m0-5-5 5',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',
  crosshair: 'M12 3v5m0 8v5M3 12h5m8 0h5m-9-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4m-4 2v4m-4 2h8',
  play: 'M8 5v14l11-7L8 5Z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
