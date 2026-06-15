import { Badge } from '~/components/ui/badge'

/**
 * Dev-only marker for a document whose bytes live in a remote Vercel Blob store
 * (a prod row surfaced through the Neon-branched dev DB, not synced into local
 * RustFS). Rendered only when the row's `isRemoteOrigin` flag is set, which the
 * `listDocuments` procedure computes server-side and is always false in prod —
 * so this never appears to real users. Signals "real prod data; the file may
 * not open locally until `pnpm storage:sync` runs." English literal on purpose:
 * a developer diagnostic, never a localized end-user string.
 */
export function RemoteOriginBadge() {
  return (
    <Badge
      variant="outline"
      className="h-4 border-amber-500/40 px-1 font-mono text-[10px] text-amber-600 dark:text-amber-500"
      title="Uploaded in production — bytes aren't in local dev storage. Run `pnpm storage:sync`."
    >
      PROD
    </Badge>
  )
}
