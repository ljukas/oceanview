import { describe, expect, test } from 'vitest'
import type { SharePartRow } from '~/lib/services/share'
import { collapseShares } from './collapse'

function part(id: string): SharePartRow {
  const shareCode = id[0] as SharePartRow['shareCode']
  const partNumber = Number(id.slice(1))
  return { id, shareCode, partNumber }
}

describe('collapseShares', () => {
  test('returns empty for empty input', () => {
    expect(collapseShares([])).toEqual([])
  })

  test('renders both halves as a single whole badge', () => {
    expect(collapseShares([part('A1'), part('A2')])).toEqual([{ kind: 'whole', shareCode: 'A' }])
  })

  test('renders a lone half as a part badge', () => {
    expect(collapseShares([part('A1')])).toEqual([{ kind: 'part', shareCode: 'A', partNumber: 1 }])
    expect(collapseShares([part('A2')])).toEqual([{ kind: 'part', shareCode: 'A', partNumber: 2 }])
  })

  test('handles a mix of whole, half, and many shares — sorted A → J', () => {
    expect(collapseShares([part('C2'), part('A1'), part('A2'), part('B1')])).toEqual([
      { kind: 'whole', shareCode: 'A' },
      { kind: 'part', shareCode: 'B', partNumber: 1 },
      { kind: 'part', shareCode: 'C', partNumber: 2 },
    ])
  })

  test('ignores duplicates', () => {
    expect(collapseShares([part('A1'), part('A1'), part('A2')])).toEqual([
      { kind: 'whole', shareCode: 'A' },
    ])
  })
})
