import {
  type Column,
  type ColumnDef,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  MoreVerticalIcon,
  PencilIcon,
  RotateCcwIcon,
  SailboatIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react'
import { formatPhoneNumberIntl } from 'react-phone-number-input'
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import type { SharePartRow } from '~/lib/services/share'
import type { UserRow } from '~/lib/services/user'
import { collapseShares, type ShareBadgeKind } from '~/lib/shares/collapse'
import { shareBackgroundClass } from '~/lib/shares/colors'
import { cn, initials } from '~/lib/utils'

export type OwnerRow = UserRow & { shares: Array<SharePartRow> }

type Props = {
  owners: Array<OwnerRow>
  onlineSet: Set<string>
  currentUserId: string
  isAdmin: boolean
  /** Deleted view (admin-only): swaps Telefon→Borttagen, drops Andelar, offers restore. */
  showDeleted: boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
}

const deletedDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Secondary columns reveal as the viewport widens: Roll + Andelar at `md`,
// E-post + Telefon at `lg`. Whatever isn't yet a column folds in as a muted
// sub-line under the name, so nothing is lost on narrow screens.
const ROLE_CELL = 'hidden md:table-cell'
const SHARES_CELL = 'hidden md:table-cell'
const EMAIL_CELL = 'hidden lg:table-cell'
const PHONE_CELL = 'hidden lg:table-cell'

function roleLabel(role: string | null): string {
  return role === 'admin' ? 'Admin' : 'Seglare'
}

// Owner's shares, sorted by (code, part). Used for display and for the primary
// share that drives the Andelar sort.
function sortedShares(shares: Array<SharePartRow>): Array<SharePartRow> {
  return [...shares].sort(
    (a, b) => a.shareCode.localeCompare(b.shareCode) || a.partNumber - b.partNumber,
  )
}

// Sort key for the Andelar column: the primary share code+part (e.g. "A1").
// Owners with no shares get "~" so they sort last in ascending order.
function primaryShareKey(shares: Array<SharePartRow>): string {
  if (shares.length === 0) return '~'
  const p = sortedShares(shares)[0]
  return `${p.shareCode}${p.partNumber}`
}

// Only the sortable data columns live in the table model (it drives sort state
// and the sorted row order); cells are hand-rendered per row below.
const columns: Array<ColumnDef<OwnerRow>> = [
  { id: 'name', accessorFn: (u) => u.name, header: 'Namn', sortingFn: 'text' },
  { id: 'role', accessorFn: (u) => roleLabel(u.role), header: 'Roll', sortingFn: 'text' },
  {
    id: 'shares',
    accessorFn: (u) => primaryShareKey(u.shares),
    header: 'Andelar',
    sortingFn: 'text',
  },
]

export function OwnersTable({
  owners,
  onlineSet,
  currentUserId,
  isAdmin,
  showDeleted,
  onEdit,
  onDelete,
  onRestore,
}: Props) {
  const table = useReactTable({
    data: owners,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // No initial sorting — the server already returns surname order; columns
    // become sortable on click.
  })
  const rows = table.getRowModel().rows

  // name + (role) + (email) + (phone/date) + (shares unless deleted) + (actions if admin)
  const columnCount = 4 + (showDeleted ? 0 : 1) + (isAdmin ? 1 : 0)

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead column={table.getColumn('name')} label="Namn" />
            <SortableHead column={table.getColumn('role')} label="Roll" className={ROLE_CELL} />
            <TableHead className={EMAIL_CELL}>E-post</TableHead>
            <TableHead className={PHONE_CELL}>{showDeleted ? 'Borttagen' : 'Telefon'}</TableHead>
            {showDeleted ? null : (
              <SortableHead
                column={table.getColumn('shares')}
                label="Andelar"
                className={SHARES_CELL}
              />
            )}
            {isAdmin ? (
              <TableHead className="w-10">
                <span className="sr-only">Åtgärder</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columnCount}
                className="py-8 text-center text-muted-foreground text-sm"
              >
                {showDeleted ? 'Inga borttagna delägare' : 'Inga delägare än'}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <OwnerTableRow
                key={row.original.id}
                owner={row.original}
                isSelf={row.original.id === currentUserId}
                isOnline={onlineSet.has(row.original.id)}
                isAdmin={isAdmin}
                showDeleted={showDeleted}
                onEdit={onEdit}
                onDelete={onDelete}
                onRestore={onRestore}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function OwnerTableRow({
  owner,
  isSelf,
  isOnline,
  isAdmin,
  showDeleted,
  onEdit,
  onDelete,
  onRestore,
}: {
  owner: OwnerRow
  isSelf: boolean
  isOnline: boolean
  isAdmin: boolean
  showDeleted: boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onRestore: (id: string) => void
}) {
  const formattedPhone = owner.phone ? formatPhoneNumberIntl(owner.phone) || owner.phone : null
  const deletedAt = owner.deletedAt ? deletedDateFormatter.format(owner.deletedAt) : '—'
  // Collapse held pairs (A1 + A2 → "A"); lone halves stay "A1"/"A2".
  const shares = collapseShares(owner.shares)

  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-9 shrink-0">
            {owner.image ? (
              <AvatarImage
                src={owner.image}
                alt={owner.name}
                width={36}
                height={36}
                blurhash={owner.imageBlurhash}
              />
            ) : null}
            <AvatarFallback>{initials(owner.name)}</AvatarFallback>
            {isOnline ? (
              <AvatarBadge className="size-3 bg-success ring-2">
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-success opacity-75"
                />
                <span className="sr-only">Ansluten</span>
              </AvatarBadge>
            ) : null}
          </Avatar>

          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium" title={owner.name}>
                {owner.name || '—'}
              </span>
              {isSelf ? <Badge variant="secondary">Du</Badge> : null}
            </div>

            {/* Roll (+ Andelar) fold in here until they become columns at `md`. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
              <RoleLabel role={owner.role} />
              {showDeleted ? null : shares.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {shares.map((s) => (
                    <ShareBadge key={shareBadgeKey(s)} badge={s} />
                  ))}
                </div>
              ) : null}
            </div>

            {/* E-post + Telefon/Borttagen fold in here until they become columns at `lg`. */}
            <div className="flex flex-col gap-0.5 text-xs lg:hidden">
              <a
                href={`mailto:${owner.email}`}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
                title={owner.email}
              >
                {owner.email}
              </a>
              {showDeleted ? (
                <span className="text-muted-foreground tabular-nums">Borttagen {deletedAt}</span>
              ) : formattedPhone ? (
                <a
                  href={`tel:${owner.phone}`}
                  className="text-muted-foreground tabular-nums transition-colors hover:text-foreground"
                >
                  {formattedPhone}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </TableCell>

      <TableCell className={ROLE_CELL}>
        <RoleLabel role={owner.role} />
      </TableCell>

      <TableCell className={EMAIL_CELL}>
        <a
          href={`mailto:${owner.email}`}
          className="text-muted-foreground transition-colors hover:text-foreground"
          title={owner.email}
        >
          {owner.email}
        </a>
      </TableCell>

      <TableCell className={cn(PHONE_CELL, 'text-muted-foreground tabular-nums')}>
        {showDeleted ? (
          deletedAt
        ) : formattedPhone ? (
          <a href={`tel:${owner.phone}`} className="transition-colors hover:text-foreground">
            {formattedPhone}
          </a>
        ) : (
          '—'
        )}
      </TableCell>

      {showDeleted ? null : (
        <TableCell className={SHARES_CELL}>
          {shares.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {shares.map((s) => (
                <ShareBadge key={shareBadgeKey(s)} badge={s} />
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      )}

      {isAdmin ? (
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Åtgärder för ${owner.name}`}>
                <MoreVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {showDeleted ? (
                <DropdownMenuItem onSelect={() => onRestore(owner.id)}>
                  <RotateCcwIcon />
                  Återställ
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => onEdit(owner.id)}>
                    <PencilIcon />
                    Redigera
                  </DropdownMenuItem>
                  {isSelf ? null : (
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(owner.id)}>
                      <Trash2Icon />
                      Ta bort
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      ) : null}
    </TableRow>
  )
}

function SortableHead({
  column,
  label,
  className,
}: {
  column: Column<OwnerRow> | undefined
  label: string
  className?: string
}) {
  if (!column) return null
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ArrowUpDownIcon
  return (
    <TableHead
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
      className={className}
    >
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 text-muted-foreground"
        onClick={() => column.toggleSorting()}
      >
        {label}
        <Icon data-icon="inline-end" className="text-muted-foreground" />
      </Button>
    </TableHead>
  )
}

function RoleLabel({ role }: { role: string | null }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 font-medium text-primary text-sm">
      <StarIcon className="size-3.5 fill-current" aria-hidden="true" />
      Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
      <SailboatIcon className="size-3.5" aria-hidden="true" />
      Seglare
    </span>
  )
}

function shareBadgeKey(badge: ShareBadgeKind): string {
  return badge.kind === 'whole' ? badge.shareCode : `${badge.shareCode}${badge.partNumber}`
}

function ShareBadge({ badge }: { badge: ShareBadgeKind }) {
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent text-foreground', shareBackgroundClass[badge.shareCode])}
    >
      {badge.shareCode}
      {badge.kind === 'part' ? badge.partNumber : null}
    </Badge>
  )
}
