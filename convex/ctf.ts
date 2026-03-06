import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { normalizeName, nowMs } from "./utils";

function assertCourseKey(courseKey: string) {
  const expected = process.env.CTF_COURSE_KEY;
  if (!expected) {
    throw new Error("CTF_COURSE_KEY is not configured on Convex deployment.");
  }
  if (courseKey !== expected) {
    throw new Error("Invalid course key.");
  }
}

export const registerOrRejoin = mutation({
  args: {
    courseKey: v.string(),
    name: v.string(),
    codespaceName: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    assertCourseKey(args.courseKey);

    const cleanName = args.name.trim();
    if (cleanName.length < 2 || cleanName.length > 40) {
      throw new Error("Name must be between 2 and 40 characters.");
    }

    const normalizedName = normalizeName(cleanName);
    const now = nowMs();

    const existing = await ctx.db
      .query("students")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
      .first();

    let studentId;
    if (existing) {
      studentId = existing._id;
      await ctx.db.patch(existing._id, {
        name: cleanName,
        lastSeenAt: now,
        active: true
      });
    } else {
      studentId = await ctx.db.insert("students", {
        name: cleanName,
        normalizedName,
        createdAt: now,
        lastSeenAt: now,
        active: true
      });
    }

    await ctx.db.insert("sessions", {
      studentId,
      codespaceName: args.codespaceName,
      startedAt: now,
      lastSeenAt: now,
      active: true
    });

    await ctx.db.insert("eventLog", {
      kind: "register_or_rejoin",
      studentId,
      payload: JSON.stringify({ codespaceName: args.codespaceName ?? null }),
      createdAt: now
    });

    return {
      studentId,
      name: cleanName
    };
  }
});

export const reportSuccess = mutation({
  args: {
    courseKey: v.string(),
    studentId: v.id("students"),
    challengeId: v.string(),
    points: v.number(),
    source: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    assertCourseKey(args.courseKey);

    const now = nowMs();
    const existing = await ctx.db
      .query("challengeCompletions")
      .withIndex("by_student_challenge", (q) => q.eq("studentId", args.studentId).eq("challengeId", args.challengeId))
      .first();

    if (!existing) {
      await ctx.db.insert("challengeCompletions", {
        studentId: args.studentId,
        challengeId: args.challengeId,
        points: Math.max(0, Math.floor(args.points)),
        reportedAt: now,
        source: args.source
      });
    }

    await ctx.db.patch(args.studentId, {
      lastSeenAt: now,
      active: true
    });

    await ctx.db.insert("eventLog", {
      kind: "challenge_success",
      studentId: args.studentId,
      payload: JSON.stringify({
        challengeId: args.challengeId,
        points: args.points,
        source: args.source ?? null,
        duplicate: Boolean(existing)
      }),
      createdAt: now
    });

    return {
      ok: true,
      duplicate: Boolean(existing)
    };
  }
});

export const getProgress = query({
  args: {
    courseKey: v.string(),
    studentId: v.id("students")
  },
  handler: async (ctx, args) => {
    assertCourseKey(args.courseKey);

    const completions = await ctx.db
      .query("challengeCompletions")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .collect();

    const byChallenge = new Map<string, { challengeId: string; points: number; reportedAt: number }>();
    for (const c of completions) {
      const existing = byChallenge.get(c.challengeId);
      if (!existing || c.reportedAt > existing.reportedAt) {
        byChallenge.set(c.challengeId, {
          challengeId: c.challengeId,
          points: c.points,
          reportedAt: c.reportedAt
        });
      }
    }

    const unique = Array.from(byChallenge.values()).sort((a, b) => a.reportedAt - b.reportedAt);
    const completedIds = unique.map((x) => x.challengeId);
    const totalPoints = unique.reduce((sum, x) => sum + Math.max(0, Math.floor(x.points)), 0);

    return {
      studentId: args.studentId,
      completedIds,
      completedCount: completedIds.length,
      totalPoints
    };
  }
});

export const getStudent = query({
  args: {
    studentId: v.id("students")
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.studentId);
  }
});
