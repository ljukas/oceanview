import {
  FolderInputIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { CreateFolderDialog } from './CreateFolderDialog'
import { DeleteFolderDialog } from './DeleteFolderDialog'
import { MoveDialog } from './MoveDialog'
import { RenameFolderDialog } from './RenameFolderDialog'

type Props = {
  // null id/name = the virtual root: only "new folder here" applies.
  folderId: string | null
  folderName: string | null
  isAdmin: boolean
}

type OpenDialog = 'create' | 'rename' | 'move' | 'delete' | null

export function FolderActions({ folderId, folderName, isAdmin }: Props) {
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const isRoot = folderId === null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Mappåtgärder">
            <MoreVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setDialog('create')}>
              <FolderPlusIcon data-icon="inline-start" />
              Ny mapp här
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {!isRoot && isAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setDialog('rename')}>
                  <PencilIcon data-icon="inline-start" />
                  Byt namn
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog('move')}>
                  <FolderInputIcon data-icon="inline-start" />
                  Flytta
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                  <Trash2Icon data-icon="inline-start" />
                  Ta bort
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open — otherwise every tree node would hold a live
          MoveDialog folder-tree subscription. */}
      {dialog === 'create' ? (
        <CreateFolderDialog open onOpenChange={() => setDialog(null)} parentId={folderId} />
      ) : null}
      {!isRoot && folderName !== null ? (
        <>
          {dialog === 'rename' ? (
            <RenameFolderDialog
              open
              onOpenChange={() => setDialog(null)}
              folder={{ id: folderId, name: folderName }}
            />
          ) : null}
          {dialog === 'move' ? (
            <MoveDialog
              open
              onOpenChange={() => setDialog(null)}
              target={{ kind: 'folder', id: folderId, name: folderName }}
            />
          ) : null}
          {dialog === 'delete' ? (
            <DeleteFolderDialog
              open
              onOpenChange={() => setDialog(null)}
              folder={{ id: folderId, name: folderName }}
            />
          ) : null}
        </>
      ) : null}
    </>
  )
}
