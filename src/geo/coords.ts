export type LonLat = [lon: number, lat: number]

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}
