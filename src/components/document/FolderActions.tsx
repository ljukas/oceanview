import {
  FolderInputIcon,
  FolderPlusIcon,
  MoreVerticalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { useDialogState } from '~/hooks/useDialogState'
import { CreateFolderDialog } from './CreateFolderDialog'
import { DeleteFolderDialog } from './DeleteFolderDialog'
import { MoveDialog } from './MoveDialog'
import { RenameFolderDialog } from './RenameFolderDialog'

type Props = {
  // null id/name = the virtual root: only "new folder here" applies.
  folderId: string | null
  folderName: string | null
  isAdmin: boolean
  triggerClassName?: string
}

export function FolderActions({ folderId, folderName, isAdmin, triggerClassName }: Props) {
  const dialog = useDialogState<'create' | 'rename' | 'move' | 'delete'>()
  const isRoot = folderId === null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mappåtgärder"
            className={triggerClassName}
          >
            <MoreVerticalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => dialog.show('create')}>
              <FolderPlusIcon data-icon="inline-start" />
              Ny mapp här
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {!isRoot && isAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => dialog.show('rename')}>
                  <PencilIcon data-icon="inline-start" />
                  Byt namn
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => dialog.show('move')}>
                  <FolderInputIcon data-icon="inline-start" />
                  Flytta
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => dialog.show('delete')}>
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
      {dialog.active === 'create' ? (
        <CreateFolderDialog open onOpenChange={dialog.close} parentId={folderId} />
      ) : null}
      {!isRoot && folderName !== null ? (
        <>
          {dialog.active === 'rename' ? (
            <RenameFolderDialog
              open
              onOpenChange={dialog.close}
              folder={{ id: folderId, name: folderName }}
            />
          ) : null}
          {dialog.active === 'move' ? (
            <MoveDialog
              open
              onOpenChange={dialog.close}
              target={{ kind: 'folder', id: folderId, name: folderName }}
            />
          ) : null}
          {dialog.active === 'delete' ? (
            <DeleteFolderDialog
              open
              onOpenChange={dialog.close}
              folder={{ id: folderId, name: folderName }}
            />
          ) : null}
        </>
      ) : null}
    </>
  )
}
