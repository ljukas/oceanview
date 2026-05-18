import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db'
import { useSyncExternalStore } from 'react'
import { z } from 'zod'

const RECORD_ID = 'me' as const

const savedLoginSchema = z.object({
  id: z.literal(RECORD_ID),
  email: z.email(),
})

export const savedLoginCollection = createCollection(
  localStorageCollectionOptions({
    id: 'saved-login',
    storageKey: 'oceanview:saved-login',
    getKey: (item) => item.id,
    schema: savedLoginSchema,
  }),
)

savedLoginCollection.preload()

export function saveEmail(email: string): void {
  const existing = savedLoginCollection.get(RECORD_ID)
  if (existing) {
    if (existing.email === email) return
    savedLoginCollection.update(RECORD_ID, (draft) => {
      draft.email = email
    })
  } else {
    savedLoginCollection.insert({ id: RECORD_ID, email })
  }
}

export function clearSavedEmail(): void {
  if (savedLoginCollection.get(RECORD_ID)) {
    savedLoginCollection.delete(RECORD_ID)
  }
}

const subscribe = (cb: () => void) => {
  const sub = savedLoginCollection.subscribeChanges(cb)
  return () => sub.unsubscribe()
}
const getSnapshot = () => savedLoginCollection.get(RECORD_ID) ?? null
const getServerSnapshot = () => null

export function useSavedEmail() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return saved?.email
}
