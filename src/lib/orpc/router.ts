import { healthRouter } from './procedures/health'
import { userRouter } from './procedures/user'

export const appRouter = {
  health: healthRouter,
  user: userRouter,
}

export type AppRouter = typeof appRouter
