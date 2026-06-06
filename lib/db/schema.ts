import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const targets = pgTable("targets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  panelCount: integer("panel_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  targetId: text("target_id").notNull(),
  panelIndex: integer("panel_index").notNull().default(1),
  filter: text("filter").notNull(),
  subExposure: integer("sub_exposure").notNull(),
  subCount: integer("sub_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const goals = pgTable("goals", {
  targetId: text("target_id").notNull(),
  filter: text("filter").notNull(),
  targetSeconds: integer("target_seconds").notNull(),
})

export type TargetRow = typeof targets.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type GoalRow = typeof goals.$inferSelect
