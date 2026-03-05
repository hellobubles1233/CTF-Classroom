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

export const getStudent = query({
  args: {
    studentId: v.id("students")
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.studentId);
  }
});
