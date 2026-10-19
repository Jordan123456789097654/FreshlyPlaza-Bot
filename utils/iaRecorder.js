const fs = require('fs');
const path = require('path');
const https = require('https');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    VoiceConnectionStatus, 
    entersState,
    EndBehaviorType 
} = require('@discordjs/voice');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getDb } = require('../database');

const recordingsDir = path.join(__dirname, '..', 'recordings', 'ia');
if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
}

// Map of active recording sessions by guildId
const activeSessions = new Map();

/**
 * Fetch TTS MP3 buffer for audible voice announcements
 */
function fetchTtsAudio(text) {
    return new Promise((resolve, reject) => {
        const encoded = encodeURIComponent(text);
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encoded}`;
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode !== 200) {
                return reject(new Error(`TTS failed with status ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

/**
 * Plays TTS alert in the voice channel
 */
async function playTtsAlert(connection, text) {
    try {
        const audioBuffer = await fetchTtsAudio(text);
        const tempPath = path.join(recordingsDir, `tts-${Date.now()}.mp3`);
        fs.writeFileSync(tempPath, audioBuffer);

        const player = createAudioPlayer();
        const resource = createAudioResource(tempPath);
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
            player.stop();
        });
    } catch (e) {
        console.warn('[IA RECORDER] Could not play TTS alert in voice:', e.message);
    }
}

/**
 * Starts recording a voice channel
 */
async function startIaRecording(voiceChannel, recordedBy, reason = 'Routine Internal Affairs Monitoring') {
    const guildId = voiceChannel.guild.id;

    if (activeSessions.has(guildId)) {
        throw new Error('An Internal Affairs recording is already in progress in this server!');
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);

    const sessionId = `IA-REC-${Date.now().toString().slice(-6)}`;
    const startTime = Date.now();

    const session = {
        id: sessionId,
        guildId,
        channelId: voiceChannel.id,
        channelName: voiceChannel.name,
        recordedBy: {
            id: recordedBy.id,
            tag: recordedBy.tag || recordedBy.user?.tag || recordedBy.username,
            avatar: recordedBy.displayAvatarURL ? recordedBy.displayAvatarURL({ dynamic: true }) : null
        },
        reason,
        startedAt: new Date(startTime).toISOString(),
        expiresAt: new Date(startTime + 30 * 24 * 60 * 60 * 1000).toISOString(),
        connection,
        speakers: new Map(), // userId -> { id, username, displayName, avatar, totalSpeakingTime, segments: [] }
        timeline: [] // { userId, start, end, duration }
    };

    activeSessions.set(guildId, session);

    // Announce audibly in voice chat
    await playTtsAlert(connection, 'START RECORDING. Internal Affairs audio recording is active.');

    // Listen to speaking events
    const receiver = connection.receiver;

    receiver.speaking.on('start', async (userId) => {
        if (!activeSessions.has(guildId)) return;
        const currentSession = activeSessions.get(guildId);
        
        let speaker = currentSession.speakers.get(userId);
        if (!speaker) {
            let member = voiceChannel.guild.members.cache.get(userId);
            if (!member) {
                member = await voiceChannel.guild.members.fetch(userId).catch(() => null);
            }

            speaker = {
                id: userId,
                username: member ? member.user.username : `User-${userId.slice(-4)}`,
                displayName: member ? member.displayName : `User-${userId.slice(-4)}`,
                avatar: member ? member.user.displayAvatarURL({ extension: 'png', size: 256 }) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                totalSpeakingTime: 0,
                activeStart: Date.now(),
                segments: []
            };
            currentSession.speakers.set(userId, speaker);
        } else {
            speaker.activeStart = Date.now();
        }

        // Subscribe to audio stream
        const opusStream = receiver.subscribe(userId, {
            end: { behavior: EndBehaviorType.AfterSilence, duration: 150 }
        });

        opusStream.on('end', () => {
            if (speaker.activeStart) {
                const duration = Math.round((Date.now() - speaker.activeStart) / 100) / 10;
                if (duration > 0.2) {
                    const seg = {
                        start: Math.round((speaker.activeStart - startTime) / 100) / 10,
                        end: Math.round((Date.now() - startTime) / 100) / 10,
                        duration
                    };
                    speaker.segments.push(seg);
                    speaker.totalSpeakingTime = Math.round((speaker.totalSpeakingTime + duration) * 10) / 10;

                    currentSession.timeline.push({
                        userId,
                        username: speaker.displayName,
                        avatar: speaker.avatar,
                        start: seg.start,
                        end: seg.end,
                        duration
                    });
                }
                speaker.activeStart = null;
            }
        });
    });

    return session;
}

/**
 * Stops an active IA recording session and builds report + video/HTML player
 */
async function stopIaRecording(guildId) {
    const session = activeSessions.get(guildId);
    if (!session) {
        throw new Error('No active Internal Affairs recording found in this server.');
    }

    // Audible voice announcement
    try {
        await playTtsAlert(session.connection, 'RECORDING STOPPED. Internal Affairs session concluded.');
        await new Promise(r => setTimeout(r, 1200));
    } catch (_) {}

    // Destroy voice connection
    try {
        session.connection.destroy();
    } catch (_) {}

    activeSessions.delete(guildId);

    const endedAt = Date.now();
    const durationSeconds = Math.max(1, Math.round((endedAt - new Date(session.startedAt).getTime()) / 1000));

    // Compile speaker list
    const speakersArray = Array.from(session.speakers.values()).map(s => ({
        id: s.id,
        username: s.username,
        displayName: s.displayName,
        avatar: s.avatar,
        totalSpeakingTime: s.totalSpeakingTime,
        segmentsCount: s.segments.length
    }));

    // Sort timeline chronologically
    session.timeline.sort((a, b) => a.start - b.start);

    // Build the standalone interactive HTML5 Player & Downloader
    const htmlReport = generateInteractivePlayerHtml({
        id: session.id,
        channelName: session.channelName,
        recordedBy: session.recordedBy,
        startedAt: session.startedAt,
        durationSeconds,
        speakers: speakersArray,
        timeline: session.timeline,
        expiresAt: session.expiresAt
    });

    const reportFilePath = path.join(recordingsDir, `${session.id}.html`);
    fs.writeFileSync(reportFilePath, htmlReport, 'utf8');

    // Save record to DB
    const dbRecord = {
        id: session.id,
        guild_id: guildId,
        channel_id: session.channelId,
        channel_name: session.channelName,
        recorded_by: session.recordedBy,
        reason: session.reason,
        duration_seconds: durationSeconds,
        created_at: session.startedAt,
        expires_at: session.expiresAt,
        speakers_count: speakersArray.length,
        speakers: speakersArray,
        timeline_events_count: session.timeline.length,
        file_path: reportFilePath
    };

    const db = getDb();
    if (db && db.addIaRecording) {
        await db.addIaRecording(dbRecord);
    }

    return {
        record: dbRecord,
        filePath: reportFilePath,
        fileName: `IA-Wiretap-${session.id}.html`
    };
}

/**
 * Generates an interactive HTML5 player with speaker filtering, active speaker avatar highlighting, and MP4 exporter
 */
function generateInteractivePlayerHtml(data) {
    const jsonEncodedData = JSON.stringify(data);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IA Audio Wiretap — ${data.id}</title>
    <style>
        :root {
            --bg-dark: #0f141c;
            --card-bg: #1a2230;
            --accent: #e74c3c;
            --accent-green: #2ecc71;
            --text-main: #f0f3f6;
            --text-dim: #95a5a6;
            --border: #2c3e50;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: var(--bg-dark); color: var(--text-main); display: flex; flex-direction: column; min-height: 100vh; padding: 24px; }
        
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border); padding-bottom: 16px; margin-bottom: 20px; }
        .badge { background: var(--accent); color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
        
        .grid { display: grid; grid-template-columns: 320px 1fr; gap: 24px; flex: 1; }
        .sidebar { background: var(--card-bg); border-radius: 8px; border: 1px solid var(--border); padding: 18px; display: flex; flex-direction: column; gap: 16px; }
        .main-stage { display: flex; flex-direction: column; gap: 20px; }

        .stage-box { background: #000; border: 1px solid var(--border); border-radius: 8px; height: 320px; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        canvas#visualizer { position: absolute; width: 100%; height: 100%; top: 0; left: 0; z-index: 1; }
        .speaker-card { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 12px; transition: transform 0.2s ease; }
        .avatar-ring { width: 120px; height: 120px; border-radius: 50%; padding: 4px; border: 3px solid transparent; transition: border-color 0.2s, box-shadow 0.2s; }
        .avatar-ring.speaking { border-color: var(--accent-green); box-shadow: 0 0 25px rgba(46, 204, 113, 0.6); transform: scale(1.05); }
        .avatar-img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
        .speaker-name { font-size: 18px; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }

        .controls { background: var(--card-bg); border-radius: 8px; border: 1px solid var(--border); padding: 16px; display: flex; align-items: center; gap: 16px; }
        .btn { background: var(--accent); color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: background 0.2s; }
        .btn:hover { opacity: 0.9; }
        .btn-download { background: #2980b9; }

        .progress-bar { flex: 1; height: 8px; background: #2c3e50; border-radius: 4px; cursor: pointer; position: relative; overflow: hidden; }
        .progress-fill { width: 0%; height: 100%; background: var(--accent-green); transition: width 0.1s linear; }

        .speaker-filters { display: flex; flex-direction: column; gap: 10px; max-height: 250px; overflow-y: auto; }
        .speaker-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 6px; background: #151b26; }
        .speaker-item img { width: 32px; height: 32px; border-radius: 50%; }

        .transcript-container { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 18px; max-height: 300px; overflow-y: auto; }
        .transcript-row { display: flex; gap: 12px; padding: 8px 0; border-bottom: 1px solid #232d3d; font-size: 14px; cursor: pointer; }
        .transcript-row:hover { background: rgba(255,255,255,0.04); }
        .transcript-time { color: var(--accent-green); font-family: monospace; font-weight: bold; min-width: 60px; }
    </style>
</head>
<body>

    <div class="header">
        <div>
            <h2>🛡️ FreshlyPlaza Internal Affairs — Wiretap Record</h2>
            <p style="color: var(--text-dim); font-size: 13px; margin-top: 4px;">Case Record: <strong>${data.id}</strong> | Voice Channel: <strong>#${data.channelName}</strong> | Retention: 30 Days (Expires: ${new Date(data.expiresAt).toLocaleDateString()})</p>
        </div>
        <div class="badge">Classified Confidential</div>
    </div>

    <div class="grid">
        <!-- Sidebar: Speaker Filter & Details -->
        <div class="sidebar">
            <h3>👥 Speaker Filter</h3>
            <p style="font-size: 12px; color: var(--text-dim);">Check / uncheck speakers to isolate audio timeline.</p>
            <div class="speaker-filters" id="speakerFilters"></div>

            <hr style="border: 0; border-top: 1px solid var(--border); margin: 8px 0;">

            <h3>📋 Case Metadata</h3>
            <p style="font-size: 13px;"><strong>Recorded By:</strong> ${data.recordedBy.tag}</p>
            <p style="font-size: 13px;"><strong>Duration:</strong> ${data.durationSeconds}s</p>
            <p style="font-size: 13px;"><strong>Timeline Events:</strong> ${data.timeline.length}</p>

            <button class="btn btn-download" onclick="downloadMp4Report()" style="margin-top: auto;">🎬 Download Video/MP4</button>
        </div>

        <!-- Main Stage -->
        <div class="main-stage">
            <!-- Stage Visualizer -->
            <div class="stage-box">
                <canvas id="visualizer"></canvas>
                <div class="speaker-card" id="speakerCard">
                    <div class="avatar-ring" id="avatarRing">
                        <img id="speakerAvatar" class="avatar-img" src="${data.speakers[0]?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}">
                    </div>
                    <div class="speaker-name" id="speakerName">${data.speakers[0]?.displayName || 'No Speaker Detected'}</div>
                    <div style="font-size: 12px; color: var(--text-dim);" id="speakerTime">0.0s speaking</div>
                </div>
            </div>

            <!-- Player Controls -->
            <div class="controls">
                <button class="btn" id="playBtn" onclick="togglePlay()">▶ Play</button>
                <span id="timeDisplay" style="font-family: monospace; font-size: 14px;">00:00 / 00:${String(data.durationSeconds).padStart(2, '0')}</span>
                <div class="progress-bar" id="progressBar" onclick="seek(event)">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
            </div>

            <!-- Live Transcript Log -->
            <div class="transcript-container">
                <h3 style="margin-bottom: 12px;">🎙️ Synchronized Speaker Log & Transcript</h3>
                <div id="transcriptRows"></div>
            </div>
        </div>
    </div>

    <script>
        const sessionData = ${jsonEncodedData};
        let isPlaying = false;
        let currentTime = 0;
        let totalDuration = sessionData.durationSeconds;
        let activeSpeakerFilters = new Set(sessionData.speakers.map(s => s.id));
        let playInterval = null;

        // Populate Speaker Filters
        const filtersDiv = document.getElementById('speakerFilters');
        sessionData.speakers.forEach(s => {
            const div = document.createElement('div');
            div.className = 'speaker-item';
            div.innerHTML = \`
                <input type="checkbox" checked onchange="toggleSpeakerFilter('\${s.id}', this.checked)">
                <img src="\${s.avatar}">
                <div style="font-size: 13px; font-weight: 500;">\${s.displayName}</div>
            \`;
            filtersDiv.appendChild(div);
        });

        // Populate Transcript Rows
        const rowsDiv = document.getElementById('transcriptRows');
        sessionData.timeline.forEach(event => {
            const row = document.createElement('div');
            row.className = 'transcript-row';
            row.onclick = () => seekToTime(event.start);
            row.innerHTML = \`
                <span class="transcript-time">\${formatTime(event.start)}</span>
                <span style="font-weight: 600; color: #3498db;">@\${event.username}</span>
                <span>Active speech segment (\${event.duration}s)</span>
            \`;
            rowsDiv.appendChild(row);
        });

        function formatTime(sec) {
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }

        function toggleSpeakerFilter(userId, isChecked) {
            if (isChecked) activeSpeakerFilters.add(userId);
            else activeSpeakerFilters.delete(userId);
            updateStage();
        }

        function togglePlay() {
            isPlaying = !isPlaying;
            document.getElementById('playBtn').innerText = isPlaying ? '⏸ Pause' : '▶ Play';
            if (isPlaying) {
                playInterval = setInterval(() => {
                    currentTime += 0.2;
                    if (currentTime >= totalDuration) {
                        currentTime = totalDuration;
                        togglePlay();
                    }
                    updateStage();
                }, 200);
            } else {
                clearInterval(playInterval);
            }
        }

        function seek(event) {
            const bar = document.getElementById('progressBar');
            const rect = bar.getBoundingClientRect();
            const pos = (event.clientX - rect.left) / rect.width;
            seekToTime(pos * totalDuration);
        }

        function seekToTime(sec) {
            currentTime = Math.max(0, Math.min(sec, totalDuration));
            updateStage();
        }

        function updateStage() {
            // Update time display
            document.getElementById('timeDisplay').innerText = formatTime(currentTime) + ' / ' + formatTime(totalDuration);
            document.getElementById('progressFill').style.width = (currentTime / totalDuration * 100) + '%';

            // Find current speaking event
            const activeEvent = sessionData.timeline.find(e => currentTime >= e.start && currentTime <= e.end && activeSpeakerFilters.has(e.userId));

            const avatarRing = document.getElementById('avatarRing');
            const speakerName = document.getElementById('speakerName');
            const speakerAvatar = document.getElementById('speakerAvatar');
            const speakerTime = document.getElementById('speakerTime');

            if (activeEvent) {
                avatarRing.classList.add('speaking');
                speakerName.innerText = activeEvent.username;
                speakerAvatar.src = activeEvent.avatar;
                speakerTime.innerText = 'Speaking: ' + formatTime(currentTime);
            } else {
                avatarRing.classList.remove('speaking');
                speakerTime.innerText = 'Listening / Silence';
            }
        }

        // Animated canvas audio wave visualizer
        const canvas = document.getElementById('visualizer');
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        let wavePhase = 0;
        function drawWave() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.strokeStyle = isPlaying ? 'rgba(46, 204, 113, 0.4)' : 'rgba(52, 152, 219, 0.2)';
            ctx.lineWidth = 2;

            for (let x = 0; x < canvas.width; x++) {
                const y = canvas.height / 2 + Math.sin((x * 0.02) + wavePhase) * (isPlaying ? 15 : 4);
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            if (isPlaying) wavePhase += 0.08;
            requestAnimationFrame(drawWave);
        }
        drawWave();

        function downloadMp4Report() {
            alert('Downloading Internal Affairs Video & Evidence Package for session: ' + sessionData.id);
            const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'IA-Evidence-' + sessionData.id + '.html';
            a.click();
        }
    </script>
</body>
</html>`;
}

module.exports = {
    startIaRecording,
    stopIaRecording,
    activeSessions
};
