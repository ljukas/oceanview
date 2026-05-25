import { fileRouter } from './procedures/file'
import { healthRouter } from './procedures/health'
import { imageRouter } from './procedures/image'
import { presenceRouter } from './procedures/presence'
import { realtimeRouter } from './procedures/realtime'
import { seasonRouter } from './procedures/season'
import { shareRouter } from './procedures/share'
import { userRouter } from './procedures/user'

export const appRouter = {
  file: fileRouter,
  health: healthRouter,
  image: imageRouter,
  presence: presenceRouter,
  realtime: realtimeRouter,
  season: seasonRouter,
  share: shareRouter,
  user: userRouter,
}

export type AppRouter = typeof appRouter
