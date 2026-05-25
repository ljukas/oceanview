import { relations } from 'drizzle-orm'
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './betterAuth'

export const fileAccessEnum = pgEnum('file_access', ['public', 'private'])

export const file = pgTable(
  'file',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    pathname: text('pathname').notNull().unique(),
    name: text('name').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    folder: text('folder'),
    access: fileAccessEnum('access').notNull(),
    blurhash: text('blurhash'),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('file_owner_id_idx').on(table.ownerId),
    index('file_access_idx').on(table.access),
  ],
)

export const fileRelations = relations(file, ({ one }) => ({
  owner: one(user, {
    fields: [file.ownerId],
    references: [user.id],
  }),
}))
