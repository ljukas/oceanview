import type { SeasonDomainErrorCode } from '~/lib/services/season'
import { m } from '~/paraglide/messages'

// Season procedures throw code-only oRPC typed errors (see procedures/season.ts);
// the client owns season-error i18n. `import type` is erased at build, so this
// pulls only the code union — no server runtime leaks into the client bundle. The
// exhaustive switch makes a missing case a compile error.
/** Localize a typed season error code. */
export function seasonErrorMessage(code: SeasonDomainErrorCode): string {
  switch (code) {
    case 'ALREADY_EXISTS':
      return m.season_error_already_exists()
    case 'NOT_FOUND':
      return m.season_error_not_found()
  }
}
