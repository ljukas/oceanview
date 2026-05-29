import { createServerFn } from '@tanstack/react-start'
import {
  browserSessionSchema,
  clearBrowserSession as clearCookie,
  readBrowserSession,
  writeBrowserSession,
} from '~/lib/browserSession'

export const getBrowserSession = createServerFn({ method: 'GET' }).handler(() =>
  readBrowserSession(),
)

export const clearBrowserSession = createServerFn({ method: 'POST' }).handler(() => {
  clearCookie()
})

export const rememberBrowserUser = createServerFn({ method: 'POST' })
  .inputValidator(browserSessionSchema)
  .handler(({ data }) => {
    const current = readBrowserSession()
    if (current?.email !== data.email || current?.image !== data.image) {
      writeBrowserSession(data)
    }
  })
