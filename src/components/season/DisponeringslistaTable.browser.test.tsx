import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { DisponeringslistaTable } from '~/components/season/DisponeringslistaTable'
import { buildSchedules } from '~/lib/services/season/logic'
import type { ShareCode } from '~/lib/shares/codes'
import { m } from '~/paraglide/messages'

const ERA = { fromYear: 2024, startWeek: 21, startShare: 'J' as const }
const y2026 = buildSchedules([ERA], 2026).find((s) => s.year === 2026)
if (!y2026) throw new Error('fixture: 2026 schedule missing')

const NO_SHARES: ReadonlySet<ShareCode> = new Set()

test('wide layout renders one merged cell per share', async () => {
  await page.viewport(1280, 800)
  const screen = await render(
    <DisponeringslistaTable schedules={[y2026]} ownedShareCodes={NO_SHARES} />,
  )
  const shareCells = [...screen.container.querySelectorAll('td[colspan="2"]')]
  expect(shareCells.map((c) => c.textContent)).toEqual([
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'A',
    'B',
    'C',
  ])
  // The week-number header row (2nd table row) still has all 20 per-week
  // columns. (Structural query, not getByText — the mobile layout's week
  // texts would make text locators ambiguous.)
  const weekRow = screen.container.querySelectorAll('tr')[1]
  expect(weekRow?.querySelectorAll('td')).toHaveLength(20)
})

test('month divider stops above a straddling block', async () => {
  await page.viewport(1280, 800)
  const screen = await render(
    <DisponeringslistaTable schedules={[y2026]} ownedShareCodes={NO_SHARES} />,
  )
  const cells = [...screen.container.querySelectorAll('td[colspan="2"]')]
  const cellF = cells.find((c) => c.textContent === 'F') // 25–26 ends at Jun's last week
  const cellI = cells.find((c) => c.textContent === 'I') // 31–32 straddles Jul/Aug
  expect(cellF?.className).toContain('border-r')
  expect(cellI?.className).not.toContain('border-r')
})

test('owned share renders one merged cell with a range label', async () => {
  await page.viewport(1280, 800)
  const screen = await render(
    <DisponeringslistaTable schedules={[y2026]} ownedShareCodes={new Set<ShareCode>(['C'])} />,
  )
  // C owns weeks 39–40 in 2026: a single cell labelled with the whole range.
  await expect.element(screen.getByLabelText(m.season_my_weeks({ from: 39, to: 40 }))).toBeVisible()
})

test('mobile layout lists one row per block with a week range', async () => {
  await page.viewport(390, 844)
  const screen = await render(
    <DisponeringslistaTable schedules={[y2026]} ownedShareCodes={NO_SHARES} />,
  )
  await expect.element(screen.getByText('21–22')).toBeVisible()
  await expect.element(screen.getByText('39–40')).toBeVisible()
})

test('mobile layout skips a month heading that only holds a block tail', async () => {
  const screen = await render(
    <DisponeringslistaTable schedules={[y2026]} ownedShareCodes={NO_SHARES} />,
  )
  // 2026's Okt band is only week 40 — the tail of the 39–40 block, whose row
  // lives under Sep. Month headings are the mobile layout's only <h3>s; the
  // exact sequence pins the block grouping (and the Okt skip) without
  // depending on CSS visibility (the browser test env loads no Tailwind).
  const headings = [...screen.container.querySelectorAll('h3')].map((h) => h.textContent)
  expect(headings).toEqual([
    m.season_month_may(),
    m.season_month_jun(),
    m.season_month_jul(),
    m.season_month_aug(),
    m.season_month_sep(),
  ])
})
