const { Shoukaku, Connectors } = require('shoukaku');
const config = require('../config');
const yts = require('yt-search');
const lyricsService = require('./lyricsService');

/**
 * Strips live/event/channel suffixes and quotes from video titles and author names
 * so SoundCloud, Deezer, Spotify, and YouTube Music searches resolve the clean studio track.
 */
function buildCleanSearchString(titleRaw, authorRaw) {
    let title = String(titleRaw || '')
        .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
        .replace(/['"“”‘’]/g, '')
        .replace(/\b(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer)|live\s*(?:at|from|in|on|performance|session).*|summertime\s*ball.*|capital\s*fm.*|bbc\s*radio.*|vevo|4k|hd|hq|lyrics?|explicit|clean\s*version|audio)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let author = String(authorRaw || '')
        .replace(/\s*-\s*Topic$|VEVO$|Official$/gi, '')
        .replace(/\b(?:capital\s*fm|bbc\s*radio\s*1?|vevo|records|entertainment|music)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    // If title already contains "Artist - Song", don't duplicate or append a noisy uploader name
    if (title.includes(' - ')) {
        const parts = title.split(' - ').map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0]} ${parts[1]}`.replace(/\s+/g, ' ').trim();
        }
    }

    if (author && title.toLowerCase().includes(author.toLowerCase())) {
        return title;
    }

    return `${title} ${author}`.replace(/\s+/g, ' ').trim() || String(titleRaw || '').trim();
}

/**
 * Filter Presets mapped directly to Lavalink Audio Filters (equalizer, timescale, karaoke)
 * Executed remotely on the Lavalink server with 0 CPU & 0 RAM load on the bot container!
 */
const LAVALINK_PRESETS = {
    bassboost_low: {
        equalizer: [
            { band: 0, gain: 0.15 },
            { band: 1, gain: 0.10 },
            { band: 2, gain: 0.05 }
        ]
    },
    bassboost_medium: {
        equalizer: [
            { band: 0, gain: 0.30 },
            { band: 1, gain: 0.20 },
            { band: 2, gain: 0.10 }
        ]
    },
    bassboost_hard: {
        equalizer: [
            { band: 0, gain: 0.45 },
            { band: 1, gain: 0.30 },
            { band: 2, gain: 0.15 }
        ]
    },
    bassboost_extreme: {
        equalizer: [
            { band: 0, gain: 0.65 },
            { band: 1, gain: 0.45 },
            { band: 2, gain: 0.25 }
        ]
    },
    nightcore: {
        timescale: { speed: 1.25, pitch: 1.25, rate: 1.0 }
    },
    vaporwave: {
        timescale: { speed: 0.85, pitch: 0.80, rate: 1.0 }
    },
    karaoke: {
        karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 }
    },
    treble_boost: {
        equalizer: [
            { band: 10, gain: 0.20 },
            { band: 11, gain: 0.25 },
            { band: 12, gain: 0.30 },
            { band: 13, gain: 0.35 }
        ]
    },
    pop: {
        equalizer: [
            { band: 0, gain: -0.05 },
            { band: 1, gain: 0.10 },
            { band: 2, gain: 0.15 },
            { band: 3, gain: 0.12 },
            { band: 4, gain: 0.05 }
        ]
    },
    rock: {
        equalizer: [
            { band: 0, gain: 0.15 },
            { band: 1, gain: 0.10 },
            { band: 2, gain: -0.08 },
            { band: 3, gain: -0.10 },
            { band: 4, gain: 0.05 },
            { band: 10, gain: 0.10 },
            { band: 12, gain: 0.15 }
        ]
    },
    '8d': {
        rotation: { rotationHz: 0.25 },
        equalizer: [
            { band: 0, gain: 0.12 },
            { band: 1, gain: 0.08 }
        ]
    },
    pingpong_fast: {
        rotation: { rotationHz: 0.55 },
        equalizer: [
            { band: 0, gain: 0.12 },
            { band: 1, gain: 0.08 }
        ]
    },
    lofi: {
        lowPass: { smoothing: 18.0 },
        timescale: { speed: 0.94, pitch: 0.95, rate: 1.0 },
        equalizer: [
            { band: 0, gain: 0.15 },
            { band: 1, gain: 0.10 },
            { band: 11, gain: -0.20 },
            { band: 12, gain: -0.25 }
        ]
    },
    tremolo: {
        tremolo: { frequency: 4.0, depth: 0.65 },
        vibrato: { frequency: 4.0, depth: 0.4 }
    }
};

/**
 * Per-Guild Music Subscription & Queue Manager backed by Lavalink
 */
class GuildMusicQueue {
    constructor(guildId) {
        this.guildId = guildId;
        this.voiceChannelId = null;
        this.voiceChannelName = 'None';
        this.textChannel = null;
        this.player = null; // Shoukaku Player instance
        this.queue = [];
        this.history = [];
        this.currentTrack = null;
        this.volume = 100;
        this.loopMode = 'off'; // 'off' | 'track' | 'queue'
        this.isPlaying = false;
        this.disconnectTimeout = null;

        // DSP Filter States
        this.speed = 1.0;
        this.activeFilter = 'none';
        this.playbackStartTime = 0;
        this.pausedAt = 0;

        // Synced Lyrics, Autoplay & Sleep Timer
        this.currentLyrics = null;
        this.lyricsLoading = false;
        this.sleepTimeout = null;
        this.sleepEndsAt = null;
        this.skipVotes = new Set();
        this.autoplay = false;
    }

    setupPlayerListeners() {
        if (!this.player) return;

        // Clean up any existing listeners on this player instance to prevent duplicate triggers
        this.player.removeAllListeners('start');
        this.player.removeAllListeners('end');
        this.player.removeAllListeners('exception');
        this.player.removeAllListeners('stuck');
        this.player.removeAllListeners('closed');

        this.player.on('start', () => {
            this.isPlaying = true;
            this.pausedAt = 0;
            if (!this._seeking) {
                this.playbackStartTime = Date.now();
            }
            this._seeking = false;
            this.skipVotes.clear();
            musicManager.updateDiscordPresence(this.currentTrack ? this.currentTrack.title : null);

            if (this.textChannel && this.currentTrack && !this._suppressNextStartEmbed) {
                const { buildNowPlayingEmbed, buildMusicControlRow } = require('./musicUtils');
                const embed = buildNowPlayingEmbed(this.currentTrack, this);
                const row = buildMusicControlRow(this);
                this.textChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
            }
            this._suppressNextStartEmbed = false;
        });

        this.player.on('end', async (data) => {
            // Shoukaku v4 TrackEndEvent: data.reason can be 'finished', 'loadFailed', 'stopped', 'replaced', 'cleanup'
            const reason = data && typeof data === 'object' ? (data.reason || data.type) : data;
            if (reason === 'replaced' || reason === 'cleanup') return;

            // If stop() was explicitly called, currentTrack is already cleared; do not advance queue
            if (this._stopping) {
                this._stopping = false;
                return;
            }

            const finishedTrack = this.currentTrack;
            this.skipVotes.clear();

            // Automatic recovery if the node failed to decode the track stream
            if (reason === 'loadFailed' && finishedTrack) {
                const decodeAttempt = (finishedTrack._decodeRetries || 0) + 1;
                finishedTrack._decodeRetries = decodeAttempt;
                finishedTrack.encoded = null;
                finishedTrack.encodedNode = null;

                // Attempt 1: Re-encode using YouTube Music stream on the current node
                if (decodeAttempt === 1) {
                    console.warn(`[LAVALINK RECOVERY] Track "${finishedTrack.title}" failed to decode on "${this.player?.node?.name}". Retrying with YouTube Music stream...`);
                    finishedTrack._preferAltSource = true;
                    finishedTrack._forcePrefix = 'ytmsearch:';
                    this._suppressNextStartEmbed = true;
                    await this.playTrack(finishedTrack, 0, 0);
                    return;
                }

                // Attempt 2: Re-encode using Apple Music / Spotify stream on the current node
                if (decodeAttempt === 2) {
                    console.warn(`[LAVALINK RECOVERY] Track "${finishedTrack.title}" failed on Attempt 1. Retrying with Apple Music / Spotify mirror stream...`);
                    finishedTrack._preferAltSource = true;
                    finishedTrack._forcePrefix = 'amsearch:';
                    this._suppressNextStartEmbed = true;
                    await this.playTrack(finishedTrack, 0, 0);
                    return;
                }

                // Attempt 3: Re-encode using standard YouTube search stream on the current node
                if (decodeAttempt === 3) {
                    console.warn(`[LAVALINK RECOVERY] Track "${finishedTrack.title}" failed on Attempt 2. Retrying with alternate YouTube stream...`);
                    finishedTrack._preferAltSource = true;
                    finishedTrack._forcePrefix = 'ytsearch:';
                    this._suppressNextStartEmbed = true;
                    await this.playTrack(finishedTrack, 0, 0);
                    return;
                }

                // Attempt 4: Only fail over to another node if a DIFFERENT healthy connected node actually exists!
                if (decodeAttempt === 4 && this.voiceChannel && musicManager.shoukaku) {
                    const badNodeName = this.player && this.player.node ? this.player.node.name : null;
                    const otherNodes = musicManager.getHealthyNodes().filter(n => n.name !== badNodeName);
                    if (otherNodes.length > 0) {
                        console.warn(`[LAVALINK RECOVERY] Node "${badNodeName}" failed to decode "${finishedTrack.title}". Failing over to "${otherNodes[0].name}"...`);
                        if (badNodeName) musicManager.markBad(badNodeName, 120000);
                        try { await musicManager.shoukaku.leaveVoiceChannel(this.guildId); } catch (_) {}
                        this.player = null;
                        try {
                            await this.connect(this.voiceChannel, this.textChannel);
                            this._suppressNextStartEmbed = true;
                            await this.playTrack(finishedTrack, 0, 1);
                            return;
                        } catch (_) {}
                    } else {
                        console.warn(`[LAVALINK RECOVERY] Track "${finishedTrack.title}" could not be decoded on "${badNodeName}" and no alternate nodes are online. Keeping voice connection alive.`);
                    }
                }
            }

            if (finishedTrack) {
                delete finishedTrack._decodeRetries;
                delete finishedTrack._preferAltSource;
                delete finishedTrack._forcePrefix;
                this.history.unshift({
                    ...finishedTrack,
                    playedAt: new Date().toISOString()
                });
                if (this.history.length > 50) this.history.pop();

                if (reason !== 'stopped' && reason !== 'loadFailed') {
                    if (this.loopMode === 'track') {
                        this._suppressNextStartEmbed = true;
                        await this.playTrack(finishedTrack);
                        return;
                    } else if (this.loopMode === 'queue') {
                        this.queue.push(finishedTrack);
                    }
                }
            }

            this.currentTrack = null;
            this.currentLyrics = null;
            this.pausedAt = 0;

            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                await this.playTrack(nextTrack);
            } else if (this.autoplay && finishedTrack && reason !== 'stopped') {
                try {
                    const related = await musicManager.findRelatedTrack(finishedTrack, this.history);
                    if (related) {
                        await this.playTrack(related);
                        return;
                    }
                } catch (_) {}
                this.isPlaying = false;
                musicManager.updateDiscordPresence();
                this.scheduleDisconnect();
            } else {
                this.isPlaying = false;
                musicManager.updateDiscordPresence();
                this.scheduleDisconnect();
            }
        });

        const handleTrackFault = (label, data) => {
            console.warn(`[LAVALINK ${label} Guild ${this.guildId}]`, data && (data.exception?.message || data.message || JSON.stringify(data)));
            // Note: Lavalink also emits 'end' with reason 'loadFailed' right after 'exception',
            // so we only force-advance if 'stuck' occurred (where 'end' hasn't fired yet).
            if (label === 'STUCK' && this.player) {
                this.player.stopTrack().catch(() => {});
            }
        };

        this.player.on('exception', (data) => handleTrackFault('EXCEPTION', data));
        this.player.on('stuck', (data) => handleTrackFault('STUCK', data));

        this.player.on('closed', (data) => {
            console.warn(`[LAVALINK VOICE CLOSED Guild ${this.guildId}]`, data && data.code ? `Code ${data.code}: ${data.reason || ''}` : '');
            this.isPlaying = false;
            this.pausedAt = 0;
            this.player = null;
        });
    }

    scheduleDisconnect() {
        if (this.disconnectTimeout) clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = setTimeout(async () => {
            if (!this.isPlaying && this.queue.length === 0) {
                await this.destroy();
                if (this.textChannel) {
                    this.textChannel.send('👋 Left voice channel due to inactivity. Thanks for listening!').catch(() => {});
                }
            }
        }, 180000); // 3 minutes
    }

    cancelDisconnect() {
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
            this.disconnectTimeout = null;
        }
    }

    async connect(voiceChannel, textChannel) {
        this.cancelDisconnect();
        if (textChannel && textChannel.isTextBased && textChannel.isTextBased()) {
            this.textChannel = textChannel;
        }
        const switchingChannel = this.voiceChannelId && this.voiceChannelId !== voiceChannel.id;
        this.voiceChannelId = voiceChannel.id;
        this.voiceChannelName = voiceChannel.name;
        this.voiceChannel = voiceChannel;

        if (!musicManager.shoukaku) {
            throw new Error('Lavalink audio client is not initialized or still connecting.');
        }

        // Verify the bot is actually still in a voice channel if this.player exists
        const botMember = voiceChannel.guild && voiceChannel.guild.members ? voiceChannel.guild.members.me : null;
        const botCurrentChannelId = botMember && botMember.voice ? botMember.voice.channelId : null;

        if (this.player && (!this.player.node || this.player.node.state !== 1 || !botCurrentChannelId)) {
            try { await musicManager.shoukaku.leaveVoiceChannel(this.guildId); } catch (_) {}
            this.player = null;
        }

        // If user requested moving the bot to a different voice channel while already connected
        if (this.player && switchingChannel && botMember && botMember.voice) {
            try {
                await botMember.voice.setChannel(voiceChannel.id);
                return this.player;
            } catch (_) {
                try { await musicManager.shoukaku.leaveVoiceChannel(this.guildId); } catch (__) {}
                this.player = null;
            }
        }

        if (!this.player) {
            // Try each healthy connected node in turn; some public nodes reject sessions with 403
            let nodes = musicManager.getHealthyNodes();
            if (nodes.length === 0) {
                // If nodes are still connecting on bot startup, wait up to 3 seconds for a node to become ready
                if (musicManager.shoukaku && musicManager.shoukaku.nodes.size > 0) {
                    await new Promise(r => setTimeout(r, 1500));
                    nodes = musicManager.getHealthyNodes();
                }
            }

            if (nodes.length === 0) {
                const totalNodes = musicManager.shoukaku ? musicManager.shoukaku.nodes.size : 0;
                throw new Error(`No Lavalink audio nodes are connected yet (${totalNodes} configured). Please wait a moment while the bot establishes the audio connection.`);
            }

            let lastErr = null;
            for (const node of nodes) {
                try {
                    try { await musicManager.shoukaku.leaveVoiceChannel(this.guildId); } catch (_) {}
                    musicManager.preferredNodeName = node.name;
                    this.player = await musicManager.shoukaku.joinVoiceChannel({
                        guildId: this.guildId,
                        channelId: voiceChannel.id,
                        shardId: voiceChannel.guild.shardId || 0,
                        deaf: true
                    });
                    musicManager.preferredNodeName = null;
                    this.setupPlayerListeners();
                    lastErr = null;
                    break;
                } catch (err) {
                    musicManager.preferredNodeName = null;
                    lastErr = err;
                    const actualFailedNode = (err && err.nodeName) || node.name;
                    console.warn(`[LAVALINK] Node "${actualFailedNode}" rejected voice join (${err.status || err.message}), marking bad and trying next node...`);
                    musicManager.markBad(actualFailedNode);
                    try { await musicManager.shoukaku.leaveVoiceChannel(this.guildId); } catch (_) {}
                    this.player = null;
                }
            }

            if (lastErr) {
                throw new Error('All Lavalink nodes rejected the voice connection. Please try again shortly.');
            }
        }

        return this.player;
    }

    async _encodeSingleTrack(track, node, _retried = false) {
        if (!track || !node) return null;
        if (!_retried && track.encoded && track.encodedNode === node.name) {
            return track.encoded;
        }

        const searchStr = buildCleanSearchString(track.title, track.author);
        const isDirectNonYtUrl = track.url
            && (track.url.startsWith('http://') || track.url.startsWith('https://'))
            && !/(?:youtube\.com|youtu\.be)/i.test(track.url);

        const queriesToTry = [];
        if (track._forcePrefix && searchStr) {
            queriesToTry.push(`${track._forcePrefix}${searchStr}`);
        }
        if (isDirectNonYtUrl && !track._preferAltSource) {
            queriesToTry.push(track.url);
        }
        if (searchStr) {
            // Prioritize Spotify (LavaSrc), YouTube Music, and Apple Music first (100% playable streams on MilloHost)
            if (!queriesToTry.includes(`spsearch:${searchStr}`)) queriesToTry.push(`spsearch:${searchStr}`);
            if (!queriesToTry.includes(`ytmsearch:${searchStr}`)) queriesToTry.push(`ytmsearch:${searchStr}`);
            if (!queriesToTry.includes(`amsearch:${searchStr}`)) queriesToTry.push(`amsearch:${searchStr}`);
            if (!queriesToTry.includes(`ytsearch:${searchStr}`)) queriesToTry.push(`ytsearch:${searchStr}`);
            if (!queriesToTry.includes(`scsearch:${searchStr}`)) queriesToTry.push(`scsearch:${searchStr}`);
        }
        if (track.url && (track.url.startsWith('http://') || track.url.startsWith('https://')) && !queriesToTry.includes(track.url)) {
            queriesToTry.push(track.url);
        }

        for (const qTarget of queriesToTry) {
            try {
                const res = await node.rest.resolve(qTarget);
                if (res && res.data && res.loadType !== 'empty' && res.loadType !== 'error') {
                    const candidates = Array.isArray(res.data)
                        ? res.data
                        : (res.data.tracks || [res.data]);
                    const targetSec = track.seconds || 0;
                    const chosen = candidates.find(c => {
                        if (!c || !c.encoded) return false;
                        if (c.pluginInfo && c.pluginInfo.isPreview) return false;
                        const cSec = Math.floor((c.info?.length || 0) / 1000);
                        if (targetSec > 120 && cSec > 0 && cSec < 60) return false;
                        return true;
                    }) || candidates[0];

                    if (chosen && chosen.encoded) {
                        track.encoded = chosen.encoded;
                        track.encodedNode = node.name;
                        const info = chosen.info || {};
                        if (info.title) track.cleanTitle = info.title;
                        if (info.author) track.cleanAuthor = info.author;
                        if (info.artworkUrl && !track.thumbnail) track.thumbnail = info.artworkUrl;
                        const streamSecs = Math.floor((info.length || 0) / 1000);
                        if (streamSecs > 15) {
                            track.seconds = streamSecs;
                            track.duration = musicManager.formatSeconds(streamSecs);
                        }
                        return chosen.encoded;
                    }
                }
            } catch (_) {}
        }
        return null;
    }

    preEncodeNextTrack() {
        if (!this.player || !this.player.node || this.queue.length === 0) return;
        const next = this.queue[0];
        if (!next || (next.encoded && next.encodedNode === this.player.node.name)) return;
        this._encodeSingleTrack(next, this.player.node, false).catch(() => {});
    }

    async playTrack(track, seekSeconds = 0, _retried = false) {
        if (!track) return;
        this.cancelDisconnect();
        this._stopping = false;
        const isSameTrackRetry = this.currentTrack && this.currentTrack.url === track.url && (this.currentLyrics || this.lyricsLoading);
        this.currentTrack = track;
        this.isPlaying = true;
        this.pausedAt = 0;
        this._seeking = seekSeconds > 0;
        this.playbackStartTime = Date.now() - (seekSeconds * 1000);

        if (!isSameTrackRetry) {
            this.currentLyrics = null;
            this.lyricsLoading = true;
        }

        try {
            if (!this.player && this.voiceChannel) {
                await this.connect(this.voiceChannel, this.textChannel);
            }
            if (!this.player) {
                throw new Error('Voice player is not connected.');
            }

            // Ensure track is encoded by the active player's own node (and populates cleanTitle / cleanAuthor / exact stream duration)
            const playerNodeName = this.player.node ? this.player.node.name : null;
            const trackEncoded = await this._encodeSingleTrack(track, this.player.node, Boolean(_retried));

            if (!trackEncoded) {
                throw new Error(`Node "${playerNodeName || 'unknown'}" could not encode track stream`);
            }

            // Fetch synced lyrics using the resolved studio metadata & exact audio duration
            if (!isSameTrackRetry) {
                const trackUrl = track.url;
                lyricsService.fetchLyrics(track).then(res => {
                    if (this.currentTrack && this.currentTrack.url === trackUrl) {
                        this.currentLyrics = res ? { ...res, trackUrl } : null;
                        this.lyricsLoading = false;
                    }
                }).catch(() => {
                    if (this.currentTrack && this.currentTrack.url === trackUrl) {
                        this.lyricsLoading = false;
                    }
                });
            }

            // Play track via Lavalink
            await this.player.playTrack({
                track: { encoded: trackEncoded },
                position: seekSeconds * 1000
            });

            // Re-apply volume & filters
            await this.player.setGlobalVolume(this.volume);
            await this.applyFilter(this.activeFilter, this.speed, false);

            // Pre-encode the next queued song in background so transitions are instant
            this.preEncodeNextTrack();
        } catch (err) {
            // The node accepted the voice join but refuses to play (403 / 404 / 5xx / encode failure):
            // Only fail over to another node if a DIFFERENT healthy connected node exists!
            const retryCount = typeof _retried === 'number' ? _retried : (_retried ? 1 : 0);
            const badName = this.player && this.player.node ? this.player.node.name : null;
            const otherNodes = musicManager.getHealthyNodes().filter(n => n.name !== badName);
            if (retryCount < 2 && otherNodes.length > 0 && this.voiceChannel && musicManager.shoukaku) {
                console.warn(`[LAVALINK] Node "${badName || 'unknown'}" failed to play (${err.status || err.message}). Failing over to "${otherNodes[0].name}" (attempt ${retryCount + 1})...`);
                if (badName) musicManager.markBad(badName);
                try { await musicManager.shoukaku.leaveVoiceChannel(this.guildId); } catch (_) {}
                this.player = null;
                try {
                    await this.connect(this.voiceChannel, this.textChannel);
                    return this.playTrack(track, seekSeconds, retryCount + 1);
                } catch (failoverErr) {
                    err = failoverErr;
                }
            }

            console.error('[PLAY TRACK ERROR]', err);
            if (this.textChannel) {
                this.textChannel.send(`❌ Failed to load audio for **${track.title}**: ${err.message}`).catch(() => {});
            }
            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                await this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                musicManager.updateDiscordPresence();
                this.scheduleDisconnect();
            }
        }
    }

    async applyFilter(filterName, customSpeed = null, reseek = true) {
        if (filterName !== undefined) this.activeFilter = filterName;
        if (customSpeed !== null) this.speed = customSpeed;

        if (!this.player) return;

        const filters = {};
        if (this.activeFilter && LAVALINK_PRESETS[this.activeFilter]) {
            Object.assign(filters, LAVALINK_PRESETS[this.activeFilter]);
        }

        if (this.speed && this.speed !== 1.0 && this.activeFilter !== 'nightcore' && this.activeFilter !== 'vaporwave' && this.activeFilter !== 'lofi') {
            const clamped = Math.max(0.5, Math.min(2.0, this.speed));
            filters.timescale = { speed: clamped, pitch: 1.0, rate: 1.0 };
        }

        try {
            if (Object.keys(filters).length === 0) {
                if (typeof this.player.clearFilters === 'function') {
                    await this.player.clearFilters();
                } else {
                    await this.player.setFilters({
                        equalizer: [],
                        karaoke: null,
                        timescale: null,
                        tremolo: null,
                        vibrato: null,
                        rotation: null,
                        distortion: null,
                        channelMix: null,
                        lowPass: null
                    });
                }
            } else {
                // Explicitly null out inactive filter groups so switching from 8D -> Bass Boost stops 8D rotation
                await this.player.setFilters({
                    equalizer: filters.equalizer || [],
                    karaoke: filters.karaoke || null,
                    timescale: filters.timescale || null,
                    tremolo: filters.tremolo || null,
                    vibrato: filters.vibrato || null,
                    rotation: filters.rotation || null,
                    distortion: filters.distortion || null,
                    channelMix: filters.channelMix || null,
                    lowPass: filters.lowPass || null
                });
            }
        } catch (fErr) {
            console.warn('[LAVALINK FILTER WARN]', fErr.message);
        }
    }

    getPlaybackSeconds() {
        if (!this.isPlaying || !this.currentTrack) return 0;
        if (this.pausedAt && this.playbackStartTime) {
            return Math.max(0, Math.floor((this.pausedAt - this.playbackStartTime) / 1000));
        }
        if (this.player && typeof this.player.position === 'number' && this.player.position > 0) {
            return Math.floor(this.player.position / 1000);
        }
        if (this.playbackStartTime) {
            return Math.max(0, Math.floor((Date.now() - this.playbackStartTime) / 1000));
        }
        return 0;
    }

    async setVolume(val) {
        this.volume = Math.max(1, Math.min(200, Number(val) || 100));
        if (this.player) {
            await this.player.setGlobalVolume(this.volume).catch(() => {});
        }
        return this.volume;
    }

    isPausedState() {
        if (this.pausedAt > 0) return true;
        if (this.player && this.player.paused) return true;
        return false;
    }

    async pause() {
        if (this.isPausedState()) return false;
        this.pausedAt = Date.now();
        if (this.player) {
            await this.player.setPaused(true).catch(() => {});
        }
        return true;
    }

    async resume() {
        if (!this.isPausedState()) return false;
        if (this.pausedAt && this.playbackStartTime) {
            this.playbackStartTime += (Date.now() - this.pausedAt);
        }
        this.pausedAt = 0;
        if (this.player) {
            await this.player.setPaused(false).catch(() => {});
        }
        return true;
    }

    async seek(seconds) {
        if (!this.player || !this.currentTrack) return false;
        const maxSec = this.currentTrack.seconds || 0;
        const clampedSec = maxSec > 0 ? Math.max(0, Math.min(maxSec, Math.floor(seconds))) : Math.max(0, Math.floor(seconds));
        const targetMs = clampedSec * 1000;

        this._seeking = true;
        this.playbackStartTime = Date.now() - targetMs;
        if (this.pausedAt) {
            this.pausedAt = Date.now();
        }

        if (typeof this.player.seekTo === 'function') {
            await this.player.seekTo(targetMs).catch(() => {});
        } else if (this.player.playTrack && this.currentTrack.encoded) {
            this._suppressNextStartEmbed = true;
            await this.player.playTrack({ track: { encoded: this.currentTrack.encoded }, position: targetMs }).catch(() => {});
        }
        return true;
    }

    async previous() {
        if (!this.history || this.history.length === 0) return null;
        const prevTrack = this.history.shift();
        if (this.currentTrack) {
            this.queue.unshift(this.currentTrack);
        }
        await this.playTrack(prevTrack);
        return prevTrack;
    }

    async skip() {
        if (!this.currentTrack) return null;
        const skipped = this.currentTrack;
        this.skipVotes.clear();
        if (this.player) {
            await this.player.stopTrack().catch(() => {});
        } else if (this.queue.length > 0) {
            const nextTrack = this.queue.shift();
            await this.playTrack(nextTrack);
        } else {
            this.currentTrack = null;
            this.isPlaying = false;
        }
        return skipped;
    }

    async stop() {
        this._stopping = true;
        this.queue = [];
        this.skipVotes.clear();
        this.currentTrack = null;
        this.currentLyrics = null;
        this.isPlaying = false;
        this.pausedAt = 0;
        if (this.player) {
            await this.player.stopTrack().catch(() => {});
        }
        musicManager.updateDiscordPresence();
        this.scheduleDisconnect();
    }

    shuffle() {
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
    }

    remove(index) {
        if (index < 0 || index >= this.queue.length) return null;
        const removed = this.queue.splice(index, 1)[0];
        if (index === 0) this.preEncodeNextTrack();
        return removed;
    }

    moveToTop(index) {
        if (index <= 0 || index >= this.queue.length) return false;
        const [item] = this.queue.splice(index, 1);
        this.queue.unshift(item);
        this.preEncodeNextTrack();
        return true;
    }

    async playAtIndex(index) {
        if (index < 0 || index >= this.queue.length) return null;
        const [target] = this.queue.splice(index, 1);
        if (this.currentTrack) {
            this.history.unshift({
                ...this.currentTrack,
                playedAt: new Date().toISOString()
            });
            if (this.history.length > 50) this.history.pop();
        }
        await this.playTrack(target);
        return target;
    }

    dedupe() {
        const seen = new Set();
        if (this.currentTrack && this.currentTrack.url) seen.add(this.currentTrack.url);
        const before = this.queue.length;
        this.queue = this.queue.filter(t => {
            const key = t.url || `${t.title}|${t.author}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        this.preEncodeNextTrack();
        return before - this.queue.length;
    }

    setSleepTimer(minutes, textChannel) {
        if (this.sleepTimeout) clearTimeout(this.sleepTimeout);
        if (!minutes || minutes <= 0) {
            this.sleepTimeout = null;
            this.sleepEndsAt = null;
            return false;
        }

        this.sleepEndsAt = Date.now() + (minutes * 60 * 1000);
        this.sleepTimeout = setTimeout(async () => {
            if (textChannel) {
                textChannel.send('😴 **Sleep Timer Ended:** Music playback stopped and disconnected. Goodnight!').catch(() => {});
            }
            await this.stop();
            await this.destroy();
        }, minutes * 60 * 1000);
        return true;
    }

    cancelSleepTimer() {
        if (this.sleepTimeout) {
            clearTimeout(this.sleepTimeout);
            this.sleepTimeout = null;
            this.sleepEndsAt = null;
            return true;
        }
        return false;
    }

    async destroy() {
        this.cancelSleepTimer();
        this.cancelDisconnect();
        this.queue = [];
        this.currentTrack = null;
        this.currentLyrics = null;
        this.isPlaying = false;
        musicManager.updateDiscordPresence();
        if (musicManager.shoukaku && this.player) {
            try {
                await musicManager.shoukaku.leaveVoiceChannel(this.guildId);
            } catch (_) {}
            this.player = null;
        }
        musicManager.queues.delete(this.guildId);
    }
}

/**
 * Global Music Manager backed by Shoukaku v4
 */
const musicManager = {
    queues: new Map(),
    clientRef: null,
    shoukaku: null,
    badNodes: new Map(),
    preferredNodeName: null,

    markBad(nodeName, ttlMs = 45000) {
        if (!nodeName) return;
        this.badNodes.set(nodeName, Date.now() + ttlMs);
    },

    getHealthyNodes() {
        if (!this.shoukaku) return [];
        const now = Date.now();
        for (const [name, exp] of this.badNodes.entries()) {
            if (now >= exp) this.badNodes.delete(name);
        }
        const connected = Array.from(this.shoukaku.nodes.values()).filter(n => n.state === 1);
        const healthy = connected.filter(n => !this.badNodes.has(n.name));
        if (healthy.length > 0) return healthy;
        // If all connected nodes were quarantined, clear quarantine immediately so playback can still be attempted
        this.badNodes.clear();
        return connected;
    },

    getNodesStatus() {
        if (!this.shoukaku) return [];
        const now = Date.now();
        return Array.from(this.shoukaku.nodes.values()).map(n => ({
            name: n.name,
            connected: n.state === 1,
            quarantined: this.badNodes.has(n.name) && this.badNodes.get(n.name) > now,
            players: n.stats ? n.stats.playingPlayers || 0 : 0,
            ping: n.ping || 0
        }));
    },

    async findRelatedTrack(seedTrack, history = []) {
        if (!seedTrack) return null;
        const playedUrls = new Set((history || []).map(h => h.url));
        if (seedTrack.url) playedUrls.add(seedTrack.url);

        const cleanArtist = (seedTrack.author || '').replace(/VEVO|Official|Topic|-/gi, '').trim();
        const searchQuery = cleanArtist ? `${cleanArtist} popular songs` : `${seedTrack.title} mix`;
        const res = await this.resolveQuery(searchQuery, seedTrack.requester || { id: 'AUTOPLAY', tag: '📻 Autoplay DJ' });
        const candidates = res.results || (res.track ? [res.track] : []);
        const pick = candidates.find(t => t && t.url && !playedUrls.has(t.url)) || candidates[1] || candidates[0];
        if (!pick) return null;
        return {
            ...pick,
            requester: { id: 'AUTOPLAY', tag: '📻 Autoplay DJ', avatar: null }
        };
    },

    init(client) {
        this.clientRef = client;

        const nodes = config.lavalinkNodes || [
            {
                name: 'Trinium-SSL',
                url: 'lavalink-v4.triniumhost.com:443',
                auth: 'free',
                secure: true
            }
        ];

        this.shoukaku = new Shoukaku(
            new Connectors.DiscordJS(client),
            nodes,
            {
                moveOnDisconnect: false,
                resume: false,
                reconnectTries: 3,
                reconnectInterval: 30,
                nodeResolver: (nodesMap) => {
                    if (this.preferredNodeName) {
                        const preferred = nodesMap.get(this.preferredNodeName);
                        if (preferred && preferred.state === 1) return preferred;
                    }
                    const healthy = this.getHealthyNodes();
                    return healthy[0] || Array.from(nodesMap.values()).find(n => n.state === 1) || null;
                }
            }
        );

        this.shoukaku.on('ready', (name) => {
            console.log(`🎵 [LAVALINK] Node "${name}" connected and ready!`);
        });

        this.shoukaku.on('error', (name, error) => {
            console.warn(`⚠️ [LAVALINK] Node "${name}" encountered an error:`, error.message || error);
        });

        this.shoukaku.on('close', (name, code, reason) => {
            const reasonStr = String(reason || 'No reason');
            console.warn(`[LAVALINK] Node "${name}" closed (code ${code}): ${reasonStr}`);
            // Stop infinite reconnect spam if a public node rate-limits or bans this bot ID (code 4000)
            if (code === 4000 || /too many websocket/i.test(reasonStr)) {
                console.warn(`🛑 [LAVALINK] Removing rate-limited node "${name}" from pool to prevent reconnect loop.`);
                try {
                    this.shoukaku.removeNode(name, 'Rate-limited by remote host');
                } catch (_) {}
            }
        });

        this.shoukaku.on('disconnect', (name, count) => {
            console.warn(`[LAVALINK] Node "${name}" disconnected. Reconnect attempt ${count}...`);
        });
    },

    updateDiscordPresence(trackTitle = null) {
        if (!this.clientRef || !this.clientRef.user) return;
        try {
            const { ActivityType } = require('discord.js');
            if (trackTitle) {
                this.clientRef.user.setActivity(trackTitle.slice(0, 120), { type: ActivityType.Listening });
            } else {
                this.clientRef.user.setActivity('Grandway Shopping 🛒', { type: ActivityType.Watching });
            }
        } catch (_) {}
    },

    getQueue(guildId) {
        if (!this.queues.has(guildId)) {
            this.queues.set(guildId, new GuildMusicQueue(guildId));
        }
        return this.queues.get(guildId);
    },

    deleteQueue(guildId) {
        if (this.queues.has(guildId)) {
            const q = this.queues.get(guildId);
            q.destroy();
            this.queues.delete(guildId);
        }
    },

    /**
     * Resolves queries using Lavalink REST with graceful fallback to yt-search.
     * Note: We intentionally do NOT pre-bind YouTube `encoded` strings here so `playTrack()`
     * always encodes via clean SoundCloud / Deezer / Spotify audio streams on the active voice node,
     * completely avoiding YouTube googlevideo HTTP 403 / cipher blocks on public Lavalink servers!
     */
    async resolveQuery(rawQuery, requester) {
        let cleanQuery = rawQuery.trim();
        const isDirectUrl = cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://');
        const isYouTubeUrl = isDirectUrl && /(?:youtube\.com|youtu\.be)/i.test(cleanQuery);
        const playlistMatch = cleanQuery.match(/[?&]list=([a-zA-Z0-9_-]+)/);

        // 1. If it's a direct non-YouTube URL (e.g. Spotify / SoundCloud / Apple Music / Deezer link), resolve on healthy node
        const activeNodes = this.getHealthyNodes();
        if (isDirectUrl && !isYouTubeUrl) {
            for (const node of activeNodes) {
                try {
                    const res = await node.rest.resolve(cleanQuery);
                    if (res && res.data) {
                        if (res.loadType === 'track') {
                            const t = res.data;
                            const info = t.info || {};
                            return {
                                type: 'track',
                                track: {
                                    title: info.title || 'Unknown Title',
                                    url: info.uri || cleanQuery,
                                    duration: this.formatSeconds(Math.floor((info.length || 0) / 1000)),
                                    seconds: Math.floor((info.length || 0) / 1000),
                                    author: info.author || 'Unknown Artist',
                                    thumbnail: info.artworkUrl || null,
                                    encoded: null,
                                    encodedNode: null,
                                    requester: {
                                        id: requester.id,
                                        tag: requester.tag || requester.username,
                                        avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                                    }
                                }
                            };
                        } else if (res.loadType === 'playlist') {
                            const playlistData = res.data;
                            const tracks = (playlistData.tracks || []).map(t => {
                                const info = t.info || {};
                                return {
                                    title: info.title || 'Unknown Title',
                                    url: info.uri || cleanQuery,
                                    duration: this.formatSeconds(Math.floor((info.length || 0) / 1000)),
                                    seconds: Math.floor((info.length || 0) / 1000),
                                    author: info.author || 'Unknown Artist',
                                    thumbnail: info.artworkUrl || null,
                                    encoded: null,
                                    encodedNode: null,
                                    requester: {
                                        id: requester.id,
                                        tag: requester.tag || requester.username,
                                        avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                                    }
                                };
                            });
                            return {
                                type: 'playlist',
                                title: (playlistData.info && playlistData.info.name) || 'Playlist',
                                tracks
                            };
                        }
                    }
                } catch (_) {
                    continue;
                }
            }
        }

        // 2. Check if query is a YouTube playlist URL (not a single watch?v=...&list=RD... mix link)
        const ytVideoIdMatch = cleanQuery.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (playlistMatch && !ytVideoIdMatch) {
            try {
                const listId = playlistMatch[1];
                const pResult = await yts({ listId });
                if (pResult && Array.isArray(pResult.videos) && pResult.videos.length > 0) {
                    const tracks = pResult.videos.map(v => ({
                        title: v.title || 'Unknown Title',
                        url: v.url || `https://www.youtube.com/watch?v=${v.videoId}`,
                        duration: v.duration?.timestamp || this.formatSeconds(v.duration?.seconds || 0),
                        seconds: v.duration?.seconds || 0,
                        author: v.author ? v.author.name : (pResult.author ? pResult.author.name : 'Unknown Artist'),
                        thumbnail: v.thumbnail || null,
                        encoded: null,
                        encodedNode: null,
                        requester: {
                            id: requester.id,
                            tag: requester.tag || requester.username,
                            avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                        }
                    }));
                    return {
                        type: 'playlist',
                        title: pResult.title || 'YouTube Playlist',
                        tracks
                    };
                }
            } catch (_) {}
        }

        // 3. If it's a single YouTube video URL (from user paste or web dashboard autocomplete), look up videoId via yt-search
        if (ytVideoIdMatch) {
            try {
                const v = await yts({ videoId: ytVideoIdMatch[1] });
                if (v && v.title) {
                    const track = {
                        title: v.title,
                        url: v.url || cleanQuery,
                        duration: v.timestamp || this.formatSeconds(v.seconds || 0),
                        seconds: v.seconds || 0,
                        author: v.author ? v.author.name : 'Unknown Artist',
                        thumbnail: v.thumbnail || `https://img.youtube.com/vi/${ytVideoIdMatch[1]}/hqdefault.jpg`,
                        encoded: null,
                        encodedNode: null,
                        requester: {
                            id: requester.id,
                            tag: requester.tag || requester.username,
                            avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                        }
                    };
                    return { type: 'track', track };
                }
            } catch (_) {}
        }

        // 4. Fast metadata search via yt-search (or Lavalink scsearch if yt-search returns nothing)
        try {
            const searchResult = await yts(cleanQuery);
            if (searchResult && searchResult.videos && searchResult.videos.length > 0) {
                const topVideos = searchResult.videos.slice(0, 5).map(v => ({
                    title: v.title,
                    url: v.url,
                    duration: v.timestamp || this.formatSeconds(v.seconds),
                    seconds: v.seconds || 0,
                    author: v.author ? v.author.name : 'Unknown Artist',
                    thumbnail: v.thumbnail || null,
                    views: v.views ? v.views.toLocaleString() : 'N/A',
                    encoded: null,
                    encodedNode: null,
                    requester: {
                        id: requester.id,
                        tag: requester.tag || requester.username,
                        avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                    }
                }));
                return {
                    type: 'search',
                    results: topVideos,
                    topTrack: topVideos[0]
                };
            }
        } catch (_) {}

        // 5. Final fallback: resolve directly via Lavalink Spotify / YouTube Music search
        for (const node of activeNodes) {
            try {
                const res = await node.rest.resolve(`spsearch:${cleanQuery}`);
                if (res && res.loadType === 'search' && Array.isArray(res.data) && res.data.length > 0) {
                    const topTracks = res.data.slice(0, 5).map(t => {
                        const info = t.info || {};
                        return {
                            title: info.title || 'Unknown Title',
                            url: info.uri || cleanQuery,
                            duration: this.formatSeconds(Math.floor((info.length || 0) / 1000)),
                            seconds: Math.floor((info.length || 0) / 1000),
                            author: info.author || 'Unknown Artist',
                            thumbnail: info.artworkUrl || null,
                            encoded: t.encoded,
                            encodedNode: node.name,
                            requester: {
                                id: requester.id,
                                tag: requester.tag || requester.username,
                                avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                            }
                        };
                    });
                    return {
                        type: 'search',
                        results: topTracks,
                        topTrack: topTracks[0]
                    };
                }
            } catch (_) {}
        }

        return { type: 'empty' };
    },

    formatSeconds(sec) {
        const s = parseInt(sec, 10) || 0;
        const mins = Math.floor(s / 60);
        const remSecs = s % 60;
        return `${mins}:${remSecs.toString().padStart(2, '0')}`;
    }
};

module.exports = musicManager;
module.exports.LAVALINK_PRESETS = LAVALINK_PRESETS;
