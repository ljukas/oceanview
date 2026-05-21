import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { expireSavedEmail, readSavedEmail, writeSavedEmail } from '~/lib/savedEmailCookie'

export const getSavedEmail = createServerFn({ method: 'GET' }).handler(() => readSavedEmail())

export const clearSavedEmail = createServerFn({ method: 'POST' }).handler(() => {
  expireSavedEmail()
})

export const ensureSavedEmail = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.email() }))
  .handler(({ data }) => {
    if (readSavedEmail() !== data.email) {
      writeSavedEmail(data.email)
    }
  })
