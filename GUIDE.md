# AMAR SECONDARY SCHOOL – App Guide (final)

Free web app (PWA) on GitHub Pages + Supabase. **It installs like an app, but it is not an APK.**

## 1. What you must have in GitHub (repo `amar-school`, root folder)
`index.html  app.js  daily.js  exams.js  finance.js  data.js  grading.js  importer.js  strings.js  strings2.js  styles.css  sw.js  manifest.webmanifest  config.js  icon-192.png  icon-512.png`
Optional: the `supabase` folder (the SQL files, for your records). **Do not upload `supabase/test`.**
Upload by: GitHub repo → Add file → Upload files → drag all files → Commit. Wait 1–2 minutes (Actions tab shows a green tick).
`config.js` already has your Supabase URL + publishable key. Never put a "service_role" or "secret" key anywhere.

## 2. Supabase SQL – run in this order (SQL Editor → paste → Run)
1. `supabase/1_foundation.sql`
2. `supabase/2_admin_functions.sql`
3. `supabase/3_first_admin.sql` – edit the login ID and password at the top first, run ONCE
4. `supabase/4_phase2.sql`
5. `supabase/5_modules.sql`
If you already ran 1–4 earlier, run only file 5. Each file stops with an error message if something is wrong – send me the message.
Also check: Authentication → Providers → Email is ON, and "Confirm email" is OFF.

## 3. Install on a phone
Open `https://tilakpanday2019-wq.github.io/amar-school/` → tap **Download App** (Android Chrome). On iPhone use Safari → Share → Add to Home Screen. After an update, close and reopen the app once (or twice) to get the new version.

## 4. First-time setup by the admin (in this order)
1. Settings → fill school address/phone/principal. Change your password (⋮ menu).
2. Classes and Subjects (or bulk import them: Import/Export).
3. Import Teachers, then Students, then Parents (parents need student IDs to exist).
4. Teacher assignments (which teacher teaches which class/subject) – import or add by hand. Teachers only see what is assigned.
5. **Grading rules → check the table against the official Nepal directive and tick "Verified".** The default table is only a starting point; reports show "not verified" until you do.
6. Exams → add exam → "Exam subjects" → set theory/practical marks and credit hours per class (use "Add all subjects" and "Copy to all classes").

## 5. Excel / CSV import and export
Menu → Import / Export. Choose the type, **Download template**, fill it in Excel, **Choose file** (.xlsx or .csv). You see a summary, every problem row with the reason, and nothing is saved until you press Import. Good rows import even if other rows have problems; you can download the error list.
Types: students, teachers, parents, classes+sections, subjects, teacher assignments, fee items, library books, calendar events, attendance, marks.
Teachers/parents: the file has the password column; accounts are created in groups of 40. Students and attendance and marks update existing rows (same Student ID / date / exam+subject). Fee items and library books and events are **added** – importing the same file twice duplicates them.
Export: any record type or a **Full backup** (one Excel file, many sheets). Passwords are never exported. Make a backup every month and keep it off the phone.

## 6. Daily use
* Teacher: Attendance → pick class, tap P/A/L/Lv, Save (works offline; it uploads when online). Marks entry → pick exam/class/subject, type marks, Submit. Homework, notices, leave.
* Admin: approve marks (Marks entry → Approve) → Grade sheets → Publish results → parents see report cards. Fees: take payment → printable receipt. Print report cards: Grade sheets → Print all → "Save as PDF".
* Parent: switch child at the top, see attendance, homework, results, fees, timetable, library, transport.
* Teachers can only mark attendance for today and the last 3 days; the admin can change any date. Published results can't be edited by mistake (unpublish the exam first).

## 7. Security checklist
Use strong admin password · never share the Supabase secret keys · Row-Level Security is on for every table (tested: teachers see only their classes, parents only their children) · auto sign-out after inactivity (Settings) · audit log records changes · keep backups.

## 8. Free-plan limits (Supabase Free)
500 MB database, 1 GB file storage, projects pause after 7 days with no use (open the app weekly or unpause in the dashboard). No automatic backups on the free plan → use the Full backup export.

## 9. Honest limitations
* This is a **PWA, not an APK**. If you need a Play-Store APK later, wrap the URL with PWABuilder (free) – not done here.
* **No push notifications** (needs a paid server). The Inbox tab shows notices, absences, fees, homework and results instead.
* PDFs use the phone's Print → Save as PDF.
* Nepali (BS) dates and Excel files need an internet connection (loaded from a CDN on first use). Dates are stored in AD.
* Offline: only attendance is saved offline. Everything else needs internet.
* Tested: database security (54 checks), grading (14), import rules (19), and every screen opens without errors in a browser against a **fake** database. **Not yet tested against your real Supabase project** – please run through the first-time setup and tell me what breaks.
