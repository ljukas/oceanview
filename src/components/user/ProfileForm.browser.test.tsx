import { expect, test } from 'vitest'
import type { RouterOutputs } from '~/lib/orpc/client'
import { orpc } from '~/lib/orpc/client'
import { m } from '~/paraglide/messages'
import { makeTestQueryClient, renderWithProviders } from '~test/browser/render'
import { ProfileForm } from './ProfileForm'

// The exact `user.me` output shape, derived from the router so the seed can't
// drift from what the component reads (type-only import → erased from bundle).
type Me = RouterOutputs['user']['me']

const fakeMe: Me = {
  id: 'user-1',
  name: 'Alice Svensson',
  email: 'alice@example.se',
  emailVerified: true,
  image: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  role: 'user',
  banned: false,
  banReason: null,
  banExpires: null,
  phone: '+46701234567',
  deletedAt: null,
  imageBlurhash: null,
  lastInvitedAt: null,
  onboardedAt: new Date('2026-01-02T00:00:00Z'),
}

// Cache-seed `user.me` (the harness's no-network strategy) so the suspense query
// resolves synchronously from cache — no server, no MSW.
function seededClient() {
  const queryClient = makeTestQueryClient()
  queryClient.setQueryData(orpc.user.me.queryKey(), fakeMe)
  return queryClient
}

test('prefills the name field from the current user', async () => {
  const { screen } = await renderWithProviders(<ProfileForm />, { queryClient: seededClient() })

  await expect.element(screen.getByLabelText(m.user_field_name())).toHaveValue('Alice Svensson')
})

test('shows the email read-only with the immutability hint', async () => {
  const { screen } = await renderWithProviders(<ProfileForm />, { queryClient: seededClient() })

  const email = screen.getByLabelText(m.user_field_email())
  await expect.element(email).toHaveValue('alice@example.se')
  await expect.element(email).toBeDisabled()
  await expect.element(screen.getByText(m.account_email_locked_hint())).toBeVisible()
})

test('blocks submit and shows the required error when the name is cleared', async () => {
  const { screen } = await renderWithProviders(<ProfileForm />, { queryClient: seededClient() })

  await screen.getByLabelText(m.user_field_name()).fill('')
  await screen.getByRole('button', { name: m.common_save() }).click()

  await expect.element(screen.getByText(m.validation_name_required())).toBeVisible()
})
