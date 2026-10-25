const https = require('https');

/**
 * High-Accuracy Lyrics & LRCLIB API Helper
 * - Separates Artist and Track Name cleanly from YouTube/SoundCloud/Deezer titles & channel names
 * - Queries LRCLIB with strict artist + title validation so wrong songs are never returned
 * - Falls back to Lyrics.ovh plain lyrics if LRCLIB has no match
 */
const REPOST_CHANNEL_REGEX = /\b(?:7clouds|syrebralvibes|unique\s*vibes|shadow\s*music|taj\s*tracks|chilltracks|vibe\s*music|royal\s*music|cloudx|dope\s*lyrics|pillow|popular\s*music|gold\s*coast\s*music|wave\s*music|trap\s*nation|bass\s*nation|chill\s*nation|proximity|mrsuicide\s*sheep|suicidesheep|monstercat|ncs|nocopyrightsounds|ukf|spinnin|selected|capital\s*fm|bbc\s*radio|vevo|lyrics?\s*station|latin\s*hype|reggaeton\s*world|tiktok\s*tunes|speed\s*up\s*songs)\b/i;

const lyricsService = {
    /**
     * Clean a raw YouTube / SoundCloud title or artist string
     */
    cleanMetadata(rawTitle = '', rawAuthor = '') {
        let title = String(rawTitle || '').trim();
        let author = String(rawAuthor || '').trim();

        // Check if the uploader is a known lyric/repost channel rather than the actual recording artist
        const isRepostChannel = REPOST_CHANNEL_REGEX.test(author);

        // Remove common YouTube / SoundCloud channel suffixes from author
        author = author
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .replace(/\b(?:Official|Music|Records|Recordings|Channel|TV|Audio|Prod\.?|Lyrics?)\b/gi, '')
            .replace(/[_|•]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (isRepostChannel) {
            author = '';
        }

        // Remove bracketed/parenthesized noise like (Official Video), [Lyrics], (feat. X), [4K Remaster]
        title = title
            .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
            .replace(/['"“”‘’]/g, '')
            .replace(/\b(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer)|live\s*(?:at|from|in|on|performance|session).*|summertime\s*ball.*|world\s*cup\s*(?:song|anthem)?\s*\d{0,4}|greatest\s*hits\s*\d{0,4}.*|full\s*album.*|the\s*best\s*of\s+.*|lyric\s*video|lyrics?|visualizer|audio|video|hd|hq|4k|remastered|explicit|clean\s*version|slowed|reverb|sped\s*up|nightcore|bass\s*boosted|tiktok\s*viral|prod\.?\s+by\s+\S+)\b/gi, ' ')
            .replace(/\b(?:ft\.?|feat\.?|featuring)\s+[^-–—|]+/gi, ' ')
            .replace(/[|•"_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Many YouTube/SoundCloud titles are "Artist - Song Title"
        let extractedArtist = '';
        let extractedTrack = title;
        const dashParts = title.split(/\s+[-–—:]\s+/);
        if (dashParts.length >= 2) {
            extractedArtist = dashParts[0].trim();
            extractedTrack = dashParts.slice(1).join(' ').trim();
            // If there were multiple dashes like "PINK - Greatest Hits", strip trailing duplicate artist or compilation text
            if (dashParts.length >= 3 && extractedTrack.toLowerCase().includes(extractedArtist.toLowerCase())) {
                extractedTrack = dashParts[1].trim();
            }
        }

        const primaryArtist = extractedArtist || author;
        const secondaryArtist = extractedArtist && author && extractedArtist.toLowerCase() !== author.toLowerCase() ? author : '';
        const cleanPrimaryArtist = primaryArtist
            .replace(/\b(?:ft\.?|feat\.?|featuring|&|x|,|and|with)\s+.*/i, '')
            .replace(/p!nk/gi, 'Pink')
            .trim();

        return {
            trackName: extractedTrack || title,
            fullTitle: title,
            artistName: cleanPrimaryArtist || primaryArtist,
            rawArtist: secondaryArtist || author,
            hasExplicitDashArtist: Boolean(extractedArtist)
        };
    },

    /**
     * Normalize text into lowercase alphanumeric tokens (preserving 1-char words like "i", "u", "2")
     */
    _tokens(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/['’`]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 0);
    },

    /**
     * Compute bidirectional token similarity (Dice coefficient 0..1)
     */
    _similarity(aStr, bStr) {
        const a = this._tokens(aStr);
        const b = this._tokens(bStr);
        if (a.length === 0 || b.length === 0) return 0;

        const aNorm = a.join(' ');
        const bNorm = b.join(' ');
        if (aNorm === bNorm) return 1.0;

        const bSet = new Set(b);
        let matches = 0;
        for (const token of a) {
            if (bSet.has(token)) matches++;
        }
        return (2 * matches) / (a.length + b.length);
    },

    /**
     * Check if any artist token matches between our metadata and the LRCLIB candidate
     */
    _artistMatches(meta, itemArtist) {
        const candidateTokens = new Set(this._tokens(itemArtist));
        if (candidateTokens.size === 0) return false;

        const pool = [
            ...this._tokens(meta.artistName),
            ...this._tokens(meta.rawArtist),
            ...this._tokens(meta.fullTitle)
        ].filter(t => t.length >= 2);

        if (pool.length === 0) return true;
        for (const t of pool) {
            if (candidateTokens.has(t)) return true;
        }
        return false;
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
            rawTitle = trackOrQuery.cleanTitle || trackOrQuery.title || '';
            rawAuthor = trackOrQuery.cleanAuthor || trackOrQuery.author || '';
            targetSeconds = Number(trackOrQuery.seconds) || 0;
        }

        if (!rawTitle.trim()) return null;

        const meta = this.cleanMetadata(rawTitle, rawAuthor);

        // 1. Try exact LRCLIB /api/get first when we have both trackName and artistName
        if (meta.trackName && meta.artistName) {
            const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(meta.trackName)}&artist_name=${encodeURIComponent(meta.artistName)}${targetSeconds > 0 ? `&duration=${Math.round(targetSeconds)}` : ''}`;
            const exact = await this._requestJson(getUrl);
            if (exact && !exact.code && (exact.syncedLyrics || exact.plainLyrics)) {
                return this._formatResult(exact);
            }
            // Retry /api/get without duration if the video duration had an intro/outro difference
            if (targetSeconds > 0) {
                const getUrlNoDur = `https://lrclib.net/api/get?track_name=${encodeURIComponent(meta.trackName)}&artist_name=${encodeURIComponent(meta.artistName)}`;
                const exactNoDur = await this._requestJson(getUrlNoDur);
                if (exactNoDur && !exactNoDur.code && (exactNoDur.syncedLyrics || exactNoDur.plainLyrics)) {
                    return this._formatResult(exactNoDur);
                }
            }
        }

        // 2. Build ordered search URLs from most specific to broadest
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
        }

        for (const url of urls) {
            const list = await this._requestJson(url);
            if (!Array.isArray(list) || list.length === 0) continue;

            const best = this._pickBestCandidate(list, meta, targetSeconds);
            if (best) {
                return this._formatResult(best);
            }
        }

        // 3. Fallback: Lyrics.ovh for plain lyrics when LRCLIB doesn't have the song
        if (meta.trackName && meta.artistName) {
            const ovh = await this._fetchLyricsOvh(meta.artistName, meta.trackName);
            if (ovh) {
                return {
                    trackName: meta.trackName,
                    artistName: meta.artistName,
                    plainLyrics: ovh,
                    syncedLyrics: null,
                    rawSynced: null
                };
            }
        }

        return null;
    },

    _formatResult(item) {
        const parsedSynced = item.syncedLyrics ? this.parseLrc(item.syncedLyrics) : null;
        return {
            trackName: item.trackName,
            artistName: item.artistName,
            plainLyrics: item.plainLyrics || null,
            syncedLyrics: parsedSynced && parsedSynced.length > 0 ? parsedSynced : null,
            rawSynced: item.syncedLyrics || null
        };
    },

    /**
     * Score and filter LRCLIB results so unrelated songs are strictly rejected
     */
    _pickBestCandidate(list, meta, targetSeconds) {
        let bestItem = null;
        let bestScore = -Infinity;

        for (const item of list) {
            if (!item || (!item.syncedLyrics && !item.plainLyrics)) continue;

            const titleSim = Math.max(
                this._similarity(meta.trackName, item.trackName),
                this._similarity(meta.fullTitle, item.trackName),
                this._similarity(meta.fullTitle, `${item.artistName} ${item.trackName}`)
            );

            // Strictly reject candidates whose title doesn't match
            if (titleSim < 0.5) continue;

            const artistSim = Math.max(
                this._similarity(meta.artistName, item.artistName),
                this._similarity(meta.rawArtist, item.artistName)
            );
            const hasAnyArtistOverlap = this._artistMatches(meta, item.artistName);

            const durationDiff = (targetSeconds > 0 && item.duration > 0) ? Math.abs(targetSeconds - item.duration) : 999;

            // If we have an artist name, strictly require artist overlap so a song with the same title by another artist is never selected!
            if ((meta.artistName || meta.rawArtist) && !hasAnyArtistOverlap) {
                if (titleSim < 0.99 || durationDiff > 2) continue;
            }

            // Reject if duration is off by more than 45 seconds
            if (targetSeconds > 0 && item.duration > 0 && durationDiff > 45) continue;

            let score = titleSim * 65 + artistSim * 40 + (hasAnyArtistOverlap ? 15 : 0);

            if (item.syncedLyrics) score += 15;

            if (durationDiff <= 3) score += 25;
            else if (durationDiff <= 8) score += 15;
            else if (durationDiff <= 15) score += 5;
            else if (durationDiff < 999) score -= 15;

            if (score > bestScore) {
                bestScore = score;
                bestItem = item;
            }
        }

        return bestScore >= 55 ? bestItem : null;
    },

    _fetchLyricsOvh(artist, title) {
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        return new Promise((resolve) => {
            const req = https.get(url, { headers: { 'User-Agent': 'GrandwayMusic/2.5' } }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json && json.lyrics && typeof json.lyrics === 'string' && json.lyrics.trim().length > 20) {
                            resolve(json.lyrics.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
                        } else {
                            resolve(null);
                        }
                    } catch (_) {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.setTimeout(3500, () => {
                req.destroy();
                resolve(null);
            });
        });
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
     * Parses LRC string [mm:ss.xx] Lyric text into a sorted array of { time: seconds, text: string }
     */
    parseLrc(lrcText) {
        if (!lrcText) return [];
        const lines = lrcText.split(/\r?\n/);
        const results = [];
        const timeTagRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

        for (const rawLine of lines) {
            const matches = [...rawLine.matchAll(timeTagRegex)];
            if (matches.length === 0) continue;

            const text = rawLine.replace(timeTagRegex, '').trim();
            for (const match of matches) {
                const mins = parseInt(match[1], 10);
                const secs = parseInt(match[2], 10);
                const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
                const totalSeconds = mins * 60 + secs + (ms / 1000);
                results.push({ time: totalSeconds, text });
            }
        }

        results.sort((a, b) => a.time - b.time);
        return results;
    }
};

module.exports = lyricsService;
