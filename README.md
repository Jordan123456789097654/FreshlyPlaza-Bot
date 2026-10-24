# 🛒 Grandway Shopping — Official Roblox Grocery Store Discord Bot

An all-in-one Discord bot built for **Grandway Shopping** Roblox grocery store community, featuring Sessions, Training, Events, Bug Tracking, Suggestions, Honeypot Anti-Raid System, ModMail Support Tickets, and high-fidelity YouTube Music Streaming.

---

## 🌟 Key Features

### 1. 🎵 YouTube Music System
A fully featured, multi-guild Discord music player supporting direct YouTube video links, playlist queues, and keyword searches with interactive control buttons:
- **Commands**:
  - `/play <query> [search]`: Play a track by YouTube URL, playlist link, or keyword search. Set `search: true` to get an interactive dropdown of top 5 YouTube results.
  - `/pause`: Pause the current audio playback.
  - `/resume`: Resume paused playback.
  - `/skip`: Skip the current song to the next in queue.
  - `/stop`: Clear the queue, stop audio, and initiate disconnect.
  - `/queue [page]`: Display paginated upcoming tracks and current song information.
  - `/nowplaying`: Display an attractive embed with the song title, artist/channel, duration, requester, volume, loop mode, and thumbnail, complete with interactive control buttons.
  - `/volume <percent>`: Adjust volume smoothly from `1%` to `200%`.
  - `/shuffle`: Randomly shuffle the upcoming queue.
  - `/loop <mode>`: Toggle repeat mode between `Off`, `Single Track` (🔂), and `Entire Queue` (🔁).
  - `/remove <position>`: Remove a specific track from the queue.
- **Interactive Controls**: Now Playing messages include responsive buttons for Play/Pause, Skip, Stop, Loop, and Queue view.
- **Audio Pipeline**: Built on `@discordjs/voice`, `@distube/ytdl-core`, `yt-search`, and `ffmpeg-static` for reliable WebM/Opus audio streaming on both Windows and Linux without manual system PATH setup.

### 2. 🚀 Sessions & Store Shift Management
- **Commands**: `/session panel`, `/session start`, `/session conclude`, `/session cancel`, `/shift-vote <start|end|status|voters>`
- **Channels**: Posts shift announcements in `#shifts` with role ping notifications and station assignments.

### 3. 🎓 Training System
- **Commands**: `/training-announce`, `/training-pass`, `/training-fail`, `/training-conclude`
- **Channels**: Posts training announcements in `#training-sessions`.

### 4. 🎊 Event System
- **Commands**: `/event-create`
- **Channels**: Posts event announcements in `#events` with interactive RSVP buttons.

### 5. 🐛 Bug Reports & Known Bugs
- **Commands**: `/bug`
- **Channels**: Interactive submit button in `#bugs-report` with management buttons (`Resolve`, `In-Progress`, `Reject`).

### 6. 💡 Suggestions Portal
- **Commands**: `/suggest`
- **Channels**: Posts suggestion embeds to `#suggestions` with live `👍 Upvote` and `👎 Downvote` counters.

### 7. 🛡️ ModMail & Ticket System
- **Commands**: `/modmail-panel`, `/modmail-reply`, `/modmail-anon-mode`, `/modmail-cleanup`, `/modmail-close`, `/ticket-force-open`, `/ticket-claim`, `/ticket-close`, `/ticket-config`
- **Channels**: DM bridge to staff channels, automated logging, and live web management dashboard (`/staff`).

---

## ⚡ Setup & Deployment

### Windows Setup
1. **Prerequisites**: Node.js 18+ (Node.js 22+ recommended).
2. **Install Dependencies**:
   ```powershell
   npm install
   ```
   *(Note: `ffmpeg-static` is pre-bundled in `package.json`, so no external FFmpeg binary installation or PATH modification is needed on Windows).*
3. **Environment**:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```powershell
   copy .env.example .env
   ```
4. **Run the Bot**:
   ```powershell
   node index.js
   ```

### Linux & Docker Deployment
A production-ready `Dockerfile` and `docker-compose.yml` are included.

1. **Build and Run via Docker Compose**:
   ```bash
   docker-compose up -d --build
   ```
2. **View Logs**:
   ```bash
   docker-compose logs -f
   ```

### Known Limitations & Best Practices
- **Age-Restricted / Private Videos**: Private or age-restricted YouTube videos requiring sign-in cannot be streamed anonymously and will return a clear user error prompt.
- **Discord Slash Command Limit**: The bot is configured to utilize exactly **100 / 100** commands to adhere to Discord's global application command limit.
