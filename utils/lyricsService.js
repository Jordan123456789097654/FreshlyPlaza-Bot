const https = require('https');

/**
 * Lyrics & LRCLIB API Helper
 */
const lyricsService = {
    /**
     * Search lyrics via LRCLIB
     */
    async fetchLyrics(query) {
        if (!query || !query.trim()) return null;
        
        // Multi-stage cleaning to match LRCLIB's database
        // Strip parentheses like (Official Video), (Lyrics), (Visualizer), [Audio]
        let cleaned = query
            .replace(/\(.*?\)|\[.*?\]/g, '')
            .replace(/\b(?:official\s*(?:video|audio|music\s*video|lyric\s*video)|4k|remastered|hd|hq|audio|video|lyrics)\b/gi, '')
            .replace(/ft\..*|feat\..*/i, '')
            .replace(/[-–—|•]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const searchCandidates = [
            cleaned,
            cleaned.replace(/VEVO/gi, '').trim(),
            query.split('-')[1]?.trim() || null // Try just song name if artist - song
        ].filter(Boolean);

        for (const candidate of searchCandidates) {
            const result = await this._queryLrclib(candidate);
            if (result) return result;
        }

        return null;
    },

    _queryLrclib(q) {
        const url = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`;
        return new Promise((resolve) => {
            const req = https.get(url, { headers: { 'User-Agent': 'GrandwayMusic/2.0 (Discord Bot)' } }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (Array.isArray(json) && json.length > 0) {
                            // Find best match with synced lyrics first
                            const bestMatch = json.find(j => j.syncedLyrics) || json[0];
                            resolve({
                                trackName: bestMatch.trackName,
                                artistName: bestMatch.artistName,
                                plainLyrics: bestMatch.plainLyrics || null,
                                syncedLyrics: bestMatch.syncedLyrics ? this.parseLrc(bestMatch.syncedLyrics) : null,
                                rawSynced: bestMatch.syncedLyrics || null
                            });
                        } else {
                            resolve(null);
                        }
                    } catch (_) {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.setTimeout(4000, () => {
                req.destroy();
                resolve(null);
            });
        });
    },

    /**
     * Parses LRC string [mm:ss.xx] Lyric text into an array of { time: seconds, text: string }
     */
    parseLrc(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split('\n');
        const results = [];
        const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

        for (const line of lines) {
            const match = line.match(regex);
            if (match) {
                const mins = parseInt(match[1], 10);
                const secs = parseInt(match[2], 10);
                const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
                const totalSeconds = mins * 60 + secs + (ms / 1000);
                const text = (match[4] || '').trim();
                results.push({ time: totalSeconds, text });
            }
        }
        return results;
    }
};

module.exports = lyricsService;
