// Glicko-2 ratings (Glickman, 2013: http://www.glicko.net/glicko/glicko2.pdf), on the familiar
// scale where a new player is 1500 with a deviation of 350.

export interface Rating {
  rating: number
  /** Rating deviation: how unsure the rating is. */
  rd: number
  /** Volatility: how erratic the player's results are. */
  vol: number
}

export const NEW_RATING: Rating = { rating: 1500, rd: 350, vol: 0.06 }
/** How strongly volatility may change; smaller values keep it steadier. */
const TAU = 0.5
const SCALE = 173.7178
const EPSILON = 1e-6

export interface Result {
  opponent: Rating
  /** 1 for a win, 0.5 for a draw, 0 for a loss. */
  score: number
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
const expected = (mu: number, muJ: number, phiJ: number) =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)))

/** A player's new rating after one rating period's results. */
export function updateRating(player: Rating, results: Result[], tau = TAU): Rating {
  const mu = (player.rating - 1500) / SCALE
  const phi = player.rd / SCALE
  const sigma = player.vol

  if (results.length === 0) {
    // No games: only the uncertainty grows.
    return { ...player, rd: Math.min(350, Math.sqrt(phi * phi + sigma * sigma) * SCALE) }
  }

  const games = results.map(({ opponent, score }) => {
    const muJ = (opponent.rating - 1500) / SCALE
    const phiJ = opponent.rd / SCALE
    return { gj: g(phiJ), e: expected(mu, muJ, phiJ), score }
  })
  const v = 1 / games.reduce((sum, { gj, e }) => sum + gj * gj * e * (1 - e), 0)
  const delta = v * games.reduce((sum, { gj, e, score }) => sum + gj * (score - e), 0)

  // Find the new volatility by the iterative method in the paper (the Illinois algorithm).
  const a = Math.log(sigma * sigma)
  const f = (x: number) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) /
      (2 * (phi * phi + v + Math.exp(x)) ** 2) -
    (x - a) / (tau * tau)
  let A = a
  let B: number
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v)
  else {
    let k = 1
    while (f(a - k * tau) < 0) k++
    B = a - k * tau
  }
  let fA = f(A)
  let fB = f(B)
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else {
      fA /= 2
    }
    B = C
    fB = fC
  }
  const newSigma = Math.exp(A / 2)

  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma)
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v)
  const newMu =
    mu + newPhi * newPhi * games.reduce((sum, { gj, e, score }) => sum + gj * (score - e), 0)
  return { rating: newMu * SCALE + 1500, rd: newPhi * SCALE, vol: newSigma }
}
