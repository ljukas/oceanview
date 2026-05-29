import type { SharePartRow } from '~/lib/services/share'
import { SHARE_CODES, type ShareCode } from './codes'

export type ShareBadgeKind =
  | { kind: 'whole'; shareCode: ShareCode }
  | { kind: 'part'; shareCode: ShareCode; partNumber: 1 | 2 }

// Group owned parts by shareCode. A user who owns both A1 and A2 reads as
// "owns share A" — collapse the pair into a single `whole` badge. Halves stay
// as their own `part` badges. Output is sorted A → J for stable rendering.
export function collapseShares(parts: ReadonlyArray<SharePartRow>): ShareBadgeKind[] {
  const byCode = new Map<ShareCode, Set<1 | 2>>()
  for (const p of parts) {
    if (p.partNumber !== 1 && p.partNumber !== 2) continue
    const code = p.shareCode
    const set = byCode.get(code) ?? new Set<1 | 2>()
    set.add(p.partNumber)
    byCode.set(code, set)
  }

  const out: ShareBadgeKind[] = []
  for (const code of SHARE_CODES) {
    const set = byCode.get(code)
    if (!set || set.size === 0) continue
    if (set.has(1) && set.has(2)) {
      out.push({ kind: 'whole', shareCode: code })
    } else {
      for (const partNumber of [1, 2] as const) {
        if (set.has(partNumber)) out.push({ kind: 'part', shareCode: code, partNumber })
      }
    }
  }
  return out
}
