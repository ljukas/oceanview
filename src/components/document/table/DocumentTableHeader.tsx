import type { Column, Table } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import type { DocumentRow } from '~/components/document/shared/documentHelpers'
import {
  DATE_CELL,
  KIND_CELL,
  OWNER_CELL,
  SIZE_CELL,
} from '~/components/document/table/documentColumns'
import { Button } from '~/components/ui/button'
import { TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { cn } from '~/lib/utils'

export function DocumentTableHeader({ table }: { table: Table<DocumentRow> }) {
  return (
    <TableHeader>
      <TableRow>
        <SortableHead column={table.getColumn('name')} label="Namn" className="w-full" />
        <SortableHead column={table.getColumn('kind')} label="Typ" className={KIND_CELL} />
        <SortableHead
          column={table.getColumn('uploadedAt')}
          label="Uppladdad"
          className={DATE_CELL}
        />
        <SortableHead column={table.getColumn('ownerName')} label="Ägare" className={OWNER_CELL} />
        <SortableHead
          column={table.getColumn('sizeBytes')}
          label="Storlek"
          align="end"
          className={SIZE_CELL}
        />
        <TableHead className="w-10">
          <span className="sr-only">Åtgärder</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}

function SortableHead({
  column,
  label,
  align = 'start',
  className,
}: {
  column: Column<DocumentRow> | undefined
  label: string
  align?: 'start' | 'end'
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
        className={cn('-ml-2 h-8 text-muted-foreground', align === 'end' && '-mr-2 ml-auto')}
        onClick={() => column.toggleSorting()}
      >
        {label}
        <Icon data-icon="inline-end" className="text-muted-foreground" />
      </Button>
    </TableHead>
  )
}
