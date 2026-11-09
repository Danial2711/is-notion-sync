# is-notion-sync

A Cloudflare Worker that checks MUNI IS every 2 hours and keeps a Notion "Student Planner" up to date:

- **Assignments**: new homework becomes a Notion page with its deadline. That shows up in **Notion Calendar**,
  because the Assignments database is toggled on there. Sources, per course (see `src/config.ts`):
  - Homework Vaults: the vault's insert-right end date is the deadline (PA191, PV079, PV181)
  - Materials homework folders: the assignment text often appears before the vault (PA191, PV079)
  - Interactive Syllabus "Homework N" chapters: the deadline comes from the chapter text (IA174)
  - Weekly seminar folders `NN_topic`: due one week after their seminar, Tue 12:00 (PV198, submitted on GitLab)
- **Points**: notebook scores go into each assignment's `Points` and into a per-course `Notebooks` summary.
  A graded assignment gets ticked Done (once).
- **Exams**: posted exam dates and whether you're registered go into the Exams database.

The timetable isn't synced here. Subscribe to IS's calendar feed in Google Calendar and it shows up in Notion Calendar.

**Your edits are safe.** Pages are matched by the hidden-ish `IS ID` property, and hand-made entries get "adopted"
(same course and homework number). Title, Done and a Deadline you changed are never overwritten. The Worker only
moves a deadline it set itself, and only when IS changes it.

## Setup

1. Notion: go to https://www.notion.so/profile/integrations, create a **New integration** (internal) called "IS Sync",
   and copy its secret. Then on the **Student Planner** page, open `•••` → *Connections* and add **IS Sync**.
   Put the IDs of your Assignments, Courses and Exams databases (the part of each database URL before `?v=`)
   into `vars` in `wrangler.example.jsonc`. The expected properties are described in `docs/SITE.md`.
2. `npm install && npm run setup`. This logs in to Cloudflare, creates the KV namespace and deploys. It then asks for
   the secrets `RUN_PASSWORD`, `IS_UCO`, `IS_PASSWORD` and `NOTION_TOKEN` in wrangler's hidden prompt. The password
   goes straight to Cloudflare's encrypted secret store.
3. Dry run (writes nothing): `curl -u x:RUN_PASSWORD https://is-notion-sync.<you>.workers.dev/run`
4. Real run: `curl -u x:RUN_PASSWORD -X POST -H 'x-run: 1' https://is-notion-sync.<you>.workers.dev/run`
   After that, the cron runs by itself. `GET /` shows the last run.

A run makes at most 48 HTTP requests (free plan limit: 50). If the first backfill doesn't fit, the next run continues it.

## Next semester

Update `TERM` and `COURSES` in `src/config.ts` (map new courses the same way, see `docs/SITE.md`), then `npm run deploy`.

## Dev

`npm test` runs the parsers against fixtures shaped like the real pages, plus a fake-IS + fake-Notion end-to-end run.
`npm run typecheck`, `npm run deploy`.

## Built with Claude Code

Developed with [Claude Code](https://claude.com/claude-code): the IS pages were mapped first (`docs/SITE.md`),
then the parsers were written test-first against fixtures shaped like the real pages.

## License

[Apache-2.0](LICENSE)
