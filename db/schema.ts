import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from 'drizzle-orm/sqlite-core';
export const pilots = sqliteTable(
  'pilots',
  {
    id: text('id').primaryKey(),
    callsign: text('callsign').notNull(),
    state: text('state').notNull(),
    revision: integer('revision').notNull().default(0),
    requestId: text('request_id'),
    season: integer('season').notNull(),
    activeJob: integer('active_job'),
    seenAt: integer('seen_at').notNull(),
    credit: real('credit').notNull().default(0.15),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_pilots_seen_at').on(t.seenAt)],
);
export const fieldClaims = sqliteTable(
  'field_claims',
  {
    id: integer('id').primaryKey(),
    season: integer('season').notNull(),
    owner: text('owner').notNull(),
    leaseUntil: integer('lease_until').notNull(),
    coverage: real('coverage').notNull().default(0),
    completedAt: integer('completed_at'),
  },
  (t) => [
    index('idx_claims_season').on(t.season),
    index('idx_claims_owner').on(t.owner),
  ],
);
export const payouts = sqliteTable(
  'payouts',
  {
    job: integer('job').primaryKey(),
    season: integer('season').notNull(),
    pilot: text('pilot').notNull(),
    earnings: integer('earnings').notNull(),
    acres: real('acres').notNull(),
    coverage: real('coverage').notNull(),
    elapsed: real('elapsed').notNull(),
    completedAt: integer('completed_at').notNull(),
  },
  (t) => [index('idx_payouts_season_pilot').on(t.season, t.pilot)],
);
