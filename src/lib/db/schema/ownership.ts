import { relations, sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { user } from './betterAuth'

export const shareCodeEnum = pgEnum('share_code', [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
])

export const sharePart = pgTable(
  'share_part',
  {
    // Literal codes 'A1' .. 'J2'. Stable, human-readable, and small enough
    // that we can use them directly as foreign-key targets.
    id: text('id').primaryKey(),
    shareCode: shareCodeEnum('share_code').notNull(),
    partNumber: integer('part_number').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('share_part_share_code_part_number_idx').on(table.shareCode, table.partNumber),
  ],
)

export const season = pgTable('season', {
  year: integer('year').primaryKey(),
  startWeek: integer('start_week').notNull(),
  startShare: shareCodeEnum('start_share').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const ownershipAssignment = pgTable(
  'ownership_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: text('part_id')
      .notNull()
      .references(() => sharePart.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Half-open: owner from `assignedFrom` (inclusive) until `assignedTo`
    // (exclusive). `assignedTo IS NULL` means the assignment is still active.
    assignedFrom: date('assigned_from', { mode: 'date' }).notNull(),
    assignedTo: date('assigned_to', { mode: 'date' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ownership_assignment_part_id_idx').on(table.partId),
    index('ownership_assignment_user_id_idx').on(table.userId),
    uniqueIndex('ownership_assignment_one_current_per_part_idx')
      .on(table.partId)
      .where(sql`${table.assignedTo} IS NULL`),
  ],
)

export const sharePartRelations = relations(sharePart, ({ many }) => ({
  assignments: many(ownershipAssignment),
}))

export const ownershipAssignmentRelations = relations(ownershipAssignment, ({ one }) => ({
  part: one(sharePart, {
    fields: [ownershipAssignment.partId],
    references: [sharePart.id],
  }),
  user: one(user, {
    fields: [ownershipAssignment.userId],
    references: [user.id],
  }),
}))
