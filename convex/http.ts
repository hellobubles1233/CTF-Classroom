import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders
    }
  });
}

function preflight() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

http.route({
  path: "/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    const result = await ctx.runMutation(api.ctf.registerOrRejoin, {
      courseKey: body.courseKey,
      name: body.name,
      codespaceName: body.codespaceName ?? undefined
    });

    return jsonResponse(result);
  })
});

http.route({
  path: "/api/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    const result = await ctx.runMutation(api.ctf.registerOrRejoin, {
      courseKey: body.courseKey,
      name: body.name,
      codespaceName: body.codespaceName ?? undefined
    });

    return jsonResponse(result);
  })
});

http.route({
  path: "/register",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

http.route({
  path: "/api/register",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

http.route({
  path: "/report-success",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    const result = await ctx.runMutation(api.ctf.reportSuccess, {
      courseKey: body.courseKey,
      studentId: body.studentId,
      challengeId: body.challengeId,
      points: body.points,
      source: body.source
    });

    return jsonResponse(result);
  })
});

http.route({
  path: "/api/report-success",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    const result = await ctx.runMutation(api.ctf.reportSuccess, {
      courseKey: body.courseKey,
      studentId: body.studentId,
      challengeId: body.challengeId,
      points: body.points,
      source: body.source
    });

    return jsonResponse(result);
  })
});

http.route({
  path: "/report-success",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

http.route({
  path: "/api/report-success",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

http.route({
  path: "/leaderboard",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const board = await ctx.runQuery(api.admin.leaderboard, {});
    return jsonResponse(board);
  })
});

http.route({
  path: "/progress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    const progress = await ctx.runQuery(api.ctf.getProgress, {
      courseKey: body.courseKey,
      studentId: body.studentId
    });

    return jsonResponse(progress);
  })
});

http.route({
  path: "/api/progress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();

    const progress = await ctx.runQuery(api.ctf.getProgress, {
      courseKey: body.courseKey,
      studentId: body.studentId
    });

    return jsonResponse(progress);
  })
});

http.route({
  path: "/api/leaderboard",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const board = await ctx.runQuery(api.admin.leaderboard, {});
    return jsonResponse(board);
  })
});

http.route({
  path: "/leaderboard",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

http.route({
  path: "/progress",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

http.route({
  path: "/api/progress",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

http.route({
  path: "/api/leaderboard",
  method: "OPTIONS",
  handler: httpAction(async () => preflight())
});

export default http;
