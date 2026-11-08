# IS MU site map (Phase 0, mapped 2026-11-08 via Claude in Chrome, read-only)

Semester path segment: `podzim2026` (Autumn 2026), faculty `fi`. UI language: English.

## Login
- Any `/auth/...` URL without a session → `302` to `https://muni.islogin.cz/login/<token>`.
- That page has a plain HTML form (`POST`, urlencoded):
  `credential_0` = UČO, `credential_1` = primary password, submit `uloz=uloz`.
  No hidden fields, no captcha. There's no SAML hop, unlike ISKAM.
- After login, cookies on `is.muni.cz` carry the session. The Worker reuses one session per run.
  A session has expired when an `/auth/` request redirects to `muni.islogin.cz` again.

## Courses (Autumn 2026)
`/auth/student/` lists "My courses". Each course card shows teachers, timetable, credits, completion type
(zk/k/z), links to Study Materials, the Homework Vault, Interactive Syllabus, Notebooks and Examinations.

| Code | Name | Homework source |
|---|---|---|
| IA174 | Fundaments of Cryptography | Interactive syllabus chapters "Homework N" plus the vault linked inside the chapter |
| IV111 | Probability in Computer Science | No homework (only presence + exams in `odp/`) |
| PA191 | Advanced Computer Networking | `um/homeworks/` plus vaults `ode/HW0N_*` |
| PV079 | Applied Cryptography | `um/assignments/` plus vaults `ode/<id>` (HW0N_*) |
| PV181 | Practical Security and Applied Cryptography Seminar | vaults `ode/` (HW0N_*); seminar folders `um/seminarNN_*` |
| PV198 | Onechip Controllers | a weekly folder `um/NN_topic/` per seminar; submission on GitLab; graded in notebooks HW0N |
| VV066 | English Conversation | none |

## Study materials: file manager pages
`/auth/el/fi/podzim2026/<CODE>/` is the course root, with `um/` (Learning Materials), `ode/` (Homework Vaults),
`odp/` (ROPOT), `op/` (instructions), `index.qwarp` (interactive syllabus).

**Every listing page embeds the folder's data as JSON**: `window.fmgrUzly = {...};` in an inline script.
Keys are paths like `/el/fi/podzim2026/PV079/ode/207161201/`. Per node:
- `nazev` (name, folders only; for files use the last path segment), `timestamp` (`YYYYMMDDhhmmss`, created),
  `slozka` (is a folder), `je_to_odevzdavarna` (is a vault), `zkratka`.
- `prava.w` = the write/insert right. For an open vault, each entry has
  **`datum: "YYYYMMDDhhmm"` = the submission deadline** (Prague time). Examples:
  PV079 HW04 `202611152359`, PA191 HW04 `202611110800`, PV181 HW02 `202611180800`, IA174 HW02 `202611110000`.
- Closed vaults have no `prava.w`.

So: a **new vault** (unseen key under `ode/`) is a new homework, and `prava.w.*.datum` is its due date.
A new file or folder under a course's homework folder is a new assignment text or attachment.

## Interactive syllabus (IA174)
- `/auth/el/fi/podzim2026/IA174/index.qwarp`. Chapters are in the nav with class `nav-<chapterId>`
  (e.g. Homework 2 = `9620916`). A chapter page is `index.qwarp?prejit=<chapterId>`.
- Published chapters list "CHAPTER CONTAINS: … Homework Vault …" and current-year study dates.
  Unpublished ones (e.g. "Homework 3") still show last year's dates and no contents.
- The chapter text states the deadline ("Wednesday, November 11, 23:59 pm CET") and the vault block
  ("HW02 Submission vault — Submit until: 11/11/2026"). Prefer the text time when the vault says 00:00.

## Notebooks (points)
`/auth/student/poznamkove_bloky_nahled.pl`: one page with every course's notebooks. Notebooks are collapsed by default,
and "Show" expands them (the content is in the HTML either way). Each notebook has a name (e.g. `HW02_points`, `prezence 02`),
content lines (`*N` = score), and "Last modified: d. m. yyyy hh:mm, Teacher".

## Exams
`/auth/student/prihl_na_zkousky.pl`: "Courses and their series with upcoming examination dates" plus registered dates.
As of mapping: only PA191 "pre-term exam" (1 date) is posted, and nothing is registered.

## Timetable
`/auth/rozvrh/`: the user **already subscribes** to the IS calendar feed (`is.muni.cz/calendar/ical/<secret>`)
in Google Calendar, so lectures and seminars already show in Notion Calendar. The feed has the timetable, holidays and semester
milestones, but **no homework deadlines**. The Worker doesn't need to handle the timetable.

## Notion (existing, user's "Student Planner" page)
- **Courses** DB (`collection://267156cb-1caa-81f3-9c2d-000bc64b04b5`): Course Name, Course Code, Assignments (relation).
  Has 6 courses (no VV066).
- **Assignments** DB (`collection://267156cb-1caa-81af-a617-000b443de316`): Assignment Name, Courses (relation),
  Deadline (date), Done (checkbox), Submission Link, URL, Text, Files & media. **Already shown in Notion Calendar.**
  8 manually entered items so far.
- Template leftovers: Class Notes, Lesson Plans, Database Basics.
- The workspace is on a free plan: the Notion MCP's SQL/rows queries are Business-only (view mode works).
  The public REST API used by the Worker isn't limited this way.
