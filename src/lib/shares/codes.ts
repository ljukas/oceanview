export const SHARE_CODES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const

export type ShareCode = (typeof SHARE_CODES)[number]

export const PARTS_PER_SHARE = 2
export const WEEKS_PER_SEASON = SHARE_CODES.length * PARTS_PER_SHARE

// Shares rotate -3 positions year-over-year (J → G → D → A → H → …). Stored
// per-season so admins can deviate when calendar quirks demand it; this is
// just the default used when creating a new season after an existing one.
export const DEFAULT_YEAR_ROTATION = -3

// The reference row in the historical schedule: 2024 starts at share J.
export const ANCHOR_START_SHARE: ShareCode = 'J'

export function isShareCode(value: string): value is ShareCode {
  return (SHARE_CODES as readonly string[]).includes(value)
}

export function shareIndexOf(code: ShareCode): number {
  return SHARE_CODES.indexOf(code)
}

export function rotateShare(code: ShareCode, offset: number): ShareCode {
  const n = SHARE_CODES.length
  const idx = (((shareIndexOf(code) + offset) % n) + n) % n
  return SHARE_CODES[idx]
}

export type SharePartId = `${ShareCode}${1 | 2}`

export function sharePartId(code: ShareCode, partNumber: 1 | 2): SharePartId {
  return `${code}${partNumber}`
}
