import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  })
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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  })
});

http.route({
  path: "/leaderboard",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const board = await ctx.runQuery(api.admin.leaderboard, {});
    return new Response(JSON.stringify(board), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  })
});

export default http;
