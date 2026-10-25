const https = require('https');

/**
 * High-Accuracy Lyrics & LRCLIB API Helper
 * - Separates Artist and Track Name cleanly from YouTube titles / channel names
 * - Uses structured LRCLIB queries (track_name + artist_name) before broad search
 * - Scores candidates by title similarity, artist similarity, and duration proximity
 */
const lyricsService = {
    /**
     * Clean a raw YouTube / SoundCloud title or artist string
     */
    cleanMetadata(rawTitle = '', rawAuthor = '') {
        let title = String(rawTitle || '').trim();
        let author = String(rawAuthor || '').trim();

        // Remove common YouTube channel suffixes from author
        author = author
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .replace(/\b(?:Official|Music|Records|Recordings|Channel|TV)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Remove bracketed/parenthesized noise like (Official Video), [Lyrics], (feat. X), [4K Remaster]
        title = title
            .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
            .replace(/\b(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer)|lyric\s*video|lyrics?|visualizer|audio|video|hd|hq|4k|remastered|explicit|clean\s*version|slowed|reverb|sped\s*up|nightcore|bass\s*boosted)\b/gi, ' ')
            .replace(/\b(?:ft\.?|feat\.?|featuring)\s+[^-–—|]+/gi, ' ')
            .replace(/[|•"]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Many YouTube titles are "Artist - Song Title"
        let extractedArtist = '';
        let extractedTrack = title;
        const dashParts = title.split(/\s+[-–—:]\s+/);
        if (dashParts.length >= 2) {
            extractedArtist = dashParts[0].trim();
            extractedTrack = dashParts.slice(1).join(' ').trim();
        }

        // If the extracted artist is already in author or vice versa, prefer the cleaner one
        const primaryArtist = extractedArtist || author;
        const secondaryArtist = extractedArtist && author && extractedArtist.toLowerCase() !== author.toLowerCase() ? author : '';

        // Also strip "ft./feat." from artist
        const cleanPrimaryArtist = primaryArtist.replace(/\b(?:ft\.?|feat\.?|featuring|&|x|,)\s+.*/i, '').trim();

        return {
            trackName: extractedTrack || title,
            fullTitle: title,
            artistName: cleanPrimaryArtist || primaryArtist,
            rawArtist: secondaryArtist || author
        };
    },

    /**
     * Normalize text into lowercase alphanumeric tokens for similarity comparison
     */
    _tokens(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1);
    },

    /**
     * Compute token overlap ratio (0..1) between target and candidate
     */
    _overlap(targetStr, candidateStr) {
        const tTokens = this._tokens(targetStr);
        const cTokens = new Set(this._tokens(candidateStr));
        if (tTokens.length === 0 || cTokens.size === 0) return 0;
        let hits = 0;
        for (const t of tTokens) {
            if (cTokens.has(t)) hits++;
        }
        return hits / tTokens.length;
    },

    /**
     * Fetch lyrics for a track object or string query
     * @param {object|string} trackOrQuery - Either { title, author, seconds } or a raw string
     */
    async fetchLyrics(trackOrQuery) {
        if (!trackOrQuery) return null;

        let rawTitle = '';
        let rawAuthor = '';
        let targetSeconds = 0;

        if (typeof trackOrQuery === 'string') {
            rawTitle = trackOrQuery;
        } else {
            rawTitle = trackOrQuery.title || '';
            rawAuthor = trackOrQuery.author || '';
            targetSeconds = Number(trackOrQuery.seconds) || 0;
        }

        if (!rawTitle.trim()) return null;

        const meta = this.cleanMetadata(rawTitle, rawAuthor);

        // Build ordered search URLs from most specific to broadest
        const urls = [];
        if (meta.trackName && meta.artistName) {
            urls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(meta.trackName)}&artist_name=${encodeURIComponent(meta.artistName)}`);
        }
        if (meta.trackName && meta.rawArtist && meta.rawArtist !== meta.artistName) {
            urls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(meta.trackName)}&artist_name=${encodeURIComponent(meta.rawArtist)}`);
        }
        if (meta.trackName) {
            urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(`${meta.trackName} ${meta.artistName}`.trim())}`);
            if (meta.fullTitle !== meta.trackName) {
                urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(meta.fullTitle)}`);
            }
            urls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(meta.trackName)}`);
        }

        for (const url of urls) {
            const list = await this._requestJson(url);
            if (!Array.isArray(list) || list.length === 0) continue;

            const best = this._pickBestCandidate(list, meta, targetSeconds);
            if (best) {
                return {
                    trackName: best.trackName,
                    artistName: best.artistName,
                    plainLyrics: best.plainLyrics || null,
                    syncedLyrics: best.syncedLyrics ? this.parseLrc(best.syncedLyrics) : null,
                    rawSynced: best.syncedLyrics || null
                };
            }
        }

        return null;
    },

    /**
     * Score and filter LRCLIB results so unrelated songs are rejected
     */
    _pickBestCandidate(list, meta, targetSeconds) {
        let bestItem = null;
        let bestScore = -Infinity;

        for (const item of list) {
            if (!item || (!item.syncedLyrics && !item.plainLyrics)) continue;

            const titleSim = Math.max(
                this._overlap(meta.trackName, item.trackName),
                this._overlap(item.trackName, meta.trackName),
                this._overlap(meta.fullTitle, item.trackName)
            );

            // Reject candidates whose title doesn't match the song title at all
            if (titleSim < 0.45) continue;

            const artistSim = Math.max(
                this._overlap(meta.artistName, item.artistName),
                this._overlap(meta.rawArtist, item.artistName),
                this._overlap(meta.fullTitle, item.artistName)
            );

            let score = titleSim * 60 + artistSim * 35;

            // Prefer synced lyrics for karaoke highlighting
            if (item.syncedLyrics) score += 18;

            // Duration check: penalize wildly different lengths (e.g. 10-minute remix vs 3-minute song)
            if (targetSeconds > 0 && item.duration > 0) {
                const diff = Math.abs(targetSeconds - item.duration);
                if (diff <= 5) score += 20;
                else if (diff <= 15) score += 10;
                else if (diff > 45) score -= 25;
                if (diff > 90) continue; // Reject if duration is off by more than 1.5 minutes
            }

            if (score > bestScore) {
                bestScore = score;
                bestItem = item;
            }
        }

        // Require a reasonable minimum confidence score
        return bestScore >= 35 ? bestItem : null;
    },

    _requestJson(url) {
        return new Promise((resolve) => {
            const req = https.get(url, { headers: { 'User-Agent': 'GrandwayMusic/2.5 (Discord Bot)' } }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (_) {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.setTimeout(4500, () => {
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
