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
        // Clean query to remove noise like (Official Video), [4K], etc.
        const cleanQuery = query
            .replace(/\b(?:official\s*(?:video|audio|music\s*video|lyric\s*video)|4k|remastered|hd|hq)\b/gi, '')
            .replace(/[([][^)\]]*[)\]]/g, '')
            .trim();

        const url = `https://lrclib.net/api/search?q=${encodeURIComponent(cleanQuery)}`;
        return new Promise((resolve) => {
            const req = https.get(url, { headers: { 'User-Agent': 'GrandwayMusic/2.0 (Discord Bot)' } }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (Array.isArray(json) && json.length > 0) {
                            const match = json[0];
                            resolve({
                                trackName: match.trackName,
                                artistName: match.artistName,
                                plainLyrics: match.plainLyrics || null,
                                syncedLyrics: match.syncedLyrics ? this.parseLrc(match.syncedLyrics) : null,
                                rawSynced: match.syncedLyrics || null
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
            req.setTimeout(5000, () => {
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
