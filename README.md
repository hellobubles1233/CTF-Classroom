# CTF Classroom Admin Foundation

This setup focuses on the **admin platform layer** first:
- student check-in from each Codespace
- central user/session/progress storage in Convex
- local Codespace agent that reports challenge success to central backend

Challenge design can be expanded later.

## Architecture

1. Student opens repo in Codespace.
2. Devcontainer auto-starts a local agent web app.
3. Student enters their display name to join/rejoin.
4. Local agent registers student on Convex central server.
5. Local checker/CLI reports challenge success events to Convex.
6. Instructor reads leaderboard from Convex.

## Repository parts

- `scripts/student-agent.js`: local Codespace web app + reporting API
- `web/student/*`: signup/rejoin UI
- `convex/*`: central backend schema + HTTP routes
- `scripts/report-success.js`: manual reporting CLI hook
- `scripts/ctf.js`: challenge checker/submitter, now with optional central sync

## 1) Deploy central backend (Convex)

1. In this folder:

```bash
npm install
npx convex dev
```

2. In Convex dashboard/project settings, set env var:
- `CTF_COURSE_KEY` = a secret shared key for this course

3. Deploy:

```bash
npm run convex:deploy
```

4. Copy your Convex site URL (example: `https://your-project.convex.site`).

## 2) Configure Codespace/student side

Create `.env` (or use generated one):

```bash
CTF_CENTRAL_URL=https://your-project.convex.site
CTF_COURSE_KEY=your-shared-course-key
CTF_STUDENT_PORT=3210
```

Then start the local agent:

```bash
npm run start:student-agent:bg
```

Open:
- `http://127.0.0.1:3210`

Students enter the same name to rejoin if their Codespace restarts.

## 3) Report events

Manual test report:

```bash
npm run report:success -- --challenge unix-01 --points 15
```

Or run checker submit path (if challenge checks are in place):

```bash
npm run submit -- --user alice --challenge unix-01
```

When local session + central env are configured, submit auto-reports newly passed challenges to central backend.

## 4) Leaderboard from central server

HTTP endpoint:
- `GET <CTF_CENTRAL_URL>/leaderboard`

You can consume this from your hosted instructor UI (Vercel static site).

## Security model (current)

Current build uses:
- name-based join/rejoin
- shared `CTF_COURSE_KEY` for write access

This is lightweight and low-cost, but not strong auth. Next hardening step is per-student invite tokens and one-time enrollment codes.

## Notes about `.dev` URLs and no account flow

`<repo>.dev` and zero-account access depend on your GitHub/Codespaces access model.
This project supports automatic local startup once the Codespace is running, but GitHub still controls workspace provisioning.
