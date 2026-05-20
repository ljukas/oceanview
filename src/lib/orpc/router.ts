import { healthRouter } from './procedures/health'
import { seasonRouter } from './procedures/season'
import { shareRouter } from './procedures/share'
import { userRouter } from './procedures/user'

export const appRouter = {
  health: healthRouter,
  season: seasonRouter,
  share: shareRouter,
  user: userRouter,
}

export type AppRouter = typeof appRouter
