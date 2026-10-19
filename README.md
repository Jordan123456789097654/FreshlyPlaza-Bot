# 🛒 FreshlyPlaza — Official Roblox Grocery Store Discord Bot

An all-in-one Discord bot built for **FreshlyPlaza** Roblox grocery store community, featuring Sessions, Training, Events, Bug Tracking, Suggestions, Honeypot Anti-Raid System, and Support Tickets.

---

## 🌟 Key Features

### 1. 🚀 Sessions & Store Shift Management
- **Commands**: `/session panel`, `/session start`, `/session conclude`, `/session cancel`
- **Channels**: Posts shift announcements in `#shifts` (`1505309843219546223`) with `<@&Shift ping>` notifications.
- **Audit Logs**: Automatically logs completed shift details and hosts to `#shift-logs` (`1511043137261535392`).

### 2. 🎓 Training System
- **Commands**: `/training panel`, `/training announce`, `/training pass`, `/training fail`, `/training conclude`
- **Channels**: Posts training announcements in `#training-sessions` (`1505309891244589066`).
- **Audit Logs**: Logs passed and failed trainees with notes to `#training-center-logs` (`1511043321814843576`).

### 3. 🎊 Event System
- **Commands**: `/event panel`, `/event create`
- **Channels**: Posts event announcements in `#events` (`1510644873114423338`) with interactive **RSVP** buttons.

### 4. 🐛 Bug Reports & Known Bugs
- **Commands**: `/bug panel`, `/bug report`
- **Channels**: Interactive submit button in `#bugs-report` (`1528501240969957447`) with management buttons (`Resolve`, `In-Progress`, `Reject`).
- **Known Bugs Mirroring**: Click `📌 Add to Known Bugs` to format and mirror bugs directly to `#known-bugs` (`1528883412595904673`).

### 5. 💡 Suggestions Portal
- **Commands**: `/suggest panel`, `/suggest submit`
- **Channels**: Posts suggestion embeds to `#suggestions` (`1526869423917498388`) with live `👍 Upvote` and `👎 Downvote` counters.

### 6. 🛡️ Honeypot Anti-Raid Trap System
- **Channel**: `#honeypot` (`1529254082274000927`)
- **Behavior**: Any unauthorized user/bot sending a message in `#honeypot` gets:
  1. Message deleted immediately
  2. 24-hour timeout + `Honeypot` role (`1529254081443528808`) assigned
  3. Detailed alert logged to `#modlogs` (`1524174852980736150`) and `#punishment-logs` (`1511043475150209276`)

### 7. 🎫 Support Ticket System
- **Commands**: `/ticket-panel`, `/ticket-create`, `/ticket-add`, `/ticket-remove`, `/ticket-close` (with optional resolution summary), `/ticket-stats` (includes CSAT)
- **Categories**: Customer Support, Player/Staff Report, HR & Management Inquiry.
- **Category**: Opens private channels under `Tickets` (`1525187246016434267`).

### 8. ⚙️ Bot Configuration (`/config`)
- **Commands** (server admins / Manage Server only):
  - `/config ai enabled:<true|false>` turns the AI ticket assistant on or off everywhere. When off, tickets go straight to human staff: no AI replies, translations, screenshot analysis, ghostwriting, summaries, or AI QA grading. The setting is saved to the database and survives restarts. The default comes from `config.ai.enabled`.
  - `/config status` shows the current AI state and the ticket override user.

### 9. 🔑 Ticket Override Access
- The user set in `config.ticketOverride.userId` (`1046538179399929957`, JordanDanielsGames2) can view, post in, and manage **every** support ticket channel, including existing ones (synced on startup) and any created later.
- That user also passes the staff checks for ticket buttons and commands (claim, transfer, snippets, force-open, and so on).

---

## ⚡ Setup & Deployment

Run the master deployment command in Discord:
```
/setup-freshlyplaza
```
This automatically deploys all interactive panels into their respective channels in FreshlyPlaza server!

### Environment
- `HEALTH_API_TOKEN`: required to change the public bot status over HTTP (`/set-status`, `/down`, `/degraded`, `/maintenance`, `/partial-outage`, `/reset`). Send it as `Authorization: Bearer <token>`. If unset, those routes refuse all requests.

### Running the Bot
```bash
# Register Slash Commands
npm run deploy

# Start the Bot
npm start
```
