import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from './auth'

export const getSession = createServerFn().handler(async () => {
  const request = getRequest()
  try {
    return await auth.api.getSession({ headers: request.headers })
  } catch (error) {
    console.error('[getSession] failed to resolve session', error)
    return null
  }
})
