import { expect, test } from 'vitest'
import { renderMagicLink } from './MagicLinkEmail'

const url = 'https://oceanview.example/sign-in/magic-link?token=test-1234'

test('renderMagicLink returns a Swedish subject', async () => {
  const { subject } = await renderMagicLink({ url })
  expect(subject).toBe('Logga in på Oceanview')
})

test('renderMagicLink embeds the URL in both html and text', async () => {
  const { html, text } = await renderMagicLink({ url })
  expect(html).toContain(url)
  expect(text).toContain(url)
})

test('renderMagicLink emits non-empty html and text', async () => {
  const { html, text } = await renderMagicLink({ url })
  expect(html.length).toBeGreaterThan(100)
  expect(text.length).toBeGreaterThan(20)
})

test('renderMagicLink includes the brand wordmark in html', async () => {
  const { html } = await renderMagicLink({ url })
  expect(html).toContain('Oceanview')
})
