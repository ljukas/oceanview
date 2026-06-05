import {
  FileArchiveIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  PresentationIcon,
  SheetIcon,
} from 'lucide-react'
import { describe, expect, test } from 'vitest'
import {
  type BinEntry,
  type FolderRow,
  fileTypeAppearance,
  folderPathToSplat,
  folderTrail,
  partitionBinEntries,
  resolveFolderBySplat,
} from './documentHelpers'

// Only `id`/`parentId`/`name`/`path` are read by the helpers under test; the
// rest of FolderRow is filled with inert values so we don't couple to the row
// shape (derived from the router output).
function folder(
  partial: Pick<FolderRow, 'id' | 'name' | 'path'> & { parentId?: string | null },
): FolderRow {
  return {
    parentId: null,
    searchHaystack: '',
    createdBy: 'u',
    createdAt: new Date(0),
    deletedAt: null,
    ...partial,
  } as FolderRow
}

describe('folderPathToSplat', () => {
  test('strips the leading and trailing slashes', () => {
    expect(folderPathToSplat('/Manuals/Engine/')).toBe('Manuals/Engine')
  })

  test('handles a single top-level folder', () => {
    expect(folderPathToSplat('/Bilder/')).toBe('Bilder')
  })
})

describe('resolveFolderBySplat', () => {
  const folders = [
    folder({ id: 'a', name: 'Manuals', path: '/Manuals/' }),
    folder({ id: 'b', name: 'Engine', path: '/Manuals/Engine/', parentId: 'a' }),
    folder({ id: 'c', name: 'Sommar 2024', path: '/Bilder/Sommar 2024/' }),
  ]

  test('resolves a nested path', () => {
    expect(resolveFolderBySplat(folders, 'Manuals/Engine')?.id).toBe('b')
  })

  test('resolves a name with spaces and digits', () => {
    expect(resolveFolderBySplat(folders, 'Bilder/Sommar 2024')?.id).toBe('c')
  })

  test('returns null for the empty splat (root)', () => {
    expect(resolveFolderBySplat(folders, undefined)).toBeNull()
    expect(resolveFolderBySplat(folders, '')).toBeNull()
  })

  test('returns null for an unknown path', () => {
    expect(resolveFolderBySplat(folders, 'Manuals/Gone')).toBeNull()
  })

  test('tolerates stray surrounding slashes', () => {
    expect(resolveFolderBySplat(folders, '/Manuals/Engine/')?.id).toBe('b')
  })

  test('matches across NFC/NFD normalization of å/ä/ö', () => {
    // Stored path uses precomposed (NFC) 'ö'; the incoming splat is decomposed (NFD).
    const nfc = [
      folder({ id: 'm', name: 'Motorrum', path: '/Motorrum för båten/'.normalize('NFC') }),
    ]
    const nfdSplat = 'Motorrum för båten'.normalize('NFD')
    expect(resolveFolderBySplat(nfc, nfdSplat)?.id).toBe('m')
  })
})

describe('folderTrail (unchanged behavior)', () => {
  const folders = [
    folder({ id: 'a', name: 'Manuals', path: '/Manuals/' }),
    folder({ id: 'b', name: 'Engine', path: '/Manuals/Engine/', parentId: 'a' }),
  ]

  test('builds root → current', () => {
    expect(folderTrail(folders, 'b').map((f) => f.id)).toEqual(['a', 'b'])
  })

  test('returns [] for the virtual root', () => {
    expect(folderTrail(folders, null)).toEqual([])
  })
})

describe('partitionBinEntries', () => {
  // Only `id`/`kind`/`correlationId` matter to the partition; the rest is inert.
  function entry(partial: Pick<BinEntry, 'id'> & { correlationId?: string | null }): BinEntry {
    return {
      kind: 'document',
      name: partial.id,
      deletedAt: new Date(0),
      correlationId: null,
      ...partial,
    } as BinEntry
  }

  test('groups entries sharing a correlationId into one batch', () => {
    const { batches, loose } = partitionBinEntries([
      entry({ id: 'a', correlationId: 'c1' }),
      entry({ id: 'b', correlationId: 'c1' }),
    ])
    expect(loose).toEqual([])
    expect([...batches.keys()]).toEqual(['c1'])
    expect(batches.get('c1')?.map((e) => e.id)).toEqual(['a', 'b'])
  })

  test('routes entries without a correlationId to loose', () => {
    const { batches, loose } = partitionBinEntries([
      entry({ id: 'x' }),
      entry({ id: 'y', correlationId: null }),
    ])
    expect(batches.size).toBe(0)
    expect(loose.map((e) => e.id)).toEqual(['x', 'y'])
  })

  test('mixes batches and loose, preserving first-seen and array order', () => {
    const { batches, loose } = partitionBinEntries([
      entry({ id: 'a', correlationId: 'c2' }),
      entry({ id: 'b' }),
      entry({ id: 'c', correlationId: 'c1' }),
      entry({ id: 'd', correlationId: 'c2' }),
      entry({ id: 'e' }),
    ])
    expect([...batches.keys()]).toEqual(['c2', 'c1'])
    expect(batches.get('c2')?.map((e) => e.id)).toEqual(['a', 'd'])
    expect(batches.get('c1')?.map((e) => e.id)).toEqual(['c'])
    expect(loose.map((e) => e.id)).toEqual(['b', 'e'])
  })

  test('returns empty containers for no entries', () => {
    const { batches, loose } = partitionBinEntries([])
    expect(batches.size).toBe(0)
    expect(loose).toEqual([])
  })
})

describe('fileTypeAppearance', () => {
  test('maps PDF to a red text icon', () => {
    const { Icon, className } = fileTypeAppearance({ mime: 'application/pdf' })
    expect(Icon).toBe(FileTextIcon)
    expect(className).toContain('text-red-600')
  })

  test('maps Word docs to a blue type icon', () => {
    const { Icon, className } = fileTypeAppearance({
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(Icon).toBe(FileTypeIcon)
    expect(className).toContain('text-blue-600')
  })

  test('maps Excel to a green spreadsheet icon', () => {
    const { Icon, className } = fileTypeAppearance({
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    expect(Icon).toBe(FileSpreadsheetIcon)
    expect(className).toContain('text-green-600')
  })

  test('maps CSV to green but a distinct icon from Excel', () => {
    const { Icon, className } = fileTypeAppearance({ mime: 'text/csv' })
    expect(Icon).toBe(SheetIcon)
    expect(Icon).not.toBe(FileSpreadsheetIcon)
    expect(className).toContain('text-green-600')
  })

  test('maps PowerPoint to an orange presentation icon', () => {
    const { Icon, className } = fileTypeAppearance({
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    expect(Icon).toBe(PresentationIcon)
    expect(className).toContain('text-orange-600')
  })

  test('maps archives to an amber archive icon', () => {
    const { Icon, className } = fileTypeAppearance({ mime: 'application/zip' })
    expect(Icon).toBe(FileArchiveIcon)
    expect(className).toContain('text-amber-600')
  })

  test('maps plain text to a neutral text icon', () => {
    const { Icon, className } = fileTypeAppearance({ mime: 'text/plain' })
    expect(Icon).toBe(FileTextIcon)
    expect(className).toBe('text-muted-foreground')
  })

  test('falls back to the extension when the mime is generic', () => {
    const { Icon, className } = fileTypeAppearance({
      mime: 'application/octet-stream',
      extension: 'pdf',
    })
    expect(Icon).toBe(FileTextIcon)
    expect(className).toContain('text-red-600')
  })

  test('returns the generic muted icon for unknown types', () => {
    const { Icon, className } = fileTypeAppearance({ mime: 'application/unknown' })
    expect(Icon).toBe(FileIcon)
    expect(className).toBe('text-muted-foreground')
  })
})
