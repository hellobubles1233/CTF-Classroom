import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  students: defineTable({
    name: v.string(),
    normalizedName: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    active: v.boolean()
  }).index("by_normalized_name", ["normalizedName"]),

  sessions: defineTable({
    studentId: v.id("students"),
    codespaceName: v.optional(v.string()),
    startedAt: v.number(),
    lastSeenAt: v.number(),
    active: v.boolean()
  }).index("by_student", ["studentId"]),

  challengeCompletions: defineTable({
    studentId: v.id("students"),
    challengeId: v.string(),
    points: v.number(),
    reportedAt: v.number(),
    source: v.optional(v.string())
  })
    .index("by_student", ["studentId"])
    .index("by_student_challenge", ["studentId", "challengeId"]),

  eventLog: defineTable({
    kind: v.string(),
    studentId: v.optional(v.id("students")),
    payload: v.string(),
    createdAt: v.number()
  }).index("by_kind", ["kind"])
});
