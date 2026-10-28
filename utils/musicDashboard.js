/**
 * Live Music Command Center (Studio Edition).
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
<title>Grandway Studio • Live Music Command Center</title>
<style>
:root {
    --bg: #050811;
    --card: rgba(14, 20, 36, 0.78);
    --card-hi: rgba(20, 29, 52, 0.88);
    --border: rgba(255, 255, 255, 0.08);
    --border-hi: rgba(46, 204, 113, 0.35);
    --text: #f8fafc;
    --muted: #8b9bb4;
    --green: #10b981;
    --green-glow: #34d399;
    --blue: #3b82f6;
    --cyan: #06b6d4;
    --purple: #8b5cf6;
    --red: #ef4444;
    --amber: #f59e0b;
}
* { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif; }
body {
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 20px;
    overflow-x: hidden;
    position: relative;
}
#ambientBg {
    position: fixed;
    inset: -60px;
    background-size: cover;
    background-position: center;
    filter: blur(85px) saturate(1.8) brightness(0.28);
    opacity: 0.55;
    pointer-events: none;
    z-index: 0;
    transition: background-image 1.2s ease, opacity 0.8s ease;
}
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at 12% 0%, rgba(16, 185, 129, 0.14), transparent 45%),
                radial-gradient(circle at 88% 100%, rgba(59, 130, 246, 0.14), transparent 45%);
    pointer-events: none;
    z-index: 0;
}
.wrap { position: relative; z-index: 1; max-width: 1360px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-icon {
    width: 44px; height: 44px; border-radius: 13px;
    background: linear-gradient(135deg, rgba(16,185,129,0.25), rgba(59,130,246,0.25));
    border: 1px solid rgba(52,211,153,0.35);
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; box-shadow: 0 0 24px rgba(16,185,129,0.22);
}
.top h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
.top p { color: var(--muted); font-size: 12.5px; margin-top: 2px; }
.top-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.badge {
    font-size: 11px; font-weight: 800; padding: 6px 12px; border-radius: 999px;
    letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid transparent;
}
.badge.live { background: rgba(16,185,129,0.15); color: #6ee7b7; border-color: rgba(16,185,129,0.35); }
.badge.off { background: rgba(239,68,68,0.15); color: #fca5a5; border-color: rgba(239,68,68,0.35); }
.badge.meta { background: rgba(59,130,246,0.14); color: #93c5fd; border-color: rgba(59,130,246,0.3); font-weight: 700; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }

.card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 20px;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.38);
}
.vc-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding: 14px 20px; }
.row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
select, input[type=text] {
    background: rgba(7, 11, 22, 0.85);
    border: 1px solid var(--border);
    color: #fff;
    border-radius: 11px;
    padding: 10px 13px;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
}
input[type=text]:focus, select:focus {
    border-color: var(--green);
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}
button { font-family: inherit; cursor: pointer; }
.btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border);
    color: #e2e8f0;
    padding: 9px 14px;
    border-radius: 11px;
    font-weight: 700;
    font-size: 12px;
    transition: all 0.16s ease;
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.btn:hover { background: rgba(255, 255, 255, 0.13); border-color: rgba(255, 255, 255, 0.18); transform: translateY(-1px); }
.btn:active { transform: translateY(0); }
.btn.primary { background: linear-gradient(135deg, #2563eb, #3b82f6); border-color: rgba(96, 165, 250, 0.4); color: #fff; }
.btn.primary:hover { filter: brightness(1.1); }
.btn.emerald { background: linear-gradient(135deg, #059669, #10b981); border-color: rgba(52, 211, 153, 0.4); color: #fff; }
.btn.danger { background: rgba(239, 68, 68, 0.14); color: #fca5a5; border-color: rgba(239, 68, 68, 0.3); }
.btn.danger:hover { background: rgba(239, 68, 68, 0.24); }
.btn.sm { padding: 5px 10px; font-size: 11px; border-radius: 8px; }

.stations-bar {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 12px 18px;
}
.stations-lbl { font-size: 11.5px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 0.7px; margin-right: 4px; }
.station-pill {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--border);
    color: #cbd5e1;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    transition: all 0.16s ease;
}
.station-pill:hover {
    background: rgba(16, 185, 129, 0.16);
    border-color: var(--green);
    color: #6ee7b7;
    transform: translateY(-1px);
}

.avatars { display: flex; align-items: center; }
.avatars img { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #0b1120; margin-left: -7px; }
.avatars img:first-child { margin-left: 0; }

.grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
@media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }

.np { display: flex; gap: 18px; align-items: center; }
.art-wrap {
    position: relative; width: 124px; height: 124px; border-radius: 16px;
    background: #080d1a; flex-shrink: 0; overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
}
.art { width: 100%; height: 100%; object-fit: cover; display: block; }
.art-placeholder {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 38px; color: rgba(255,255,255,0.18); background: radial-gradient(circle, #111c35, #070b16);
}
.np-info { min-width: 0; flex: 1; }
.state-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.state { font-size: 11px; font-weight: 800; color: var(--green-glow); letter-spacing: 1px; text-transform: uppercase; }
.dsp-pill {
    font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px;
    background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4);
    display: none;
}
.title {
    font-size: 22px; font-weight: 800; margin: 5px 0 3px; line-height: 1.22;
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.artist { color: #cbd5e1; font-size: 14px; font-weight: 600; }
.req { color: #60a5fa; font-size: 12px; margin-top: 6px; font-weight: 600; }

.viz {
    position: relative;
    height: 136px;
    margin: 16px 0 8px;
    background: linear-gradient(180deg, rgba(4, 7, 15, 0.85), rgba(8, 14, 28, 0.92));
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: inset 0 2px 16px rgba(0, 0, 0, 0.65);
}
.viz canvas { width: 100%; height: 100%; display: block; }
.viz-hud {
    position: absolute; top: 8px; left: 10px; right: 10px;
    display: flex; justify-content: space-between; align-items: center; pointer-events: none;
}
.viz-tag {
    font-size: 10px; font-weight: 800; letter-spacing: 0.7px; color: rgba(148, 163, 184, 0.85);
    background: rgba(5, 8, 17, 0.72); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.07);
}
.viz-modes { display: flex; gap: 4px; pointer-events: auto; }
.viz-btn {
    font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 6px;
    border: 1px solid var(--border); background: rgba(8, 12, 22, 0.82); color: #94a3b8;
    transition: 0.15s;
}
.viz-btn.on, .viz-btn:hover { color: #6ee7b7; border-color: rgba(16, 185, 129, 0.45); background: rgba(16, 185, 129, 0.16); }

.bar {
    height: 11px; background: rgba(255, 255, 255, 0.09); border-radius: 999px;
    cursor: pointer; position: relative; margin-top: 10px; overflow: hidden;
}
.fill {
    height: 100%; width: 0;
    background: linear-gradient(90deg, var(--green), var(--cyan), var(--blue));
    border-radius: 999px; pointer-events: none;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
}
.times { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); margin-top: 6px; font-variant-numeric: tabular-nums; font-weight: 600; }

.ctrls { display: flex; justify-content: center; align-items: center; gap: 11px; margin: 14px 0; }
.ctrl {
    width: 45px; height: 45px; border-radius: 50%;
    border: 1px solid var(--border); background: rgba(255, 255, 255, 0.06);
    color: #fff; font-size: 17px; transition: all 0.16s ease;
    display: flex; align-items: center; justify-content: center;
}
.ctrl:hover { background: rgba(255, 255, 255, 0.15); transform: scale(1.06); }
.ctrl.big {
    width: 58px; height: 58px;
    background: linear-gradient(135deg, #10b981, #059669);
    border-color: rgba(52, 211, 153, 0.5);
    color: #032215; font-size: 22px;
    box-shadow: 0 6px 22px rgba(16, 185, 129, 0.38);
}
.ctrl.big:hover { filter: brightness(1.08); }

.sliders-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
@media (max-width: 600px) { .sliders-grid { grid-template-columns: 1fr; } }
.slider {
    display: flex; align-items: center; gap: 10px; font-size: 12.5px;
    background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border);
    padding: 9px 12px; border-radius: 12px;
}
.slider span { min-width: 108px; color: #cbd5e1; font-weight: 600; }
.slider input { flex: 1; accent-color: var(--green); cursor: pointer; }

.dsp-head { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; margin-bottom: 8px; }
h3 { font-size: 14.5px; font-weight: 800; letter-spacing: -0.2px; }
.sub { font-size: 12px; color: var(--muted); }
.dsp { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
@media (max-width: 640px) { .dsp { grid-template-columns: repeat(2, 1fr); } }
.dsp button {
    background: rgba(255, 255, 255, 0.035); border: 1px solid var(--border);
    color: #cbd5e1; padding: 8px 6px; border-radius: 10px; font-size: 11.5px; font-weight: 700;
    transition: all 0.15s;
}
.dsp button.on, .dsp button:hover {
    background: rgba(16, 185, 129, 0.18); border-color: var(--green); color: #6ee7b7;
    box-shadow: 0 0 14px rgba(16, 185, 129, 0.16);
}

.qhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap; }
.search { position: relative; display: flex; gap: 8px; margin-bottom: 12px; }
.search input { flex: 1; }
.drop {
    position: absolute; top: 100%; left: 0; right: 0; margin-top: 6px;
    background: #0b1326; border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 13px; z-index: 60; max-height: 310px; overflow-y: auto;
    display: none; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75);
}
.drop-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
.drop-item:hover { background: rgba(16, 185, 129, 0.15); }
.drop-item img { width: 48px; height: 36px; border-radius: 6px; object-fit: cover; background: #060a14; }
.grow { flex: 1; min-width: 0; }
.t1 { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t2 { font-size: 11px; color: var(--muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.list { display: flex; flex-direction: column; gap: 8px; max-height: 490px; overflow-y: auto; padding-right: 2px; }
.item {
    display: flex; align-items: center; gap: 10px; padding: 9px 11px;
    background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border);
    border-radius: 12px; transition: border-color 0.15s, background 0.15s;
}
.item:hover { border-color: rgba(255, 255, 255, 0.15); background: rgba(255, 255, 255, 0.05); }
.item.q { cursor: grab; }
.item.over { border-color: var(--green); background: rgba(16, 185, 129, 0.12); }
.item img { width: 42px; height: 42px; border-radius: 8px; object-fit: cover; background: #070b16; flex-shrink: 0; }
.idx { font-size: 12px; color: var(--muted); width: 22px; font-weight: 800; text-align: center; }
.q-actions { display: flex; align-items: center; gap: 4px; }
.icon-btn {
    background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border);
    color: #cbd5e1; width: 28px; height: 28px; border-radius: 7px;
    font-size: 12px; display: inline-flex; align-items: center; justify-content: center;
    transition: 0.15s;
}
.icon-btn:hover { background: rgba(16, 185, 129, 0.2); border-color: var(--green); color: #6ee7b7; }
.icon-btn.del:hover { background: rgba(239, 68, 68, 0.2); border-color: var(--red); color: #fca5a5; }
.empty { text-align: center; color: var(--muted); font-size: 13px; padding: 34px 12px; }

.bottom-head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.tabs { display: flex; gap: 8px; }
.tab { background: none; border: 1px solid var(--border); color: var(--muted); padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 12px; transition: 0.15s; }
.tab.on { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border-color: var(--blue); }

.lyr-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.lyr-badge {
    font-size: 11px; font-weight: 700; color: #93c5fd;
    background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.25);
    padding: 4px 10px; border-radius: 999px;
}
.lyrics {
    position: relative;
    height: 350px;
    overflow-y: auto;
    padding: 14px 12px;
    scroll-behavior: smooth;
    background: rgba(5, 9, 20, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    transition: height 0.25s ease;
}
.lyrics.expanded { height: 540px; }
.ly {
    padding: 8px 12px;
    border-radius: 10px;
    color: rgba(148, 163, 184, 0.55);
    font-size: 16.5px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.22s ease;
    line-height: 1.4;
}
.ly:hover { color: #e2e8f0; background: rgba(255, 255, 255, 0.04); }
.ly.past { color: rgba(148, 163, 184, 0.35); }
.ly.on {
    color: #ffffff;
    background: linear-gradient(90deg, rgba(16, 185, 129, 0.22), rgba(59, 130, 246, 0.12));
    border-left: 3px solid var(--green-glow);
    font-size: 20px;
    text-shadow: 0 0 18px rgba(52, 211, 153, 0.45);
    transform: translateX(4px);
}
.plain { white-space: pre-line; color: #e2e8f0; line-height: 1.85; font-size: 15px; padding: 6px 8px; }

#toast {
    position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
    background: #0f172a; border: 1px solid rgba(52, 211, 153, 0.4);
    padding: 11px 18px; border-radius: 12px; font-size: 13px; font-weight: 600;
    opacity: 0; pointer-events: none; transition: 0.25s; z-index: 99;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
}
#toast.show { opacity: 1; }
</style>
</head>
<body>
<div id="ambientBg"></div>
<div class="wrap">
    <div class="top">
        <div class="brand">
            <div class="brand-icon">🎛️</div>
            <div>
                <h1>Grandway Studio &bull; Live Music Command Center</h1>
                <p>Real-time multi-band audio spectrum, synced LRCLIB studio lyrics &amp; shared queue</p>
            </div>
        </div>
        <div class="top-right">
            <span id="nodeBadge" class="badge meta">⚡ Lavalink v4 Ready</span>
            <span id="conn" class="badge off"><span class="dot"></span>CONNECTING…</span>
        </div>
    </div>

    <div class="card vc-bar">
        <div class="row">
            <strong>🔊 Active Stage:</strong>
            <span id="vcName" style="color:#60a5fa;font-weight:800">Disconnected</span>
            <div id="listeners" class="avatars"></div>
            <span id="listenersCount" class="sub"></span>
        </div>
        <div class="row">
            <select id="vcSelect"></select>
            <button class="btn primary" id="vcMove">⚡ Switch Stage</button>
        </div>
    </div>

    <div class="card stations-bar">
        <span class="stations-lbl">📻 24/7 Vibe Stations:</span>
        <button class="station-pill" data-station="store_hits">🛒 Store Hits</button>
        <button class="station-pill" data-station="lofi_chill">☕ Lo-Fi &amp; Chill</button>
        <button class="station-pill" data-station="throwbacks_2010s">🔥 2010s Anthems</button>
        <button class="station-pill" data-station="late_night_rnb">🌙 Late Night R&amp;B</button>
        <button class="station-pill" data-station="hype_gym">🎧 Hype / Gym</button>
        <button class="station-pill" data-station="pop_party">✨ Pop Party</button>
        <button class="station-pill" data-station="jazz_cafe">🎷 Jazz Café</button>
        <button class="station-pill" data-station="synthwave">🌆 80s Synthwave</button>
    </div>

    <div class="grid">
        <div class="card">
            <div class="np">
                <div class="art-wrap">
                    <div id="artPlaceholder" class="art-placeholder">🎵</div>
                    <img id="art" class="art" alt="" style="visibility:hidden">
                </div>
                <div class="np-info">
                    <div class="state-row">
                        <div id="state" class="state">IDLE</div>
                        <span id="dspPill" class="dsp-pill">DSP ACTIVE</span>
                    </div>
                    <div id="title" class="title">Nothing playing</div>
                    <div id="artist" class="artist">Search any song, paste a link, or launch a Vibe Station above</div>
                    <div id="req" class="req"></div>
                </div>
            </div>

            <div class="viz">
                <canvas id="cv"></canvas>
                <div class="viz-hud">
                    <span id="vizTag" class="viz-tag">64-BAND FFT SPECTRUM • 60 FPS</span>
                    <div class="viz-modes">
                        <button class="viz-btn on" data-vmode="0">📊 SPECTRUM</button>
                        <button class="viz-btn" data-vmode="1">🌊 WAVE</button>
                        <button class="viz-btn" data-vmode="2">🔮 ORB</button>
                    </div>
                </div>
            </div>

            <div class="bar" id="bar"><div class="fill" id="fill"></div></div>
            <div class="times"><span id="tNow">0:00</span><span id="tTotal">0:00</span></div>

            <div class="ctrls">
                <button class="ctrl" id="bShuffle" title="Shuffle queue">🔀</button>
                <button class="ctrl" id="bPrev" title="Previous track">⏮️</button>
                <button class="ctrl big" id="bPlay" title="Play / Pause (Space)">⏸️</button>
                <button class="ctrl" id="bSkip" title="Skip track">⏭️</button>
                <button class="ctrl" id="bStop" title="Stop &amp; Clear">⏹️</button>
                <button class="ctrl" id="bLoop" title="Loop mode">➡️</button>
                <button class="ctrl" id="bAuto" title="Autoplay DJ Radio when queue ends">📻</button>
            </div>

            <div class="sliders-grid">
                <div class="slider"><span>🔊 Volume: <b id="volLbl">100%</b></span><input type="range" id="vol" min="1" max="200" value="100"></div>
                <div class="slider"><span>⚡ Speed: <b id="spLbl">1x</b></span><input type="range" id="sp" min="0.5" max="2" step="0.05" value="1"></div>
            </div>

            <div class="dsp-head">
                <h3>🎛️ Real-Time Lavalink DSP Filters</h3>
                <span class="sub">Instant studio EQ &amp; spatial effects</span>
            </div>
            <div class="dsp" id="dsp"></div>
        </div>

        <div class="card">
            <div class="qhead">
                <div>
                    <h3>📑 Live Up Next Queue</h3>
                    <div class="sub"><span id="qCount">0</span> waiting &bull; drag to reorder or click ▶ to play now</div>
                </div>
                <div class="row">
                    <button class="btn sm" id="bDedupe" title="Remove duplicate songs">🧹 Dedupe</button>
                    <button class="btn sm danger" id="bClear">🗑️ Clear</button>
                </div>
            </div>
            <div class="search">
                <input type="text" id="q" placeholder="🔍 Search song, artist, or paste Spotify / YouTube URL…" autocomplete="off">
                <button class="btn emerald" id="qAdd">+ Queue</button>
                <div class="drop" id="drop"></div>
            </div>
            <div class="list" id="queue"></div>
        </div>
    </div>

    <div class="card">
        <div class="bottom-head">
            <div class="tabs">
                <button class="tab on" id="tabLy">📜 Live Synced Lyrics</button>
                <button class="tab" id="tabHi">🕒 Recently Played</button>
            </div>
            <div class="lyr-tools" id="lyrTools">
                <span id="lyrMatch" class="lyr-badge" style="display:none"></span>
                <button class="btn sm" id="lyMinus" title="Shift lyrics 0.5s earlier">-0.5s</button>
                <button class="btn sm" id="lyOffsetLbl" title="Click to reset lyric timing offset">Sync: 0.0s</button>
                <button class="btn sm" id="lyPlus" title="Shift lyrics 0.5s later">+0.5s</button>
                <button class="btn sm" id="lyExpand" title="Toggle large karaoke stage">⛶ Expand</button>
            </div>
        </div>
        <div id="paneLy"><div class="lyrics" id="lyrics"><div class="empty">Nothing playing</div></div></div>
        <div id="paneHi" style="display:none"><div class="list" id="history"></div></div>
    </div>
</div>
<div id="toast"></div>

<script>
(function () {
    var PRESETS = [
        ['none', '✨ Studio Clean'], ['8d', '🎧 8D Spatial'], ['pingpong_fast', '🏓 Fast Pan'],
        ['lofi', '📻 Lo-Fi Chill'], ['nightcore', '⚡ Nightcore'], ['vaporwave', '🌊 Vaporwave'],
        ['tremolo', '〰️ Pulse Wave'], ['karaoke', '🎤 Vocal Cut'], ['bassboost_low', '🔈 Warm Bass'],
        ['bassboost_medium', '🔊 Sub Boost'], ['bassboost_extreme', '💥 Extreme Bass'],
        ['treble_boost', '🎻 Crisp Air'], ['pop', '🎸 Pop Master'], ['rock', '🤘 Rock Arena']
    ];
    var LOOP_ICON = { off: '➡️', track: '🔂', queue: '🔁' };

    var S = null;
    var base = { elapsed: 0, at: Date.now() };
    var trackKey = '';
    var lyr = { lines: [], plain: null, loaded: false, key: '', askedAt: 0, active: -1, offset: 0 };
    var sig = { queue: '', history: '', vc: '', listeners: '', now: '' };
    var dragFrom = null;
    var vizMode = 0;
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
                if (failCount >= 2) {
                    $('conn').className = 'badge off';
                    $('conn').innerHTML = '<span class="dot"></span>RECONNECTING…';
                }
            });
    }

    function apply(s) {
        S = s;
        base = { elapsed: s.elapsed || 0, at: Date.now() };

        var conn = $('conn');
        conn.className = 'badge ' + (s.connected ? 'live' : 'off');
        conn.innerHTML = '<span class="dot"></span>' + (s.connected ? ('LIVE STAGE' + (s.activeNode ? ' • ' + esc(s.activeNode) : '')) : 'STANDBY');

        if (s.nodes && s.nodes.length) {
            var n0 = s.nodes[0];
            $('nodeBadge').textContent = '⚡ ' + n0.name + (n0.ping ? ' (' + n0.ping + 'ms)' : '');
        }

        var autoBtn = $('bAuto');
        if (autoBtn) {
            autoBtn.style.borderColor = s.autoplay ? 'var(--green)' : '';
            autoBtn.style.background = s.autoplay ? 'rgba(16,185,129,.22)' : '';
        }

        var dspPill = $('dspPill');
        if (s.filter && s.filter !== 'none') {
            dspPill.style.display = 'inline-block';
            dspPill.textContent = '🎛️ ' + s.filter.toUpperCase().replace('_', ' ');
        } else {
            dspPill.style.display = 'none';
        }

        var cur = s.current;
        var key = cur ? cur.url : '';
        var nowSig = key + '|' + s.isPaused + '|' + (cur ? cur.title : '') + '|' + (cur ? cur.duration : '');
        if (nowSig !== sig.now) {
            sig.now = nowSig;
            $('state').textContent = cur ? (s.isPaused ? '⏸ PAUSED' : '▶ NOW STREAMING') : 'IDLE';
            $('bPlay').textContent = s.isPaused ? '▶️' : '⏸️';
            $('title').textContent = cur ? cur.title : 'Nothing playing';
            $('artist').textContent = cur ? (cur.author || 'Unknown Artist') : 'Search any song, paste a link, or launch a Vibe Station above';
            $('req').textContent = cur && cur.requester ? '🎧 Requested by ' + cur.requester : '';
            $('tTotal').textContent = cur ? (cur.duration || fmt(cur.seconds)) : '0:00';
        }

        if (key !== trackKey) {
            trackKey = key;
            var artEl = $('art');
            var phEl = $('artPlaceholder');
            var ambEl = $('ambientBg');
            if (cur && cur.thumbnail) {
                artEl.src = cur.thumbnail;
                artEl.style.visibility = 'visible';
                phEl.style.display = 'none';
                ambEl.style.backgroundImage = 'url("' + esc(cur.thumbnail) + '")';
            } else {
                artEl.removeAttribute('src');
                artEl.style.visibility = 'hidden';
                phEl.style.display = 'flex';
                ambEl.style.backgroundImage = 'none';
            }
            seedTrackEnergy(key + (cur ? cur.title : ''));
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
            if (s.hasLyrics && (!lyr.loaded || lyr.key !== key)) {
                loadLyrics();
            } else if (!s.hasLyrics && !s.lyricsLoading && !lyr.loaded) {
                $('lyrics').innerHTML = '<div class="empty">No synchronized or plain lyrics found for this song.</div>';
                $('lyrMatch').style.display = 'none';
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
            s.listeners.slice(0, 8).forEach(function (l) { h += '<img src="' + esc(l.avatar) + '" title="' + esc(l.name) + '" alt="">'; });
            $('listeners').innerHTML = h;
            $('listenersCount').textContent = s.listeners.length ? s.listeners.length + ' tuned in' : '';
        }
    }

    /* ---------- queue ---------- */
    function renderQueue(s) {
        $('qCount').textContent = s.queue.length;
        if (dragFrom !== null) return;
        var qsig = s.queue.map(function (t) { return t.url + '|' + t.title; }).join('||');
        if (qsig === sig.queue) return;
        sig.queue = qsig;
        if (!s.queue.length) {
            $('queue').innerHTML = '<div class="empty">☕ Queue is open. Search a track above or click an Instant Vibe Station!</div>';
            return;
        }
        var h = '';
        s.queue.forEach(function (t, i) {
            h += '<div class="item q" draggable="true" data-i="' + i + '" data-url="' + esc(t.url) + '">' +
                '<span class="idx">' + (i + 1) + '</span>' +
                '<img src="' + esc(t.thumbnail || '') + '" alt="">' +
                '<div class="grow"><div class="t1">' + esc(t.title) + '</div>' +
                '<div class="t2">' + esc(t.author) + ' &bull; ' + esc(t.duration) + (t.requester ? ' &bull; 👤 ' + esc(t.requester) : '') + '</div></div>' +
                '<div class="q-actions">' +
                '<button class="icon-btn" data-playidx="' + i + '" data-url="' + esc(t.url) + '" title="Play Now">▶</button>' +
                (i > 0 ? '<button class="icon-btn" data-topidx="' + i + '" data-url="' + esc(t.url) + '" title="Move to Top (Play Next)">⏫</button>' : '') +
                '<button class="icon-btn del" data-del="' + i + '" data-url="' + esc(t.url) + '" title="Remove">🗑️</button>' +
                '</div></div>';
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
                '<div class="grow"><div class="t1">' + esc(t.title) + '</div><div class="t2">' + esc(t.author) + ' &bull; ' + esc(t.duration || '') + '</div></div>' +
                '<button class="btn sm emerald" data-replay="' + esc(t.url) + '">▶ Replay</button></div>';
        });
        $('history').innerHTML = h;
    }

    /* ---------- lyrics ---------- */
    function resetLyrics() {
        lyr = { lines: [], plain: null, loaded: false, key: '', askedAt: Date.now(), active: -1, offset: 0 };
        $('lyOffsetLbl').textContent = 'Sync: 0.0s';
        $('lyrMatch').style.display = 'none';
        $('lyrics').innerHTML = '<div class="empty">' + (trackKey ? '⏳ Syncing studio lyrics from LRCLIB…' : 'Nothing playing') + '</div>';
        $('lyrics').scrollTop = 0;
    }
    function loadLyrics() {
        var forKey = trackKey;
        lyr.loaded = true;
        lyr.key = forKey;
        fetch('/api/music/lyrics', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
            if (forKey !== trackKey) return;
            if (d.trackUrl && d.trackUrl !== forKey) {
                lyr.loaded = false;
                return;
            }
            var box = $('lyrics');
            var matchBadge = $('lyrMatch');
            if (d.trackName || d.artistName) {
                matchBadge.style.display = 'inline-block';
                matchBadge.textContent = '🎵 ' + (d.trackName || '') + (d.artistName ? ' — ' + d.artistName : '') + (d.syncedLyrics && d.syncedLyrics.length ? ' (Synced LRC)' : ' (Plain)');
            } else {
                matchBadge.style.display = 'none';
            }
            if (d.syncedLyrics && d.syncedLyrics.length) {
                lyr.lines = d.syncedLyrics;
                var h = '';
                d.syncedLyrics.forEach(function (l, i) {
                    h += '<div class="ly" data-t="' + l.time + '" id="ly' + i + '">' + (l.text ? esc(l.text) : '♪ &bull; &bull; &bull;') + '</div>';
                });
                box.innerHTML = h;
                lyr.active = -1;
                highlightLyric(currentElapsed());
            } else if (d.plainLyrics) {
                lyr.plain = d.plainLyrics;
                box.innerHTML = '<div class="plain">' + esc(d.plainLyrics) + '</div>';
            } else {
                lyr.loaded = false;
            }
        }).catch(function () { lyr.loaded = false; });
    }
    function highlightLyric(sec) {
        if (!lyr.lines.length) return;
        var adj = sec + 0.25 + (lyr.offset || 0);
        var idx = -1;
        for (var i = 0; i < lyr.lines.length; i++) {
            if (adj >= lyr.lines[i].time) idx = i;
            else break;
        }
        if (idx === lyr.active) return;
        var box = $('lyrics');
        for (var j = 0; j < lyr.lines.length; j++) {
            var node = $('ly' + j);
            if (!node) continue;
            if (j === idx) node.className = 'ly on';
            else if (j < idx) node.className = 'ly past';
            else node.className = 'ly';
        }
        if (idx >= 0) {
            var el = $('ly' + idx);
            if (el) {
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
        if (S && S.current && !lyr.loaded && !S.hasLyrics && Date.now() - lyr.askedAt > 12000) {
            var box = $('lyrics');
            if (box.textContent.indexOf('Syncing') !== -1) {
                box.innerHTML = '<div class="empty">No synchronized or plain lyrics found for this song.</div>';
            }
        }
    }, 150);

    /* ---------- 64-Band Real-Time Studio Spectrum & DSP Visualizer ---------- */
    var cv = $('cv'), ctx = cv.getContext('2d');
    var NUM_BANDS = 64;
    var bandVals = new Float32Array(NUM_BANDS);
    var peakVals = new Float32Array(NUM_BANDS);
    var peakHold = new Float32Array(NUM_BANDS);
    var bandSeed = new Float32Array(NUM_BANDS);
    var trackBpm = 122;
    var lastFrame = performance.now();

    function seedTrackEnergy(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        trackBpm = 96 + (Math.abs(h) % 52); // 96..148 BPM signature per track
        for (var b = 0; b < NUM_BANDS; b++) {
            bandSeed[b] = ((Math.abs(Math.imul(h, b + 17)) % 1000) / 1000) * Math.PI * 2;
        }
    }
    seedTrackEnergy('grandway');

    function fit() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = cv.parentElement.clientWidth * dpr;
        cv.height = cv.parentElement.clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', fit);
    fit();

    function draw(now) {
        var dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        var w = cv.parentElement.clientWidth;
        var h = cv.parentElement.clientHeight;
        var cx = w / 2, cy = h / 2;
        var live = S && S.current && !S.isPaused;
        var filter = (S && S.filter) || 'none';
        var speed = (S && S.speed) || 1.0;
        var volScale = S ? Math.min(1.35, Math.max(0.35, (S.volume || 100) / 100)) : 1.0;

        ctx.clearRect(0, 0, w, h);

        // Compute beat & harmonic envelopes
        var t = (now / 1000) * speed;
        var beatHz = (trackBpm / 60) * (filter === 'nightcore' ? 1.25 : (filter === 'vaporwave' || filter === 'lofi' ? 0.82 : 1.0));
        var beatPhase = (t * beatHz) % 1;
        var kick = live ? Math.pow(Math.max(0, 1 - beatPhase * 3.4), 2.2) : 0;
        var snarePhase = ((t * beatHz + 0.5) % 1);
        var snare = live ? Math.pow(Math.max(0, 1 - snarePhase * 4.2), 2.5) : 0;

        // Lyric vocal energy boost when a lyric line is currently active
        var vocalActive = (live && lyr.active >= 0) ? 1.18 : 0.92;

        // DSP filter frequency shaping
        var bassGain = filter.indexOf('bassboost_extreme') === 0 ? 1.55
            : (filter.indexOf('bassboost') === 0 ? 1.32 : (filter === 'karaoke' ? 0.85 : 1.0));
        var trebleGain = filter === 'treble_boost' || filter === 'nightcore' ? 1.35
            : (filter === 'lofi' || filter === 'vaporwave' ? 0.68 : 1.0);
        var panWave = (filter === '8d' || filter === 'pingpong_fast')
            ? Math.sin(t * (filter === 'pingpong_fast' ? 3.2 : 1.1))
            : 0;

        // Update 64 frequency bands with realistic attack/decay & peak-hold physics
        for (var i = 0; i < NUM_BANDS; i++) {
            var norm = i / (NUM_BANDS - 1); // 0 = sub-bass, 0.5 = vocal mids, 1 = air treble
            var target = 0.03;
            if (live) {
                var subEnv = Math.exp(-norm * 5.2) * (0.42 + kick * 0.65) * bassGain;
                var midCenter = Math.exp(-Math.pow((norm - 0.36) / 0.22, 2));
                var midMod = (Math.sin(t * 6.3 + bandSeed[i]) * 0.5 + 0.5) * (Math.cos(t * 11.7 - i * 0.37) * 0.5 + 0.5);
                var midEnv = midCenter * (0.22 + midMod * 0.52 + snare * 0.25) * vocalActive;
                var hiEnv = Math.pow(norm, 1.4) * (Math.sin(t * 19.5 + bandSeed[i] * 2.1) * 0.5 + 0.5) * (0.28 + snare * 0.35) * trebleGain;
                var shimmer = Math.sin(t * 27.0 + i * 1.7) * 0.06;

                // Apply 8D stereo pan weighting across left/right bins
                var panBias = 1.0;
                if (panWave !== 0) {
                    var side = (norm - 0.5) * 2; // -1..+1
                    panBias = 0.72 + 0.45 * Math.max(0, 1 - Math.abs(side - panWave * 0.85));
                }

                target = Math.min(0.98, Math.max(0.05, (subEnv + midEnv + hiEnv + shimmer) * volScale * panBias));
            }

            // Fast attack, smooth gravity decay
            if (target > bandVals[i]) {
                bandVals[i] += (target - bandVals[i]) * Math.min(1, dt * 28);
            } else {
                bandVals[i] += (target - bandVals[i]) * Math.min(1, dt * 8.5);
            }

            // Peak-hold cap physics
            if (bandVals[i] >= peakVals[i]) {
                peakVals[i] = bandVals[i];
                peakHold[i] = 0.22; // hold for 220ms
            } else {
                if (peakHold[i] > 0) peakHold[i] -= dt;
                else peakVals[i] = Math.max(bandVals[i], peakVals[i] - dt * 0.48);
            }
        }

        // Subtle studio dB grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (var g = 1; g <= 3; g++) {
            var gy = Math.floor((h / 4) * g) + 0.5;
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
        }

        if (vizMode === 0) {
            // MODE 0: 64-BAND STUDIO SPECTRUM + FLOATING PEAK CAPS
            var padX = 12, usableW = w - padX * 2;
            var step = usableW / NUM_BANDS;
            var bw = Math.max(2, step - 3);
            var maxBarH = h - 28;

            for (var b = 0; b < NUM_BANDS; b++) {
                var x = padX + b * step;
                var bh = Math.max(3, bandVals[b] * maxBarH);
                var y = h - 6 - bh;

                var grad = ctx.createLinearGradient(0, h - 6, 0, y);
                if (filter.indexOf('bassboost') === 0) {
                    grad.addColorStop(0, '#10b981');
                    grad.addColorStop(0.6, '#f59e0b');
                    grad.addColorStop(1, '#ef4444');
                } else if (filter === 'vaporwave' || filter === 'nightcore') {
                    grad.addColorStop(0, '#3b82f6');
                    grad.addColorStop(0.55, '#8b5cf6');
                    grad.addColorStop(1, '#ec4899');
                } else {
                    grad.addColorStop(0, '#059669');
                    grad.addColorStop(0.55, '#10b981');
                    grad.addColorStop(1, '#38bdf8');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(x, y, bw, bh);

                // Floating Peak-Hold Cap
                var py = h - 6 - Math.max(4, peakVals[b] * maxBarH) - 3;
                ctx.fillStyle = filter.indexOf('bassboost') === 0 ? '#fde047' : '#a7f3d0';
                ctx.fillRect(x, Math.max(4, py), bw, 2);
            }
        } else if (vizMode === 1) {
            // MODE 1: DUAL-CHANNEL STEREO OSCILLOSCOPE WAVEFORM
            for (var ch = 0; ch < 2; ch++) {
                ctx.beginPath();
                for (var idx = 0; idx < NUM_BANDS; idx++) {
                    var px = (idx / (NUM_BANDS - 1)) * w;
                    var sign = (idx % 2 === 0 ? 1 : -1) * (ch === 0 ? 1 : -0.65);
                    var amp = bandVals[idx] * (h * 0.38) * sign;
                    var waveY = cy + amp * Math.sin(t * 8 + idx * 0.35 + ch * 1.2);
                    if (idx === 0) ctx.moveTo(px, waveY);
                    else ctx.lineTo(px, waveY);
                }
                ctx.strokeStyle = ch === 0 ? '#34d399' : 'rgba(56, 189, 248, 0.65)';
                ctx.lineWidth = ch === 0 ? 2.6 : 1.8;
                ctx.stroke();
            }
        } else {
            // MODE 2: REACTIVE RADIAL BASS ORB
            var baseR = Math.min(w, h) * (0.22 + kick * 0.08);
            ctx.save();
            ctx.translate(cx, cy + 4);
            for (var rIdx = 0; rIdx < NUM_BANDS; rIdx++) {
                var ang = (rIdx / NUM_BANDS) * Math.PI * 2 - Math.PI / 2;
                var len = 4 + bandVals[rIdx] * (Math.min(w, h) * 0.24);
                var x1 = Math.cos(ang) * baseR, y1 = Math.sin(ang) * baseR;
                var x2 = Math.cos(ang) * (baseR + len), y2 = Math.sin(ang) * (baseR + len);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = rIdx % 2 === 0 ? '#34d399' : '#38bdf8';
                ctx.lineWidth = 2.4;
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, 0, baseR * 0.85, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(16, 185, 129, ' + (0.12 + kick * 0.22) + ')';
            ctx.fill();
            ctx.restore();
        }

        requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    var vBtns = document.querySelectorAll('[data-vmode]');
    for (var vi = 0; vi < vBtns.length; vi++) {
        vBtns[vi].onclick = function () {
            vizMode = parseInt(this.getAttribute('data-vmode'), 10) || 0;
            for (var k = 0; k < vBtns.length; k++) {
                vBtns[k].className = 'viz-btn' + (k === vizMode ? ' on' : '');
            }
            $('vizTag').textContent = vizMode === 0 ? '64-BAND FFT SPECTRUM • 60 FPS'
                : (vizMode === 1 ? 'STEREO OSCILLOSCOPE WAVE • 60 FPS' : 'RADIAL SUB-BASS ORB • 60 FPS');
        };
    }

    /* ---------- controls ---------- */
    PRESETS.forEach(function (p) {
        var b = document.createElement('button');
        b.textContent = p[1]; b.setAttribute('data-f', p[0]);
        b.onclick = function () {
            toast('🎛️ Applying ' + p[1] + '…');
            post('/api/music/filter', { filter: p[0] }).then(refresh);
        };
        $('dsp').appendChild(b);
    });

    var stationBtns = document.querySelectorAll('[data-station]');
    for (var si = 0; si < stationBtns.length; si++) {
        stationBtns[si].onclick = function () {
            var st = this.getAttribute('data-station');
            var label = this.textContent;
            toast('📻 Tuning into ' + label + '…');
            post('/api/music/station', { station: st }).then(function (r) {
                if (r && r.error) toast('❌ ' + r.error);
                else toast('✅ Loaded ' + label + ' station!');
                sig.queue = '';
                refresh();
            });
        };
    }

    $('bPlay').onclick = function () {
        if (S) { S.isPaused = !S.isPaused; $('bPlay').textContent = S.isPaused ? '▶️' : '⏸️'; base = { elapsed: currentElapsed(), at: Date.now() }; }
        act('toggle_pause');
    };
    $('bPrev').onclick = function () { act('previous'); };
    $('bSkip').onclick = function () { act('skip'); };
    $('bStop').onclick = function () { act('stop'); };
    $('bShuffle').onclick = function () { sig.queue = ''; act('shuffle').then(function () { toast('🔀 Queue shuffled'); }); };
    $('bDedupe').onclick = function () { sig.queue = ''; act('dedupe').then(function () { toast('🧹 Removed duplicate tracks'); }); };
    $('bAuto').onclick = function () { act('autoplay').then(function () { toast(S && S.autoplay ? '📻 Autoplay Radio ON' : '📻 Autoplay Radio OFF'); }); };
    $('bClear').onclick = function () { sig.queue = ''; act('clear').then(function () { toast('🗑️ Queue cleared'); }); };
    $('bLoop').onclick = function () {
        var cur = S ? S.loop : 'off';
        var next = cur === 'off' ? 'track' : (cur === 'track' ? 'queue' : 'off');
        post('/api/music/loop', { mode: next }).then(function () {
            toast('🔁 Loop mode: ' + next.toUpperCase());
            refresh();
        });
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
        toast('🔊 Switching voice stage…');
        post('/api/music/channel', { channelId: id }).then(function (r) { if (r && r.error) toast(r.error); refresh(); });
    };

    /* ---------- lyric offset & expand controls ---------- */
    function updateOffsetBadge() {
        var v = lyr.offset;
        $('lyOffsetLbl').textContent = 'Sync: ' + (v > 0 ? '+' : '') + v.toFixed(1) + 's';
        lyr.active = -1;
        highlightLyric(currentElapsed());
    }
    $('lyMinus').onclick = function () { lyr.offset = Math.round((lyr.offset - 0.5) * 10) / 10; updateOffsetBadge(); };
    $('lyPlus').onclick = function () { lyr.offset = Math.round((lyr.offset + 0.5) * 10) / 10; updateOffsetBadge(); };
    $('lyOffsetLbl').onclick = function () { lyr.offset = 0; updateOffsetBadge(); };
    $('lyExpand').onclick = function () {
        var box = $('lyrics');
        var exp = box.classList.toggle('expanded');
        this.textContent = exp ? '🗗 Compact' : '⛶ Expand';
    };

    $('tabLy').onclick = function () { tab('Ly'); };
    $('tabHi').onclick = function () { tab('Hi'); };
    function tab(which) {
        $('paneLy').style.display = which === 'Ly' ? 'block' : 'none';
        $('paneHi').style.display = which === 'Hi' ? 'block' : 'none';
        $('lyrTools').style.display = which === 'Ly' ? 'flex' : 'none';
        $('tabLy').className = 'tab' + (which === 'Ly' ? ' on' : '');
        $('tabHi').className = 'tab' + (which === 'Hi' ? ' on' : '');
    }

    /* ---------- queue interactions (event delegation) ---------- */
    var busyAdd = false;
    function addToQueue(query) {
        if (!query || busyAdd) return;
        busyAdd = true;
        $('qAdd').disabled = true;
        toast('⏳ Resolving studio stream…');
        post('/api/music/queue', { query: query }).then(function (r) {
            busyAdd = false;
            $('qAdd').disabled = false;
            toast(r && r.error ? ('❌ ' + r.error) : '✅ Added to queue');
            sig.queue = '';
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
                        '<div class="grow"><div class="t1">' + esc(x.title) + '</div><div class="t2">' + esc(x.author) + ' &bull; ' + esc(x.duration) + '</div></div>' +
                        '<span class="t2" style="color:#34d399;font-weight:800">+ Queue</span></div>';
                });
                $('drop').innerHTML = h; $('drop').style.display = 'block';
            }).catch(function () {});
        }, 260);
    };
    document.addEventListener('click', function (e) {
        var t = e.target;
        var add = t.closest ? t.closest('[data-add]') : null;
        if (add) { $('drop').style.display = 'none'; $('q').value = ''; addToQueue(add.getAttribute('data-add')); return; }
        if (!(t.closest && t.closest('.search'))) $('drop').style.display = 'none';

        var playIdx = t.closest ? t.closest('[data-playidx]') : null;
        if (playIdx) {
            sig.queue = '';
            act('play_index', { index: parseInt(playIdx.getAttribute('data-playidx'), 10), url: playIdx.getAttribute('data-url') });
            return;
        }
        var topIdx = t.closest ? t.closest('[data-topidx]') : null;
        if (topIdx) {
            sig.queue = '';
            act('move_top', { index: parseInt(topIdx.getAttribute('data-topidx'), 10), url: topIdx.getAttribute('data-url') }).then(function () {
                toast('⏫ Moved to Play Next');
            });
            return;
        }
        var del = t.closest ? t.closest('[data-del]') : null;
        if (del) {
            post('/api/music/queue/delete', { index: parseInt(del.getAttribute('data-del'), 10), url: del.getAttribute('data-url') }).then(function () { sig.queue = ''; refresh(); });
            return;
        }
        var rep = t.closest ? t.closest('[data-replay]') : null;
        if (rep) { addToQueue(rep.getAttribute('data-replay')); return; }
        var ly = t.closest ? t.closest('.ly') : null;
        if (ly) {
            var sec = Math.max(0, Math.floor(parseFloat(ly.getAttribute('data-t')) - (lyr.offset || 0)));
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
        var items = qEl.querySelectorAll('.item.q');
        for (var i = 0; i < items.length; i++) items[i].classList.remove('over');
        if (it) it.classList.add('over');
    });
    qEl.addEventListener('drop', function (e) {
        e.preventDefault();
        var it = e.target.closest ? e.target.closest('.item.q') : null;
        var from = dragFrom;
        dragFrom = null;
        if (!it || from === null) { sig.queue = ''; refresh(); return; }
        var to = parseInt(it.getAttribute('data-i'), 10);
        var dragged = qEl.querySelector('[data-drag="1"]');
        var url = dragged ? dragged.getAttribute('data-url') : null;
        if (from === to) { sig.queue = ''; refresh(); return; }
        post('/api/music/queue/reorder', { from: from, to: to, url: url }).then(function () { sig.queue = ''; refresh(); });
    });
    qEl.addEventListener('dragend', function () {
        dragFrom = null;
        var items = qEl.querySelectorAll('.item.q');
        for (var i = 0; i < items.length; i++) items[i].classList.remove('over');
    });

    refresh();
    setInterval(refresh, 1500);
})();
</script>
</body>
</html>`;
}

module.exports = { renderMusicDashboard };
