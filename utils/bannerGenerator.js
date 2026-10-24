/**
 * Generates dynamic SVG banner for Now Playing track (renders cleanly across all devices and Discord embeds)
 */
function generateNowPlayingSvg(track, queue) {
    const elapsed = queue ? queue.getPlaybackSeconds() : 0;
    const total = track.seconds || 1;
    const progressPercent = Math.min(100, Math.max(0, (elapsed / total) * 100));

    const title = escapeXml((track.title || 'Unknown Title').slice(0, 42));
    const artist = escapeXml((track.author || 'Unknown Artist').slice(0, 32));
    const requester = escapeXml(track.requester ? track.requester.tag : 'Community');
    const elapsedText = formatSecs(elapsed);
    const durationText = track.duration || formatSecs(total);
    const filterText = (queue && queue.activeFilter && queue.activeFilter !== 'none') ? queue.activeFilter.toUpperCase() : 'NORMAL';
    const speedText = (queue && queue.speed) ? `${queue.speed}x` : '1.0x';

    return `<svg width="800" height="260" viewBox="0 0 800 260" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="50%" stop-color="#111827" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2ECC71" />
      <stop offset="100%" stop-color="#3498DB" />
    </linearGradient>
    <clipPath id="thumbClip">
      <rect x="25" y="25" width="210" height="210" rx="16" />
    </clipPath>
  </defs>

  <!-- Background Card -->
  <rect width="800" height="260" rx="24" fill="url(#bgGrad)" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- Album Art Thumbnail / Fallback -->
  <g clip-path="url(#thumbClip)">
    <rect x="25" y="25" width="210" height="210" fill="#1e293b"/>
    ${track.thumbnail ? `<image href="${track.thumbnail}" x="25" y="25" width="210" height="210" preserveAspectRatio="xMidYMid slice"/>` : ''}
    <rect x="25" y="25" width="210" height="210" fill="rgba(0,0,0,0.15)"/>
  </g>

  <!-- Title & Artist -->
  <text x="260" y="68" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="800" fill="#ffffff">${title}</text>
  <text x="260" y="100" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="15" font-weight="600" fill="#94a3b8">🎤 ${artist}</text>

  <!-- Badges -->
  <rect x="260" y="120" width="90" height="26" rx="8" fill="rgba(46,204,113,0.15)" stroke="rgba(46,204,113,0.3)"/>
  <text x="305" y="137" font-family="sans-serif" font-size="11" font-weight="700" fill="#2ECC71" text-anchor="middle">⚡ ${speedText}</text>

  <rect x="360" y="120" width="130" height="26" rx="8" fill="rgba(52,152,219,0.15)" stroke="rgba(52,152,219,0.3)"/>
  <text x="425" y="137" font-family="sans-serif" font-size="11" font-weight="700" fill="#60a5fa" text-anchor="middle">🎛️ ${filterText}</text>

  <text x="505" y="138" font-family="sans-serif" font-size="13" font-weight="500" fill="#64748b">👤 ${requester}</text>

  <!-- Progress Bar Container -->
  <rect x="260" y="180" width="500" height="8" rx="4" fill="rgba(255,255,255,0.08)"/>
  <rect x="260" y="180" width="${(500 * progressPercent) / 100}" height="8" rx="4" fill="url(#accentGrad)"/>
  <circle cx="${260 + (500 * progressPercent) / 100}" cy="184" r="6" fill="#ffffff" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"/>

  <!-- Timestamps -->
  <text x="260" y="210" font-family="monospace" font-size="13" font-weight="600" fill="#94a3b8">${elapsedText}</text>
  <text x="760" y="210" font-family="monospace" font-size="13" font-weight="600" fill="#94a3b8" text-anchor="end">${durationText}</text>
</svg>`;
}

function escapeXml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatSecs(sec) {
    const s = parseInt(sec, 10) || 0;
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${rem.toString().padStart(2, '0')}`;
}

module.exports = {
    generateNowPlayingSvg
};
