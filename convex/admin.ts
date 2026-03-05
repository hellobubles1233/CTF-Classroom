import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const leaderboard = query({
  args: {},
  handler: async (ctx) => {
    const students = await ctx.db.query("students").collect();

    const scored = await Promise.all(
      students.map(async (student) => {
        const completions = await ctx.db
          .query("challengeCompletions")
          .withIndex("by_student", (q) => q.eq("studentId", student._id))
          .collect();

        const points = completions.reduce((sum, c) => sum + c.points, 0);
        return {
          studentId: student._id,
          name: student.name,
          points,
          completedCount: completions.length,
          lastSeenAt: student.lastSeenAt
        };
      })
    );

    scored.sort((a, b) => b.points - a.points || b.completedCount - a.completedCount || a.name.localeCompare(b.name));

    return {
      updatedAt: Date.now(),
      players: scored
    };
  }
});

export const setActive = mutation({
  args: {
    studentId: v.id("students"),
    active: v.boolean()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.studentId, {
      active: args.active,
      lastSeenAt: Date.now()
    });
    return { ok: true };
  }
});
