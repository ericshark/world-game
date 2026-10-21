const numberFormat = new Intl.NumberFormat('en-US')

export function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value))
}

export function formatKm(km: number): string {
  return `${formatNumber(km)} km`
}
