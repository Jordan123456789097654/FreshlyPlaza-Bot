/**
 * Live Music Command Center.
 *
 * The page is a static shell: it never embeds per-request data and never reloads.
 * All state comes from GET /api/music/state (polled), so every viewer always sees
 * the same, current picture and one person's action can't leave another's page stale.
 *
 * NOTE: the client script below must not contain backticks or "${" because the whole
 * page is a String.raw template. It uses plain string concatenation instead.
 */
function renderMusicDashboard() {
    return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Music Command Center</title>
<style>
:root {
    --bg: #080c16; --card: rgba(18,24,41,0.85); --border: rgba(255,255,255,0.08);
    --text: #f1f5f9; --muted: #8b9ab3; --green: #2ecc71; --blue: #3b82f6; --red: #ef4444;
}
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
body { background: var(--bg); color: var(--text); min-height: 100vh; padding: 20px;
    background-image: radial-gradient(circle at 15% 0%, rgba(46,204,113,0.10), transparent 40%), radial-gradient(circle at 90% 100%, rgba(59,130,246,0.10), transparent 40%); }
.wrap { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.top h1 { font-size: 24px; font-weight: 800; }
.top p { color: var(--muted); font-size: 13px; margin-top: 2px; }
.badge { font-size: 11px; font-weight: 800; padding: 5px 10px; border-radius: 999px; letter-spacing: .5px; }
.badge.live { background: rgba(46,204,113,.15); color: #86efac; }
.badge.off { background: rgba(239,68,68,.15); color: #fca5a5; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 20px; backdrop-filter: blur(10px); }
.vc { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
select, input[type=text] { background: #0a1020; border: 1px solid var(--border); color: #fff; border-radius: 10px; padding: 10px 12px; font-size: 13px; outline: none; }
input[type=text]:focus, select:focus { border-color: var(--green); }
button { font-family: inherit; cursor: pointer; }
.btn { background: rgba(255,255,255,.07); border: 1px solid var(--border); color: #fff; padding: 9px 14px; border-radius: 10px; font-weight: 700; font-size: 12px; transition: .15s; }
.btn:hover { background: rgba(255,255,255,.14); }
.btn.primary { background: var(--blue); border-color: var(--blue); }
.btn.danger { background: rgba(239,68,68,.15); color: #fca5a5; border-color: rgba(239,68,68,.3); }
.avatars { display: flex; align-items: center; }
.avatars img { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #0f172a; margin-left: -7px; }
.avatars img:first-child { margin-left: 0; }
.grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 16px; }
@media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }
.np { display: flex; gap: 18px; align-items: center; }
.art { width: 120px; height: 120px; border-radius: 14px; object-fit: cover; background: #0a1020; flex-shrink: 0; }
.np-info { min-width: 0; }
.state { font-size: 11px; font-weight: 800; color: var(--green); letter-spacing: 1px; }
.title { font-size: 22px; font-weight: 800; margin: 4px 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.artist { color: var(--muted); font-size: 14px; }
.req { color: #60a5fa; font-size: 12px; margin-top: 6px; }
.viz { position: relative; height: 90px; margin: 16px 0 6px; background: rgba(0,0,0,.25); border-radius: 12px; overflow: hidden; }
.viz canvas { width: 100%; height: 100%; display: block; }
.viz button { position: absolute; top: 6px; right: 6px; font-size: 10px; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--border); background: rgba(8,12,22,.8); color: #cbd5e1; }
.bar { height: 10px; background: rgba(255,255,255,.1); border-radius: 999px; cursor: pointer; position: relative; margin-top: 10px; }
.fill { height: 100%; width: 0; background: linear-gradient(90deg, var(--green), var(--blue)); border-radius: 999px; pointer-events: none; }
.times { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-top: 6px; font-variant-numeric: tabular-nums; }
.ctrls { display: flex; justify-content: center; gap: 12px; margin: 14px 0; }
.ctrl { width: 46px; height: 46px; border-radius: 50%; border: 1px solid var(--border); background: rgba(255,255,255,.07); color: #fff; font-size: 18px; }
.ctrl:hover { background: rgba(255,255,255,.16); }
.ctrl.big { width: 58px; height: 58px; background: var(--green); border-color: var(--green); color: #052e16; font-size: 22px; }
.slider { display: flex; align-items: center; gap: 12px; margin-top: 10px; font-size: 13px; }
.slider span { width: 120px; color: #cbd5e1; }
.slider input { flex: 1; accent-color: var(--green); }
.dsp { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.dsp button { background: rgba(255,255,255,.04); border: 1px solid var(--border); color: #cbd5e1; padding: 9px 6px; border-radius: 10px; font-size: 12px; font-weight: 700; }
.dsp button.on, .dsp button:hover { background: rgba(46,204,113,.2); border-color: var(--green); color: #86efac; }
h3 { font-size: 15px; font-weight: 800; }
.sub { font-size: 12px; color: var(--muted); }
.qhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.search { position: relative; display: flex; gap: 8px; margin-bottom: 12px; }
.search input { flex: 1; }
.drop { position: absolute; top: 100%; left: 0; right: 0; margin-top: 6px; background: #0f172a; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; z-index: 50; max-height: 300px; overflow-y: auto; display: none; box-shadow: 0 10px 30px rgba(0,0,0,.6); }
.drop-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,.04); }
.drop-item:hover { background: rgba(46,204,113,.15); }
.drop-item img { width: 48px; height: 36px; border-radius: 6px; object-fit: cover; }
.grow { flex: 1; min-width: 0; }
.t1 { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t2 { font-size: 11px; color: var(--muted); margin-top: 2px; }
.list { display: flex; flex-direction: column; gap: 8px; max-height: 470px; overflow-y: auto; }
.item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: 12px; }
.item.q { cursor: grab; }
.item.over { border-color: var(--green); background: rgba(46,204,113,.1); }
.item img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; }
.idx { font-size: 12px; color: var(--muted); width: 22px; font-weight: 700; }
.x { background: none; border: none; color: var(--red); font-size: 15px; opacity: .7; }
.x:hover { opacity: 1; }
.empty { text-align: center; color: var(--muted); font-size: 13px; padding: 30px 10px; }
.tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.tab { background: none; border: 1px solid var(--border); color: var(--muted); padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 12px; }
.tab.on { background: rgba(59,130,246,.2); color: #93c5fd; border-color: var(--blue); }
.lyrics { position: relative; height: 340px; overflow-y: auto; padding: 8px 4px; scroll-behavior: smooth; }
.ly { padding: 6px 10px; border-radius: 8px; color: #64748b; font-size: 17px; font-weight: 700; cursor: pointer; transition: .2s; }
.ly:hover { color: #cbd5e1; }
.ly.on { color: #fff; background: rgba(46,204,113,.15); font-size: 20px; }
.plain { white-space: pre-line; color: #cbd5e1; line-height: 1.8; font-size: 15px; }
#toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: #1e293b; border: 1px solid var(--border); padding: 11px 18px; border-radius: 12px; font-size: 13px; opacity: 0; pointer-events: none; transition: .25s; z-index: 99; }
#toast.show { opacity: 1; }
</style>
</head>
<body>
<div class="wrap">
    <div class="top">
        <div>
            <h1>🎵 Music Command Center</h1>
            <p>Live view &mdash; updates automatically for everyone watching</p>
        </div>
        <span id="conn" class="badge off">CONNECTING…</span>
    </div>

    <div class="card vc">
        <div class="row">
            <strong>🔊 Voice channel:</strong>
            <span id="vcName" style="color:#60a5fa;font-weight:700">Disconnected</span>
            <div id="listeners" class="avatars"></div>
            <span id="listenersCount" class="sub"></span>
        </div>
        <div class="row">
            <select id="vcSelect"></select>
            <button class="btn primary" id="vcMove">Move bot here</button>
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <div class="np">
                <img id="art" class="art" alt="">
                <div class="np-info">
                    <div id="state" class="state">IDLE</div>
                    <div id="title" class="title">Nothing playing</div>
                    <div id="artist" class="artist">Search a song or paste a link to start</div>
                    <div id="req" class="req"></div>
                </div>
            </div>

            <div class="viz"><canvas id="cv"></canvas><button id="theme">🎨 BARS</button></div>

            <div class="bar" id="bar"><div class="fill" id="fill"></div></div>
            <div class="times"><span id="tNow">0:00</span><span id="tTotal">0:00</span></div>

            <div class="ctrls">
                <button class="ctrl" id="bShuffle" title="Shuffle queue">🔀</button>
                <button class="ctrl" id="bPrev" title="Previous track">⏮️</button>
                <button class="ctrl big" id="bPlay" title="Play / Pause">⏸️</button>
                <button class="ctrl" id="bSkip" title="Skip">⏭️</button>
                <button class="ctrl" id="bStop" title="Stop">⏹️</button>
                <button class="ctrl" id="bLoop" title="Loop mode">➡️</button>
                <button class="ctrl" id="bAuto" title="Autoplay Radio when queue ends">📻</button>
            </div>

            <div class="slider"><span>🔊 Volume: <b id="volLbl">100%</b></span><input type="range" id="vol" min="1" max="200" value="100"></div>
            <div class="slider"><span>⚡ Speed: <b id="spLbl">1x</b></span><input type="range" id="sp" min="0.5" max="2" step="0.05" value="1"></div>

            <h3 style="margin-top:20px">🎛️ Sound presets</h3>
            <div class="dsp" id="dsp"></div>
        </div>

        <div class="card">
            <div class="qhead">
                <div><h3>📑 Queue</h3><div class="sub"><span id="qCount">0</span> waiting &bull; drag to reorder</div></div>
                <button class="btn danger" id="bClear">Clear</button>
            </div>
            <div class="search">
                <input type="text" id="q" placeholder="🔍 Search a song or paste a YouTube link…" autocomplete="off">
                <button class="btn primary" id="qAdd">+ Add</button>
                <div class="drop" id="drop"></div>
            </div>
            <div class="list" id="queue"></div>
        </div>
    </div>

    <div class="card">
        <div class="tabs">
            <button class="tab on" id="tabLy">📜 Lyrics</button>
            <button class="tab" id="tabHi">🕒 History</button>
        </div>
        <div id="paneLy"><div class="lyrics" id="lyrics"><div class="empty">Nothing playing</div></div></div>
        <div id="paneHi" style="display:none"><div class="list" id="history"></div></div>
    </div>
</div>
<div id="toast"></div>

<script>
(function () {
    var PRESETS = [
        ['none', 'Clean'], ['8d', '🎧 8D Ping-Pong'], ['pingpong_fast', '🏓 Fast Ping-Pong'],
        ['lofi', '📻 Lo-Fi Radio'], ['nightcore', '✨ Nightcore'], ['vaporwave', '🌊 Vaporwave'],
        ['tremolo', '〰️ Pulse Wave'], ['karaoke', '🎤 Karaoke'], ['bassboost_low', '🔈 Bass low'],
        ['bassboost_medium', '🔊 Bass boost'], ['bassboost_extreme', '💥 Extreme bass'],
        ['treble_boost', '🎻 Treble'], ['pop', '🎸 Pop'], ['rock', '🤘 Rock']
    ];
    var LOOP_ICON = { off: '➡️', track: '🔂', queue: '🔁' };
    var THEMES = ['bars', 'circle', 'pulse'];

    var S = null;                       // latest server state
    var base = { elapsed: 0, at: Date.now() };
    var trackKey = '';
    var lyr = { lines: [], plain: null, loaded: false, askedAt: 0, active: -1 };
    var sig = { queue: '', history: '', vc: '', listeners: '', now: '' };
    var dragFrom = null;
    var theme = 0;
    var failCount = 0;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmt(sec) {
        sec = Math.max(0, Math.floor(sec) || 0);
        var m = Math.floor(sec / 60), s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }
    function toast(msg) {
        var t = $('toast');
        t.textContent = msg;
        t.className = 'show';
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { t.className = ''; }, 2800);
    }
    function post(path, body) {
        return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .catch(function () { return { error: 'Network error' }; });
    }
    function act(action, extra) {
        return post('/api/music/control', Object.assign({ action: action }, extra || {})).then(function (r) {
            if (r && r.error) toast(r.error);
            refresh();
            return r;
        });
    }

    /* ---------- state ---------- */
    function refresh() {
        return fetch('/api/music/state', { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
            .then(function (s) { failCount = 0; apply(s); })
            .catch(function () {
                failCount++;
                if (failCount >= 2) { $('conn').className = 'badge off'; $('conn').textContent = 'RECONNECTING…'; }
            });
    }

    function apply(s) {
        S = s;
        base = { elapsed: s.elapsed || 0, at: Date.now() };

        var conn = $('conn');
        conn.className = 'badge ' + (s.connected ? 'live' : 'off');
        conn.textContent = s.connected ? ('LIVE' + (s.activeNode ? ' • ' + s.activeNode : '')) : 'BOT NOT IN VOICE';

        var autoBtn = $('bAuto');
        if (autoBtn) {
            autoBtn.style.borderColor = s.autoplay ? 'var(--green)' : '';
            autoBtn.style.background = s.autoplay ? 'rgba(46,204,113,.22)' : '';
        }

        var cur = s.current;
        var key = cur ? cur.url : '';
        var nowSig = key + '|' + s.isPaused;
        if (nowSig !== sig.now) {
            sig.now = nowSig;
            $('state').textContent = cur ? (s.isPaused ? '⏸ PAUSED' : '▶ NOW PLAYING') : 'IDLE';
            $('bPlay').textContent = s.isPaused ? '▶️' : '⏸️';
        }
        if (key !== trackKey) {
            trackKey = key;
            $('title').textContent = cur ? cur.title : 'Nothing playing';
            $('artist').textContent = cur ? (cur.author || 'Unknown') : 'Search a song or paste a link to start';
            $('req').textContent = cur && cur.requester ? 'Requested by ' + cur.requester : '';
            var artEl = $('art');
            if (cur && cur.thumbnail) {
                artEl.src = cur.thumbnail;
                artEl.style.visibility = 'visible';
            } else {
                artEl.removeAttribute('src');
                artEl.style.visibility = 'hidden';
            }
            $('tTotal').textContent = cur ? (cur.duration || fmt(cur.seconds)) : '0:00';
            resetLyrics();
        }

        $('bLoop').textContent = LOOP_ICON[s.loop] || LOOP_ICON.off;

        if (document.activeElement !== $('vol')) { $('vol').value = s.volume; $('volLbl').textContent = s.volume + '%'; }
        if (document.activeElement !== $('sp')) { $('sp').value = s.speed; $('spLbl').textContent = s.speed + 'x'; }

        var btns = $('dsp').children;
        for (var i = 0; i < btns.length; i++) {
            btns[i].className = btns[i].getAttribute('data-f') === s.filter ? 'on' : '';
        }

        renderVoice(s);
        renderQueue(s);
        renderHistory(s);

        if (cur) {
            if (s.hasLyrics && !lyr.loaded) {
                loadLyrics();
            } else if (!s.hasLyrics && !s.lyricsLoading && !lyr.loaded) {
                $('lyrics').innerHTML = '<div class="empty">No synchronized or plain lyrics found for this song.</div>';
            }
        }
    }

    /* ---------- voice ---------- */
    function renderVoice(s) {
        $('vcName').textContent = s.voiceChannelName && s.connected ? s.voiceChannelName : 'Disconnected';
        var vsig = JSON.stringify(s.voiceChannels) + '|' + s.voiceChannelId;
        var sel = $('vcSelect');
        if (vsig !== sig.vc && document.activeElement !== sel) {
            sig.vc = vsig;
            var html = '';
            s.voiceChannels.forEach(function (c) {
                html += '<option value="' + esc(c.id) + '"' + (c.id === s.voiceChannelId ? ' selected' : '') + '>🔊 ' + esc(c.name) + ' (' + c.count + ')</option>';
            });
            sel.innerHTML = html || '<option value="">No voice channels</option>';
        }
        var lsig = s.listeners.map(function (l) { return l.id; }).join(',');
        if (lsig !== sig.listeners) {
            sig.listeners = lsig;
            var h = '';
            s.listeners.slice(0, 6).forEach(function (l) { h += '<img src="' + esc(l.avatar) + '" title="' + esc(l.name) + '" alt="">'; });
            $('listeners').innerHTML = h;
            $('listenersCount').textContent = s.listeners.length ? s.listeners.length + ' listening' : '';
        }
    }

    /* ---------- queue ---------- */
    function renderQueue(s) {
        $('qCount').textContent = s.queue.length;
        if (dragFrom !== null) return; // never rebuild the list mid-drag
        var qsig = s.queue.map(function (t) { return t.url; }).join('|');
        if (qsig === sig.queue) return;
        sig.queue = qsig;
        if (!s.queue.length) { $('queue').innerHTML = '<div class="empty">☕ Queue is empty. Add something above.</div>'; return; }
        var h = '';
        s.queue.forEach(function (t, i) {
            h += '<div class="item q" draggable="true" data-i="' + i + '" data-url="' + esc(t.url) + '">' +
                '<span class="idx">' + (i + 1) + '</span>' +
                '<img src="' + esc(t.thumbnail || '') + '" alt="">' +
                '<div class="grow"><div class="t1">' + esc(t.title) + '</div>' +
                '<div class="t2">' + esc(t.author) + ' • ' + esc(t.duration) + (t.requester ? ' • 👤 ' + esc(t.requester) : '') + '</div></div>' +
                '<button class="x" data-del="' + i + '" data-url="' + esc(t.url) + '" title="Remove">🗑️</button></div>';
        });
        $('queue').innerHTML = h;
    }

    function renderHistory(s) {
        var hsig = s.history.map(function (t) { return t.url + t.playedAt; }).join('|');
        if (hsig === sig.history) return;
        sig.history = hsig;
        if (!s.history.length) { $('history').innerHTML = '<div class="empty">Nothing played yet this session.</div>'; return; }
        var h = '';
        s.history.forEach(function (t) {
            h += '<div class="item"><img src="' + esc(t.thumbnail || '') + '" alt="">' +
                '<div class="grow"><div class="t1">' + esc(t.title) + '</div><div class="t2">' + esc(t.author) + '</div></div>' +
                '<button class="btn" data-replay="' + esc(t.url) + '">▶ Replay</button></div>';
        });
        $('history').innerHTML = h;
    }

    /* ---------- lyrics ---------- */
    function resetLyrics() {
        lyr = { lines: [], plain: null, loaded: false, askedAt: Date.now(), active: -1 };
        $('lyrics').innerHTML = '<div class="empty">' + (trackKey ? 'Searching for lyrics…' : 'Nothing playing') + '</div>';
        $('lyrics').scrollTop = 0;
    }
    function loadLyrics() {
        lyr.loaded = true;
        var forKey = trackKey;
        fetch('/api/music/lyrics', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
            if (forKey !== trackKey) return; // track changed while loading
            var box = $('lyrics');
            var hdr = (d.trackName || d.artistName)
                ? '<div class="sub" style="padding:4px 10px 10px;color:#93c5fd;font-weight:700">🎵 Matched: ' + esc(d.trackName || '') + (d.artistName ? ' — ' + esc(d.artistName) : '') + '</div>'
                : '';
            if (d.syncedLyrics && d.syncedLyrics.length) {
                lyr.lines = d.syncedLyrics;
                var h = hdr;
                d.syncedLyrics.forEach(function (l, i) {
                    h += '<div class="ly" data-t="' + l.time + '" id="ly' + i + '">' + (l.text ? esc(l.text) : '♪') + '</div>';
                });
                box.innerHTML = h;
            } else if (d.plainLyrics) {
                lyr.plain = d.plainLyrics;
                box.innerHTML = hdr + '<div class="plain">' + esc(d.plainLyrics) + '</div>';
            } else {
                lyr.loaded = false;
            }
        }).catch(function () { lyr.loaded = false; });
    }
    function highlightLyric(sec) {
        if (!lyr.lines.length) return;
        var idx = -1;
        for (var i = 0; i < lyr.lines.length; i++) {
            if (sec + 0.25 >= lyr.lines[i].time) idx = i;
            else break;
        }
        if (idx === lyr.active) return;
        var box = $('lyrics');
        var old = $('ly' + lyr.active);
        if (old) old.className = 'ly';
        if (idx >= 0) {
            var el = $('ly' + idx);
            if (el) {
                el.className = 'ly on';
                // scroll inside the lyrics box only (box has position:relative)
                box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2);
            }
        }
        lyr.active = idx;
    }

    /* ---------- progress ticker ---------- */
    function currentElapsed() {
        if (!S || !S.current) return 0;
        var e = base.elapsed;
        if (!S.isPaused) e += ((Date.now() - base.at) / 1000) * (S.speed || 1);
        var max = S.current.seconds || 0;
        return max ? Math.min(e, max) : e;
    }
    setInterval(function () {
        var e = currentElapsed();
        var total = S && S.current ? (S.current.seconds || 1) : 1;
        $('fill').style.width = Math.min(100, (e / total) * 100) + '%';
        $('tNow').textContent = fmt(e);
        highlightLyric(e);
        // lyrics may legitimately not exist: stop saying "searching" after a while
        if (S && S.current && !lyr.loaded && !S.hasLyrics && Date.now() - lyr.askedAt > 12000) {
            var box = $('lyrics');
            if (box.textContent.indexOf('Searching') === 0) box.innerHTML = '<div class="empty">No lyrics found for this song.</div>';
        }
    }, 250);

    /* ---------- visualizer ---------- */
    var cv = $('cv'), ctx = cv.getContext('2d'), phase = 0;
    function fit() { cv.width = cv.parentElement.clientWidth; cv.height = cv.parentElement.clientHeight; }
    window.addEventListener('resize', fit); fit();
    function draw() {
        var w = cv.width, h = cv.height, cx = w / 2, cy = h / 2;
        var live = S && S.current && !S.isPaused;
        ctx.clearRect(0, 0, w, h);
        var t = THEMES[theme];
        if (t === 'circle') {
            var r0 = Math.min(w, h) * 0.3;
            ctx.beginPath();
            for (var i = 0; i <= 64; i++) {
                var a = (i / 64) * Math.PI * 2;
                var r = r0 + (live ? Math.sin(phase * 1.5 + i * 0.4) * 10 : 1);
                var px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3; ctx.stroke();
        } else if (t === 'pulse') {
            for (var k = 1; k <= 4; k++) {
                var rr = (k * 18 + (phase * 14) % 70);
                ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(46,204,113,' + Math.max(0, 1 - rr / 110) + ')';
                ctx.lineWidth = 2; ctx.stroke();
            }
        } else {
            var n = 56, bw = w / n - 2;
            for (var j = 0; j < n; j++) {
                var amp = live ? Math.sin(phase + j * 0.28) * 0.5 + 0.5 : 0.06;
                var bh = Math.max(3, amp * h * 0.8);
                var g = ctx.createLinearGradient(0, cy - bh / 2, 0, cy + bh / 2);
                g.addColorStop(0, '#2ecc71'); g.addColorStop(1, '#3b82f6');
                ctx.fillStyle = g; ctx.fillRect(j * (bw + 2), cy - bh / 2, bw, bh);
            }
        }
        if (live) phase += 0.08;
        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    $('theme').onclick = function () { theme = (theme + 1) % THEMES.length; this.textContent = '🎨 ' + THEMES[theme].toUpperCase(); };

    /* ---------- controls ---------- */
    PRESETS.forEach(function (p) {
        var b = document.createElement('button');
        b.textContent = p[1]; b.setAttribute('data-f', p[0]);
        b.onclick = function () { post('/api/music/filter', { filter: p[0] }).then(refresh); };
        $('dsp').appendChild(b);
    });

    $('bPlay').onclick = function () {
        if (S) { S.isPaused = !S.isPaused; $('bPlay').textContent = S.isPaused ? '▶️' : '⏸️'; base = { elapsed: currentElapsed(), at: Date.now() }; }
        act('toggle_pause');
    };
    $('bPrev').onclick = function () { act('previous'); };
    $('bSkip').onclick = function () { act('skip'); };
    $('bStop').onclick = function () { act('stop'); };
    $('bShuffle').onclick = function () { act('shuffle'); };
    $('bAuto').onclick = function () { act('autoplay').then(function () { toast(S && !S.autoplay ? '📻 Autoplay Radio ON' : '📻 Autoplay Radio OFF'); }); };
    $('bClear').onclick = function () { act('clear'); };
    $('bLoop').onclick = function () {
        var cur = S ? S.loop : 'off';
        post('/api/music/loop', { mode: cur === 'off' ? 'track' : (cur === 'track' ? 'queue' : 'off') }).then(refresh);
    };
    $('vol').oninput = function () { $('volLbl').textContent = this.value + '%'; };
    $('vol').onchange = function () { post('/api/music/volume', { volume: parseInt(this.value, 10) }).then(refresh); };
    $('sp').oninput = function () { $('spLbl').textContent = this.value + 'x'; };
    $('sp').onchange = function () { post('/api/music/filter', { speed: parseFloat(this.value) }).then(refresh); };

    $('bar').onclick = function (ev) {
        if (!S || !S.current) return;
        var rect = this.getBoundingClientRect();
        var ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        var sec = Math.floor(ratio * (S.current.seconds || 0));
        base = { elapsed: sec, at: Date.now() };
        act('seek', { seconds: sec });
    };

    $('vcMove').onclick = function () {
        var id = $('vcSelect').value;
        if (!id) return;
        post('/api/music/channel', { channelId: id }).then(function (r) { if (r && r.error) toast(r.error); refresh(); });
    };

    $('tabLy').onclick = function () { tab('Ly'); };
    $('tabHi').onclick = function () { tab('Hi'); };
    function tab(which) {
        $('paneLy').style.display = which === 'Ly' ? 'block' : 'none';
        $('paneHi').style.display = which === 'Hi' ? 'block' : 'none';
        $('tabLy').className = 'tab' + (which === 'Ly' ? ' on' : '');
        $('tabHi').className = 'tab' + (which === 'Hi' ? ' on' : '');
    }

    /* ---------- queue interactions (event delegation) ---------- */
    var busyAdd = false;
    function addToQueue(query) {
        if (!query || busyAdd) return;
        busyAdd = true;
        $('qAdd').disabled = true;
        toast('⏳ Loading track…');
        post('/api/music/queue', { query: query }).then(function (r) {
            busyAdd = false;
            $('qAdd').disabled = false;
            toast(r && r.error ? ('❌ ' + r.error) : '✅ Added to queue');
            refresh();
        });
    }
    $('qAdd').onclick = function () { var v = $('q').value.trim(); $('q').value = ''; $('drop').style.display = 'none'; addToQueue(v); };
    $('q').onkeydown = function (e) { if (e.key === 'Enter') $('qAdd').onclick(); };

    var searchTimer = null, searchSeq = 0;
    $('q').oninput = function () {
        var v = this.value.trim();
        clearTimeout(searchTimer);
        if (v.length < 2 || /^https?:/i.test(v)) { $('drop').style.display = 'none'; return; }
        searchTimer = setTimeout(function () {
            var seq = ++searchSeq;
            fetch('/api/music/search?q=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (res) {
                if (seq !== searchSeq || !Array.isArray(res) || !res.length) { if (seq === searchSeq) $('drop').style.display = 'none'; return; }
                var h = '';
                res.forEach(function (x) {
                    h += '<div class="drop-item" data-add="' + esc(x.url) + '"><img src="' + esc(x.thumbnail || '') + '" alt="">' +
                        '<div class="grow"><div class="t1">' + esc(x.title) + '</div><div class="t2">' + esc(x.author) + ' • ' + esc(x.duration) + '</div></div>' +
                        '<span class="t2" style="color:#34d399;font-weight:700">+ Queue</span></div>';
                });
                $('drop').innerHTML = h; $('drop').style.display = 'block';
            }).catch(function () {});
        }, 300);
    };
    document.addEventListener('click', function (e) {
        var t = e.target;
        var add = t.closest ? t.closest('[data-add]') : null;
        if (add) { $('drop').style.display = 'none'; $('q').value = ''; addToQueue(add.getAttribute('data-add')); return; }
        if (!(t.closest && t.closest('.search'))) $('drop').style.display = 'none';

        var del = t.closest ? t.closest('[data-del]') : null;
        if (del) {
            post('/api/music/queue/delete', { index: parseInt(del.getAttribute('data-del'), 10), url: del.getAttribute('data-url') }).then(function () { sig.queue = ''; refresh(); });
            return;
        }
        var rep = t.closest ? t.closest('[data-replay]') : null;
        if (rep) { addToQueue(rep.getAttribute('data-replay')); return; }
        var ly = t.closest ? t.closest('.ly') : null;
        if (ly) {
            var sec = Math.floor(parseFloat(ly.getAttribute('data-t')));
            base = { elapsed: sec, at: Date.now() };
            act('seek', { seconds: sec });
        }
    });

    var qEl = $('queue');
    qEl.addEventListener('dragstart', function (e) {
        var it = e.target.closest ? e.target.closest('.item.q') : null;
        if (!it) return;
        dragFrom = parseInt(it.getAttribute('data-i'), 10);
        it.setAttribute('data-drag', '1');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch (_) {}
    });
    qEl.addEventListener('dragover', function (e) {
        if (dragFrom === null) return;
        e.preventDefault();
        var it = e.target.closest ? e.target.closest('.item.q') : null;
        Array.prototype.forEach.call(qEl.children, function (c) { c.classList.remove('over'); });
        if (it) it.classList.add('over');
    });
    qEl.addEventListener('drop', function (e) {
        e.preventDefault();
        var it = e.target.closest ? e.target.closest('.item.q') : null;
        var from = dragFrom;
        var src = qEl.querySelector('[data-drag]');
        var url = src ? src.getAttribute('data-url') : null;
        dragFrom = null;
        if (it && from !== null) {
            var to = parseInt(it.getAttribute('data-i'), 10);
            if (to !== from) { post('/api/music/queue/reorder', { from: from, to: to, url: url }).then(function () { sig.queue = ''; refresh(); }); return; }
        }
        sig.queue = ''; refresh();
    });
    qEl.addEventListener('dragend', function () { dragFrom = null; sig.queue = ''; refresh(); });

    /* ---------- go ---------- */
    refresh();
    setInterval(refresh, 1500);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();
</script>
</body>
</html>`;
}

module.exports = { renderMusicDashboard };
