import { healthRouter } from './procedures/health'
import { presenceRouter } from './procedures/presence'
import { realtimeRouter } from './procedures/realtime'
import { seasonRouter } from './procedures/season'
import { shareRouter } from './procedures/share'
import { userRouter } from './procedures/user'

export const appRouter = {
  health: healthRouter,
  presence: presenceRouter,
  realtime: realtimeRouter,
  season: seasonRouter,
  share: shareRouter,
  user: userRouter,
}

export type AppRouter = typeof appRouter
