import { useDroppable } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import { Fragment } from 'react'
import {
  type FolderRow,
  folderDropId,
  folderPathToSplat,
  folderTrail,
  ROOT_DROP_ID,
} from '~/components/document/shared/documentHelpers'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '~/components/ui/breadcrumb'
import { cn } from '~/lib/utils'

type Props = {
  folders: Array<FolderRow>
  activeFolderId: string | null
}

export function FolderBreadcrumb({ folders, activeFolderId }: Props) {
  const trail = folderTrail(folders, activeFolderId)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {trail.length === 0 ? (
            <BreadcrumbPage>Hem</BreadcrumbPage>
          ) : (
            <CrumbDrop dropId={ROOT_DROP_ID}>
              <BreadcrumbLink asChild>
                <Link to="/documents">Hem</Link>
              </BreadcrumbLink>
            </CrumbDrop>
          )}
        </BreadcrumbItem>

        {trail.map((folder, index) => {
          const isLast = index === trail.length - 1
          return (
            <Fragment key={folder.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="max-w-[16rem] truncate">{folder.name}</BreadcrumbPage>
                ) : (
                  <CrumbDrop dropId={folderDropId(folder.id)}>
                    <BreadcrumbLink asChild>
                      <Link
                        to="/documents/$"
                        params={{ _splat: folderPathToSplat(folder.path) }}
                        className="max-w-[12rem] truncate"
                      >
                        {folder.name}
                      </Link>
                    </BreadcrumbLink>
                  </CrumbDrop>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function CrumbDrop({ dropId, children }: { dropId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId })
  return (
    <span ref={setNodeRef} className={cn('rounded-sm', isOver && 'bg-accent ring-2 ring-ring')}>
      {children}
    </span>
  )
}
