const config = require('../config');

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Renders the High-Performance Music Command Center Web Dashboard
 */
function renderMusicDashboard(queue, voiceChannels = []) {
    const isPlaying = queue && queue.isPlaying && queue.currentTrack;
    const currentTrack = isPlaying ? queue.currentTrack : null;
    const isPaused = queue && queue.player ? (queue.player.paused || (queue.player.state && queue.player.state.status === 'paused')) : false;

    const trackTitle = currentTrack ? escapeHtml(currentTrack.title) : 'Nothing Playing';
    const trackAuthor = currentTrack ? escapeHtml(currentTrack.author || 'Unknown') : 'Select a song or paste a YouTube URL below';
    const trackThumb = currentTrack && currentTrack.thumbnail ? currentTrack.thumbnail : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';
    const trackDuration = currentTrack ? currentTrack.duration : '0:00';
    const trackSeconds = currentTrack ? (currentTrack.seconds || 1) : 1;
    const elapsedSeconds = queue ? queue.getPlaybackSeconds() : 0;
    const currentVolume = queue ? queue.volume : 100;
    const currentSpeed = queue ? (queue.speed || 1.0) : 1.0;
    const currentFilter = queue ? (queue.activeFilter || 'none') : 'none';
    const currentLoop = queue ? queue.loopMode : 'off';

    const vcOptions = voiceChannels.map(vc => `
        <option value="${vc.id}" ${queue && queue.voiceChannelId === vc.id ? 'selected' : ''}>🔊 ${escapeHtml(vc.name)} (${vc.membersCount} members)</option>
    `).join('') || '<option value="">No Voice Channels Available</option>';

    const queueListHtml = (queue && queue.queue.length > 0) ? queue.queue.map((t, idx) => `
        <div class="queue-item" draggable="true" data-index="${idx}" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)">
            <span class="queue-handle">⋮⋮</span>
            <span class="queue-idx">#${idx + 1}</span>
            <img class="queue-thumb" src="${t.thumbnail || trackThumb}" alt="art" />
            <div class="queue-details">
                <div class="queue-title">${escapeHtml(t.title)}</div>
                <div class="queue-meta">${escapeHtml(t.author)} • ${t.duration} • <span class="queue-user">👤 ${escapeHtml(t.requester.tag)}</span></div>
            </div>
            <button class="btn-icon btn-del" onclick="deleteQueueTrack(${idx})" title="Remove Track">🗑️</button>
        </div>
    `).join('') : '<div class="empty-queue-msg">☕ The queue is currently empty. Search for music or paste a link below!</div>';

    const historyListHtml = (queue && queue.history && queue.history.length > 0) ? queue.history.slice(0, 15).map(h => `
        <div class="history-item">
            <span class="history-clock">🕒 ${new Date(h.playedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <div class="history-info">
                <div class="history-title">${escapeHtml(h.title)}</div>
                <div class="history-artist">${escapeHtml(h.author)}</div>
            </div>
            <button class="btn-action btn-replay" onclick="quickPlay('${escapeHtml(h.url)}')">▶️ Replay</button>
        </div>
    `).join('') : '<div class="empty-queue-msg">No listening history recorded in this session yet.</div>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎵 Grandway Shopping • Music Command Center</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #2ECC71;
            --primary-glow: rgba(46, 204, 113, 0.35);
            --secondary: #3498DB;
            --secondary-glow: rgba(52, 152, 219, 0.35);
            --bg-dark: #080b14;
            --card-bg: rgba(18, 24, 38, 0.85);
            --sidebar-bg: #0d121f;
            --border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --danger: #ef4444;
            --warning: #f59e0b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background: var(--bg-dark); color: var(--text-main); min-height: 100vh; display: flex; overflow-x: hidden; }
        
        /* Sidebar Navigation */
        .sidebar {
            width: 260px;
            background: var(--sidebar-bg);
            border-right: 1px solid var(--border);
            padding: 28px 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .brand { font-size: 18px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px; }
        .nav-links { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .nav-item {
            padding: 12px 14px;
            border-radius: 10px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.2s;
        }
        .nav-item.active, .nav-item:hover { background: rgba(46, 204, 113, 0.12); color: var(--primary); }

        .main-content { flex: 1; padding: 36px 40px; overflow-y: auto; }
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 20px; flex-wrap: wrap; }
        .top-bar h1 { font-size: 26px; font-weight: 800; color: #fff; }

        /* Voice channel switcher banner */
        .vc-bar {
            background: rgba(52, 152, 219, 0.1);
            border: 1px solid rgba(52, 152, 219, 0.3);
            border-radius: 14px;
            padding: 14px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            gap: 15px;
            flex-wrap: wrap;
        }
        .vc-select {
            background: #090e1a;
            border: 1px solid var(--border);
            padding: 10px 14px;
            border-radius: 10px;
            color: #fff;
            font-size: 13px;
            font-weight: 600;
            outline: none;
        }

        /* Player Main Grid */
        .player-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 24px; margin-bottom: 24px; }
        .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 24px;
            backdrop-filter: blur(16px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.4);
        }

        /* Now Playing Hero */
        .now-playing-box { display: flex; gap: 24px; align-items: center; margin-bottom: 20px; }
        .album-art {
            width: 130px;
            height: 130px;
            border-radius: 16px;
            object-fit: cover;
            box-shadow: 0 8px 25px rgba(0,0,0,0.6);
            border: 1px solid var(--border);
        }
        .track-info { flex: 1; min-width: 0; }
        .track-badge {
            display: inline-block;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 4px 10px;
            border-radius: 6px;
            background: rgba(46, 204, 113, 0.15);
            color: var(--primary);
            margin-bottom: 8px;
        }
        .track-title { font-size: 20px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
        .track-artist { font-size: 14px; color: var(--text-muted); font-weight: 600; }

        /* Progress Bar */
        .progress-wrap { margin-bottom: 20px; }
        .progress-bar-bg {
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 4px;
            position: relative;
            cursor: pointer;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--primary), var(--secondary));
            width: 0%;
            border-radius: 4px;
            transition: width 0.3s linear;
        }
        .progress-times { display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); margin-top: 6px; }

        /* Waveform visualizer canvas */
        .visualizer-wrap {
            height: 60px;
            width: 100%;
            border-radius: 12px;
            overflow: hidden;
            background: rgba(0, 0, 0, 0.25);
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.05);
        }
        canvas { width: 100%; height: 100%; display: block; }

        /* Controls */
        .controls-row { display: flex; justify-content: center; align-items: center; gap: 14px; margin-bottom: 20px; }
        .btn-ctrl {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 1px solid var(--border);
            background: rgba(255, 255, 255, 0.06);
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-ctrl:hover { background: rgba(255, 255, 255, 0.15); transform: scale(1.05); }
        .btn-ctrl-play {
            width: 58px;
            height: 58px;
            background: var(--primary);
            color: #05160d;
            font-size: 20px;
            box-shadow: 0 0 20px var(--primary-glow);
            border: none;
        }
        .btn-ctrl-play:hover { background: #27ae60; transform: scale(1.08); }

        /* Slider Rows */
        .slider-row { display: flex; align-items: center; gap: 14px; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-top: 10px; }
        .slider-row span { width: 90px; }
        input[type="range"] {
            flex: 1;
            accent-color: var(--primary);
            cursor: pointer;
        }

        /* DSP Filter Presets */
        .dsp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
        .dsp-btn {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border);
            padding: 10px 12px;
            border-radius: 10px;
            color: #cbd5e1;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            text-align: center;
            transition: all 0.2s;
        }
        .dsp-btn:hover, .dsp-btn.active {
            background: rgba(46, 204, 113, 0.2);
            border-color: var(--primary);
            color: #86efac;
        }

        /* Queue List */
        .queue-box { display: flex; flex-direction: column; height: 100%; }
        .queue-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .queue-items { flex: 1; overflow-y: auto; max-height: 480px; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
        .queue-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            border-radius: 12px;
            cursor: grab;
            transition: all 0.2s;
        }
        .queue-item:hover { background: rgba(255, 255, 255, 0.06); }
        .queue-handle { color: var(--text-muted); cursor: grab; font-size: 14px; }
        .queue-idx { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); font-weight: 700; }
        .queue-thumb { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
        .queue-details { flex: 1; min-width: 0; }
        .queue-title { font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .queue-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .queue-user { color: #60a5fa; }
        .btn-del { background: transparent; border: none; font-size: 14px; cursor: pointer; color: var(--danger); opacity: 0.7; }
        .btn-del:hover { opacity: 1; transform: scale(1.15); }
        .empty-queue-msg { text-align: center; color: var(--text-muted); font-size: 13px; padding: 40px 20px; }

        /* Search input bar */
        .search-add-bar { display: flex; gap: 10px; margin-top: 14px; }
        .search-input {
            flex: 1;
            background: #090e1a;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px 16px;
            color: #fff;
            font-size: 13px;
            outline: none;
        }
        .search-input:focus { border-color: var(--primary); }
        .btn-action {
            padding: 10px 18px;
            border-radius: 10px;
            border: none;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-chat { background: var(--primary); color: #05160d; }
        .btn-chat:hover { background: #27ae60; }

        /* Lyrics & Analytics Tabs */
        .tab-bar { display: flex; gap: 10px; border-bottom: 1px solid var(--border); margin-bottom: 18px; }
        .tab-btn {
            background: transparent;
            border: none;
            padding: 10px 16px;
            font-size: 14px;
            font-weight: 700;
            color: var(--text-muted);
            cursor: pointer;
            border-bottom: 2px solid transparent;
        }
        .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

        .lyrics-box {
            background: #090e1a;
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 20px;
            height: 220px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
            font-size: 14px;
            line-height: 1.6;
        }
        .lyric-line { color: #64748b; transition: all 0.2s; }
        .lyric-line.active { color: var(--primary); font-size: 16px; font-weight: 800; transform: scale(1.02); }

        .history-list { display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; }
        .history-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px solid var(--border); }
        .history-clock { font-size: 11px; color: var(--text-muted); width: 80px; }
        .history-info { flex: 1; }
        .history-title { font-size: 13px; font-weight: 700; color: #fff; }
        .history-artist { font-size: 11px; color: var(--text-muted); }
        .btn-replay { background: rgba(52, 152, 219, 0.2); color: #60a5fa; padding: 6px 12px; font-size: 11px; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="brand">🛒 Grandway Utils</div>
        <div class="nav-links">
            <a href="/music" class="nav-item active">🎵 Music Command Center</a>
            <a href="/staff" class="nav-item">💬 Live ModMail Hub</a>
            <a href="/leaderboard" class="nav-item">🏆 Colleague Leaderboards</a>
            <a href="/appeal" class="nav-item">⚖️ Moderation Appeals</a>
            <a href="/status" class="nav-item">📊 System Health</a>
        </div>
    </div>

    <div class="main-content">
        <div class="top-bar">
            <div>
                <h1>🎵 Music Command Center & DSP Studio</h1>
                <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">High-fidelity YouTube streaming, 8D audio spatializer, speed control, and live queue controller</p>
            </div>
            <div style="display: flex; gap: 10px;">
                <a href="/music/banner" target="_blank" class="btn-action" style="background: rgba(255,255,255,0.08); color: #fff; text-decoration: none;">🖼️ View SVG Banner</a>
                <button class="btn-action btn-chat" onclick="location.reload()">🔄 Refresh Feed</button>
            </div>
        </div>

        <!-- Voice Channel Switcher -->
        <div class="vc-bar">
            <div>
                <strong style="color: #fff;">🔊 Current Voice Channel:</strong>
                <span id="currentVcName" style="color: #60a5fa; font-weight: 700; margin-left: 6px;">${escapeHtml(queue ? queue.voiceChannelName : 'Disconnected')}</span>
            </div>
            <div style="display: flex; gap: 10px; align-items: center;">
                <select id="vcSelect" class="vc-select">
                    ${vcOptions}
                </select>
                <button class="btn-action btn-chat" onclick="switchVoiceChannel()">Move Bot</button>
            </div>
        </div>

        <div class="player-grid">
            <!-- Left Column: Audio Player & DSP Studio -->
            <div class="card">
                <div class="now-playing-box">
                    <img class="album-art" src="${trackThumb}" alt="Cover" />
                    <div class="track-info">
                        <span class="track-badge">${isPlaying ? (isPaused ? '⏸️ PAUSED' : '▶️ NOW PLAYING') : 'IDLE'}</span>
                        <div class="track-title" id="trackTitle">${trackTitle}</div>
                        <div class="track-artist" id="trackArtist">${trackAuthor}</div>
                    </div>
                </div>

                <!-- Animated Waveform Visualizer -->
                <div class="visualizer-wrap">
                    <canvas id="waveformCanvas"></canvas>
                </div>

                <!-- Progress Bar -->
                <div class="progress-wrap">
                    <div class="progress-bar-bg" onclick="seekTrack(event)">
                        <div class="progress-fill" id="progressFill" style="width: ${(elapsedSeconds / trackSeconds) * 100}%;"></div>
                    </div>
                    <div class="progress-times">
                        <span id="timeElapsed">${formatSecs(elapsedSeconds)}</span>
                        <span id="timeDuration">${trackDuration}</span>
                    </div>
                </div>

                <!-- Controls -->
                <div class="controls-row">
                    <button class="btn-ctrl" onclick="sendAction('shuffle')" title="Shuffle Queue">🔀</button>
                    <button class="btn-ctrl" onclick="sendAction('skip')" title="Skip Track">⏭️</button>
                    <button class="btn-ctrl btn-ctrl-play" onclick="sendAction('toggle_pause')" title="Play / Pause" id="btnPlayPause">
                        ${isPaused ? '▶️' : '⏸️'}
                    </button>
                    <button class="btn-ctrl" onclick="sendAction('stop')" title="Stop & Disconnect">⏹️</button>
                    <button class="btn-ctrl" onclick="toggleLoop()" title="Toggle Loop" id="btnLoop">
                        ${currentLoop === 'track' ? '🔂' : (currentLoop === 'queue' ? '🔁' : '➡️')}
                    </button>
                </div>

                <!-- Sliders: Volume & Speed/Pitch -->
                <div class="slider-row">
                    <span>🔊 Volume: <strong id="volDisplay">${currentVolume}%</strong></span>
                    <input type="range" id="volSlider" min="1" max="200" value="${currentVolume}" onchange="changeVolume(this.value)">
                </div>

                <div class="slider-row">
                    <span>⚡ Speed: <strong id="speedDisplay">${currentSpeed}x</strong></span>
                    <input type="range" id="speedSlider" min="0.5" max="2.0" step="0.05" value="${currentSpeed}" onchange="changeSpeed(this.value)">
                </div>

                <!-- 🎛️ DSP Sound Effect Presets -->
                <h4 style="font-size: 14px; color: #fff; margin-top: 24px; margin-bottom: 4px;">🎛️ DSP Audio Processing & Sound Effects</h4>
                <div class="dsp-grid">
                    <button class="dsp-btn ${currentFilter === 'none' ? 'active' : ''}" onclick="applyFilter('none')">Clean (Off)</button>
                    <button class="dsp-btn ${currentFilter === 'nightcore' ? 'active' : ''}" onclick="applyFilter('nightcore')">✨ Nightcore</button>
                    <button class="dsp-btn ${currentFilter === 'vaporwave' ? 'active' : ''}" onclick="applyFilter('vaporwave')">🌊 Vaporwave</button>
                    <button class="dsp-btn ${currentFilter === 'spatial_8d' ? 'active' : ''}" onclick="applyFilter('spatial_8d')">🎧 8D Audio</button>
                    <button class="dsp-btn ${currentFilter === 'karaoke' ? 'active' : ''}" onclick="applyFilter('karaoke')">🎤 Karaoke</button>
                    <button class="dsp-btn ${currentFilter === 'bassboost_medium' ? 'active' : ''}" onclick="applyFilter('bassboost_medium')">🔊 Bass Boost</button>
                    <button class="dsp-btn ${currentFilter === 'bassboost_extreme' ? 'active' : ''}" onclick="applyFilter('bassboost_extreme')">💥 Extreme Bass</button>
                    <button class="dsp-btn ${currentFilter === 'treble_boost' ? 'active' : ''}" onclick="applyFilter('treble_boost')">🎻 Treble Boost</button>
                    <button class="dsp-btn ${currentFilter === 'pop' ? 'active' : ''}" onclick="applyFilter('pop')">🎸 Pop / Rock EQ</button>
                </div>
            </div>

            <!-- Right Column: Live Queue & Drag-and-Drop Management -->
            <div class="card queue-box">
                <div class="queue-header">
                    <div>
                        <h3 style="font-size: 16px; font-weight: 800; color: #fff;">📑 Live Queue</h3>
                        <p style="font-size: 12px; color: var(--text-muted);"><span id="queueCount">${queue ? queue.queue.length : 0}</span> tracks waiting • Drag to reorder</p>
                    </div>
                    <button class="btn-action" style="background: rgba(239,68,68,0.15); color: #fca5a5; font-size: 12px;" onclick="sendAction('clear')">Clear Queue</button>
                </div>

                <!-- Add to Queue Input -->
                <div class="search-add-bar">
                    <input type="text" id="addTrackInput" class="search-input" placeholder="🔍 Search track or paste YouTube URL..." onkeydown="if(event.key === 'Enter') addTrack()">
                    <button class="btn-action btn-chat" onclick="addTrack()">+ Queue</button>
                </div>

                <div class="queue-items" id="queueList">
                    ${queueListHtml}
                </div>
            </div>
        </div>

        <!-- Lyrics & Listening Analytics Section -->
        <div class="card">
            <div class="tab-bar">
                <button class="tab-btn active" id="tabBtnLyrics" onclick="switchTab('lyrics')">📜 Live Synced Lyrics</button>
                <button class="tab-btn" id="tabBtnHistory" onclick="switchTab('history')">📊 Listening History & Analytics</button>
            </div>

            <div id="tabContentLyrics">
                <div class="lyrics-box" id="lyricsContainer">
                    <div style="text-align: center; color: var(--text-muted); padding: 30px;">Loading lyrics from LRCLIB...</div>
                </div>
            </div>

            <div id="tabContentHistory" style="display: none;">
                <div class="history-list">
                    ${historyListHtml}
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentElapsed = ${elapsedSeconds};
        let totalDuration = ${trackSeconds};
        let isPlaying = ${isPlaying ? 'true' : 'false'};
        let isPaused = ${isPaused ? 'true' : 'false'};
        let activeTab = 'lyrics';
        let lyricsData = [];

        // Waveform Animation Canvas
        const canvas = document.getElementById('waveformCanvas');
        const ctx = canvas.getContext('2d');
        function resizeCanvas() {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let wavePhase = 0;
        function renderWaveform() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const numBars = 48;
            const barWidth = canvas.width / numBars - 2;
            const centerY = canvas.height / 2;

            for (let i = 0; i < numBars; i++) {
                const amp = isPlaying && !isPaused ? Math.sin(wavePhase + i * 0.25) * 0.5 + 0.5 : 0.05;
                const barHeight = Math.max(4, amp * (canvas.height * 0.75));
                const x = i * (barWidth + 2);
                const y = centerY - barHeight / 2;

                const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
                grad.addColorStop(0, '#2ECC71');
                grad.addColorStop(1, '#3498DB');
                ctx.fillStyle = grad;
                ctx.fillRect(x, y, barWidth, barHeight);
            }
            if (isPlaying && !isPaused) wavePhase += 0.08;
            requestAnimationFrame(renderWaveform);
        }
        requestAnimationFrame(renderWaveform);

        // Timer Increment
        setInterval(() => {
            if (isPlaying && !isPaused) {
                currentElapsed++;
                const pct = Math.min(100, (currentElapsed / Math.max(1, totalDuration)) * 100);
                document.getElementById('progressFill').style.width = pct + '%';
                document.getElementById('timeElapsed').innerText = formatSecs(currentElapsed);
                updateLiveLyrics(currentElapsed);
            }
        }, 1000);

        // Live Auto-Sync: Poll state every 2.5 seconds to synchronize multiple listeners seamlessly
        let lastTrackTitle = '${trackTitle}';
        setInterval(async () => {
            try {
                const res = await fetch('/api/music/state');
                if (!res.ok) return;
                const state = await res.json();
                
                // Resync local playback position with bot's accurate server clock
                if (state.elapsedSeconds !== undefined) {
                    currentElapsed = state.elapsedSeconds;
                }
                if (state.trackSeconds !== undefined) {
                    totalDuration = state.trackSeconds;
                }
                isPlaying = state.isPlaying;
                isPaused = state.isPaused;

                // If track changed by someone else, smoothly reload view and lyrics
                const newTitle = state.currentTrack ? state.currentTrack.title : 'Nothing Playing';
                if (newTitle !== lastTrackTitle) {
                    lastTrackTitle = newTitle;
                    location.reload();
                    return;
                }

                const pct = Math.min(100, (currentElapsed / Math.max(1, totalDuration)) * 100);
                document.getElementById('progressFill').style.width = pct + '%';
                document.getElementById('timeElapsed').innerText = formatSecs(currentElapsed);
                updateLiveLyrics(currentElapsed);
            } catch (_) {}
        }, 2500);

        function formatSecs(sec) {
            const s = Math.floor(sec) || 0;
            const mins = Math.floor(s / 60);
            const rem = s % 60;
            return mins + ':' + rem.toString().padStart(2, '0');
        }

        async function sendAction(action) {
            try {
                const res = await fetch('/api/music/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });
                const data = await res.json();
                if (data.success) location.reload();
            } catch (e) { alert(e.message); }
        }

        async function changeVolume(val) {
            document.getElementById('volDisplay').innerText = val + '%';
            await fetch('/api/music/volume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volume: parseInt(val, 10) })
            });
        }

        async function changeSpeed(val) {
            document.getElementById('speedDisplay').innerText = val + 'x';
            await fetch('/api/music/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speed: parseFloat(val) })
            });
        }

        async function applyFilter(filterName) {
            await fetch('/api/music/filter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: filterName })
            });
            location.reload();
        }

        async function toggleLoop() {
            const nextMode = '${currentLoop}' === 'off' ? 'track' : ('${currentLoop}' === 'track' ? 'queue' : 'off');
            await fetch('/api/music/loop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: nextMode })
            });
            location.reload();
        }

        async function addTrack() {
            const query = document.getElementById('addTrackInput').value.trim();
            if (!query) return;
            try {
                const res = await fetch('/api/music/queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('addTrackInput').value = '';
                    location.reload();
                } else {
                    alert('❌ ' + (data.error || 'Failed to add track'));
                }
            } catch (e) { alert(e.message); }
        }

        async function quickPlay(url) {
            await fetch('/api/music/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: url })
            });
            location.reload();
        }

        async function deleteQueueTrack(index) {
            await fetch('/api/music/queue/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ index })
            });
            location.reload();
        }

        async function switchVoiceChannel() {
            const channelId = document.getElementById('vcSelect').value;
            if (!channelId) return;
            await fetch('/api/music/channel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId })
            });
            location.reload();
        }

        // Drag & Drop Queue Reordering
        let dragSrcIdx = null;
        function handleDragStart(e) {
            dragSrcIdx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            e.dataTransfer.effectAllowed = 'move';
        }
        function handleDragOver(e) {
            if (e.preventDefault) e.preventDefault();
            return false;
        }
        async function handleDrop(e) {
            if (e.stopPropagation) e.stopPropagation();
            const targetIdx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
            if (dragSrcIdx !== null && dragSrcIdx !== targetIdx) {
                await fetch('/api/music/queue/reorder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ from: dragSrcIdx, to: targetIdx })
                });
                location.reload();
            }
            return false;
        }

        function switchTab(tab) {
            activeTab = tab;
            document.getElementById('tabBtnLyrics').classList.toggle('active', tab === 'lyrics');
            document.getElementById('tabBtnHistory').classList.toggle('active', tab === 'history');
            document.getElementById('tabContentLyrics').style.display = tab === 'lyrics' ? 'block' : 'none';
            document.getElementById('tabContentHistory').style.display = tab === 'history' ? 'block' : 'none';
        }

        // Load synced lyrics
        async function loadLyrics() {
            const container = document.getElementById('lyricsContainer');
            try {
                const res = await fetch('/api/music/lyrics');
                const data = await res.json();
                if (data.syncedLyrics && data.syncedLyrics.length > 0) {
                    lyricsData = data.syncedLyrics;
                    container.innerHTML = lyricsData.map((l, i) => \`
                        <div class="lyric-line" id="lyric-\${i}">[\${formatSecs(l.time)}] \${l.text || '♪'}</div>
                    \`).join('');
                } else if (data.plainLyrics) {
                    container.innerHTML = '<div style="white-space: pre-line; color: #cbd5e1;">' + data.plainLyrics + '</div>';
                } else {
                    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">No synchronized lyrics found for this song.</div>';
                }
            } catch (_) {}
        }
        loadLyrics();

        function updateLiveLyrics(sec) {
            if (!lyricsData || lyricsData.length === 0) return;
            let activeIdx = 0;
            for (let i = 0; i < lyricsData.length; i++) {
                if (sec >= lyricsData[i].time) activeIdx = i;
                else break;
            }
            document.querySelectorAll('.lyric-line').forEach((el, idx) => {
                if (idx === activeIdx) {
                    el.classList.add('active');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    el.classList.remove('active');
                }
            });
        }
    </script>
</body>
</html>`;
}

function formatSecs(sec) {
    const s = Math.floor(sec) || 0;
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem.toString().padStart(2, '0')}`;
}

module.exports = {
    renderMusicDashboard
};
