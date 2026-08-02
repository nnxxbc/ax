import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nfcTagsTable = pgTable("nfc_tags", {
  id: serial("id").primaryKey(),
  tagUid: text("tag_uid").notNull().unique(),
  label: text("label"),
  checkpointId: integer("checkpoint_id"),
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertNfcTagSchema = createInsertSchema(nfcTagsTable).omit({ id: true });
export type InsertNfcTag = z.infer<typeof insertNfcTagSchema>;
export type NfcTag = typeof nfcTagsTable.$inferSelect;
