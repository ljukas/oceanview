import { createServerFn } from '@tanstack/react-start'
import {
  expireSavedLogin,
  readSavedLogin,
  savedLoginSchema,
  writeSavedLogin,
} from '~/lib/savedEmailCookie'

export const getSavedLogin = createServerFn({ method: 'GET' }).handler(() => readSavedLogin())

export const clearSavedLogin = createServerFn({ method: 'POST' }).handler(() => {
  expireSavedLogin()
})

export const ensureSavedLogin = createServerFn({ method: 'POST' })
  .inputValidator(savedLoginSchema)
  .handler(({ data }) => {
    const current = readSavedLogin()
    if (current?.email !== data.email || current?.image !== data.image) {
      writeSavedLogin(data)
    }
  })
