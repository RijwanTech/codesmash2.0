# FORCES CodeSmash 2.0 – full-stack edition

Coding-competition platform for the FORCES CSE community, P.E.S. College of Engineering, Chhatrapati Sambhajinagar.

- **Frontend:** React + TypeScript + Vite (`client/`)
- **Backend:** Node.js + Express + **MongoDB Atlas** (Mongoose) + Socket.IO (`server/`)
- Three rounds, countdown timers, qualification gates, ranking with time tie-break, live leaderboard,
  **instant notifications** and a full **admin panel**.

## What changed compared with the LocalStorage prototype

| Before (LocalStorage) | Now |
| --- | --- |
| Data only in one browser | Everything in MongoDB Atlas – shared by all devices |
| Answers visible in browser storage | Correct answers **stay on the server**; answers are checked server-side |
| Timer on the student's PC | **Server-side timer**; auto-submit happens on the server even if the browser is closed |
| Login by roll number only | Roll number + password (bcrypt) and signed login tokens; separate organiser login |
| No notifications | Live notifications (WebSocket) + saved notification list + optional email |

## 1. MongoDB Atlas setup

1. In Atlas open **Database Access** and make sure your database user has *Read and write to any database* (or to the `codesmash` database).
2. Open **Network Access → Add IP address** and add the IP of the computer that runs the server
   (use `0.0.0.0/0` only while testing). A wrong IP list is the #1 cause of "cannot connect".
3. Open **Connect → Drivers** and copy the host part of the connection string, e.g. `cluster0.ab1cd.mongodb.net`.
4. Create `server/.env` from the template and fill it in:

   ```bash
   cd server
   cp .env.example .env      # Windows: copy .env.example .env
   ```

   Set `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_HOST`, plus `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
   Special characters in the password are encoded for you. **Keep this file private** – never commit it or paste the
   password into chats, tickets or screenshots. (If a password was ever shared, rotate it in Atlas.)

The collections (`students`, `rounds`, `attempts`, `notifications`) are created automatically, and the three sample rounds
with sample problems are inserted the first time the server starts against an empty database.

## 2. Run it

Requirements: Node.js 18+.

**Development (two terminals)**

```bash
# terminal 1 – API + live notifications on :5000
cd server && npm install && npm run dev

# terminal 2 – website on :5173 (proxies /api and WebSocket to :5000)
cd client && npm install && npm run dev
```

Open http://localhost:5173.

**Event day (one process, works across the college network)**

```bash
cd client && npm install && npm run build      # creates client/dist
cd ../server && npm install && npm start       # serves the website AND the API on :5000
```

Participants open `http://<server-computer-ip>:5000`. Allow port 5000 through the firewall. To put it on the internet,
deploy the `server/` folder to any Node host (Render, Railway, a college VPS …), set the same variables as environment
variables, and build the client once so `client/dist` sits next to `server/`.

Run the logic tests (no database needed): `cd server && npm test`.

## 3. Running the competition (admin)

Log in at `#/admin` (credentials from `server/.env`).

**The three rounds**

| Round | Type | What students do | Scoring |
|---|---|---|---|
| 1 | Technical quiz | Answer MCQs. You add the questions (one by one, or paste many with *Import many*). Every student gets the questions in a different random order. | `marks per question` x correct answers |
| 2 | Code correction | Choose Python / Java / C, then see wrong code and type the corrected program, question by question (random order per student, as many as you set - default 3). | Their code is compared with your correct code; `marks per question` each |
| 3 | Problem solving | Choose a language, write a full program for each problem (default 3). You provide the test inputs and expected outputs. | Marks in proportion to tests passed |

**Steps**
1. **Rounds tab** - set each round's *password*, duration, qualifying score, questions per student and marks per question. Use *Generate* for a random password. Each round has its own password; tell students the password only when that round starts.
2. **Questions tab** - add the content of each round. A round cannot be opened without a password and at least one question.
3. **Registration tab** - set a deadline or press *Close registration now*. After that students cannot register themselves. Use **Spot registration** to add a participant yourself (works even when registration is closed); the generated login password is shown once.
4. Open Round 1 (students are notified). When it ends, qualified students are notified automatically and Round 2 becomes available to them, and so on.
5. **Participants tab** - *View / grade* shows every answer and lets you change marks (needed in manual judge mode), force-qualify, reset an attempt or reset a password.

**Code matching (Round 2).** Comments, blank lines and extra spaces are ignored (Python indentation is compared by level). Everything else must match your correct code exactly, so a valid but differently written fix is marked wrong - correct it with *View / grade*. Keep wrong/correct code short and unambiguous.

**Running student code (Round 3) - Judge0.** Step-by-step Windows setup (Ubuntu VM + Docker) and the ready-made `judge0/` files are in `JUDGE0_SETUP.md`; verify with `npm run check:judge` in the server folder. The server never runs student code itself. For automatic judging set `JUDGE0_URL` in `server/.env` (a self-hosted Judge0, or RapidAPI's Judge0 with `JUDGE0_RAPIDAPI_KEY`); see `.env.example`. Without it the platform runs in **manual mode**: code is saved and you give marks in *View / grade*. Students get a **Run code** button (runs on the sample input or their own typed input and shows the output, no marks) and a **Submit code** button (runs all your tests and scores). Run needs Judge0 too, except that in manual mode **Python** can still be run inside the student's own browser (Pyodide, needs internet on the student device); Java and C cannot be run without Judge0. The Judge0 integration is tested against a fake server only - try it with one sample problem before the event.

**Upgrading from the earlier version.** On start the server converts your existing Round 1-3 documents to the new types. Old sample questions are replaced by the new sample content, and old scores of finished attempts are carried over as points. Keep your `.env`.

### Who is notified, and when

| Event | Notified |
| --- | --- |
| A student's round ends (they finish, time runs out, or you close the round) | That student: **"🎉 You qualified for Round 2"** (or a "not qualified" result) |
| You set a round to **Open** | Everyone eligible: all students for Round 1; only those who qualified in the previous round for Rounds 2–3 |
| You change a round's qualifying score or edit its problems | Anyone whose result changes |
| You force-qualify / disqualify a student | That student |
| You send an announcement | The audience you chose |

Online participants see a pop-up toast and the 🔔 counter update instantly; every notification is also saved in their
notification list. If you fill in the `SMTP_*` settings, the same messages are emailed too.

A typical flow: open Round 1 → students compete → Round 1 ends (close it) → qualified students are notified → open Round 2 →
only qualified students are notified and can enter → repeat → close Round 3 to publish the final results.

## How scoring works

- Each problem shows fixed input data; the student submits the answer their program prints. The server compares it with the
  stored answer (case and extra spaces ignored). Wrong answers can be retried; a correct one locks in.
- Round time = time of the **last correct solve**; total time = sum over rounds. Ranking = more points first, then less time;
  identical points *and* time share a rank.
- A student qualifies when the attempt has ended and the score ≥ the round's qualifying score (or an admin override says so).

## Security notes

- Passwords are hashed (bcrypt); tokens are signed with `JWT_SECRET`; login endpoints are rate-limited.
- The answer key is never sent to students. Students cannot see other students' emails.
- This is still an answer-based judge: it can't stop someone from sharing answers or using another tool to solve them.
  Supervise the event as you would an exam.
- Run it over HTTPS if it is exposed to the internet.

## Project layout

```
server/src/
  index.js          Express app, Atlas connection, auto-submit loop
  models.js         Student, Round (+ problems), Attempt, Notification
  scoring.js        pure scoring / qualification rules      (unit-tested)
  standings.js      ranking, round boards, status labels    (unit-tested)
  competition.js    finalize attempts, open/close rounds, overrides, notifications
  notify.js, mailer.js, realtime.js   saved + live + email notifications
  routes/           auth.js, student.js (+public), admin.js
client/src/
  store.tsx         login state, WebSocket, toasts, notification list
  api.ts, hooks.ts  API client and self-refreshing data hook
  pages/            Home, Rules, Auth, Dashboard, Round, Leaderboard, Results, Notifications, Admin
  components/       Navbar, NotificationBell, Countdown (server-clock based), dialogs …
```


## Troubleshooting: "I log in and get logged out" / blank data
1. Start the **server first** (`cd server`, `npm run dev`) and wait for "Connected to MongoDB Atlas". Then start the website (`cd client`, `npm run dev`).
2. A red banner under the menu on the website means the server is not reachable, or an **old copy of the server** is answering on port 5000. Close every old terminal / `node.exe` in Task Manager and start the server again. If port 5000 is busy the server now says so and stops.
3. A brief server or Atlas problem no longer logs anyone out. Only a real "not logged in" answer from the server does.
4. In Atlas open **Network Access** and allow your current IP (or 0.0.0.0/0 while testing). Atlas blocks you when your internet connection changes.
5. If an old login token confuses the page: browser F12 -> Application -> Local Storage -> delete `codesmash-token`.

## Screens
- Starting a round opens a **full-screen exam view**: timer, progress bar, question palette. Round 1 shows one question at a time (keys A-D to pick, arrows to move, "Mark for review"). Round 2 shows the wrong code and the student's editor side by side with line numbers.
- The organiser panel has a sidebar: Live overview, Rounds & passwords, Questions, Registration, Participants, Announcements, Settings.


## Exam rules and what participants see
- Before a round opens, the participant reads the rules for that round and ticks **Yes, I understand**; then enters the round password (and picks a language in rounds 2 and 3).
- The round opens in **full screen**. If the participant leaves full screen, the questions are hidden until they return. Leaving full screen, switching tab/window, and the developer-tool shortcuts are recorded; copy, paste and right-click are blocked; reloading asks for confirmation. A web page cannot lock a computer completely: for a stricter lock use a kiosk browser (for example Safe Exam Browser) and a supervised lab.
- In Admin -> Rounds you can set **Auto-submit after N violations** (0 = only record them). Violations show in Participants, Leaderboard and the answer viewer, and in the CSV export.
- After submitting, a participant sees **only their score**. Qualified / not qualified, rank and the leaderboard are visible to the organiser only (Admin -> Leaderboard). The next round opens only for the participants you qualify, and they get a notification when it opens.
