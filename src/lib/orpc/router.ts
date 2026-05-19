import { healthRouter } from './procedures/health'
import { seasonRouter } from './procedures/season'
import { userRouter } from './procedures/user'

export const appRouter = {
  health: healthRouter,
  season: seasonRouter,
  user: userRouter,
}

export type AppRouter = typeof appRouter
