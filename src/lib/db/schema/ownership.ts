import { desc, relations, sql } from 'drizzle-orm'
import {
  check,
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('share_part_share_code_part_number_idx').on(table.shareCode, table.partNumber),
    check('share_part_part_number_check', sql`${table.partNumber} IN (1, 2)`),
  ],
)

export const season = pgTable(
  'season',
  {
    year: integer('year').primaryKey(),
    startWeek: integer('start_week').notNull(),
    startShare: shareCodeEnum('start_share').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [check('season_start_week_check', sql`${table.startWeek} BETWEEN 1 AND 53`)],
)

// One row per admin decision that creates ownership assignments. Children
// rows in `ownership_assignment` share an `event_id` so the history view can
// render whole-share decisions as one entry (and split decisions as one entry
// with two halves). Wholeness vs. split is computed from the children at read
// time — no `kind` column here, by design, so the parent can never drift.
export const ownershipAssignmentEvent = pgTable(
  'ownership_assignment_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Nullable so admin-deletion (set null cascade) doesn't fail; also lets
    // future system-generated events (e.g. seeding) record no actor.
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    note: text('note'),
  },
  (table) => [index('ownership_assignment_event_created_at_idx').on(desc(table.createdAt))],
)

export const ownershipAssignment = pgTable(
  'ownership_assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => ownershipAssignmentEvent.id, { onDelete: 'restrict' }),
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ownership_assignment_part_id_idx').on(table.partId),
    index('ownership_assignment_user_id_idx').on(table.userId),
    index('ownership_assignment_event_id_idx').on(table.eventId),
    uniqueIndex('ownership_assignment_one_current_per_part_idx')
      .on(table.partId)
      .where(sql`${table.assignedTo} IS NULL`),
    check(
      'ownership_assignment_range_check',
      sql`${table.assignedTo} IS NULL OR ${table.assignedTo} > ${table.assignedFrom}`,
    ),
  ],
)

export const sharePartRelations = relations(sharePart, ({ many }) => ({
  assignments: many(ownershipAssignment),
}))

export const ownershipAssignmentEventRelations = relations(
  ownershipAssignmentEvent,
  ({ many, one }) => ({
    assignments: many(ownershipAssignment),
    actor: one(user, {
      fields: [ownershipAssignmentEvent.actorUserId],
      references: [user.id],
    }),
  }),
)

export const ownershipAssignmentRelations = relations(ownershipAssignment, ({ one }) => ({
  event: one(ownershipAssignmentEvent, {
    fields: [ownershipAssignment.eventId],
    references: [ownershipAssignmentEvent.id],
  }),
  part: one(sharePart, {
    fields: [ownershipAssignment.partId],
    references: [sharePart.id],
  }),
  user: one(user, {
    fields: [ownershipAssignment.userId],
    references: [user.id],
  }),
}))
