const { Shoukaku, Connectors } = require('shoukaku');
const config = require('../config');
const yts = require('yt-search');
const lyricsService = require('./lyricsService');

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

            if (finishedTrack) {
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
            const nodes = musicManager.getHealthyNodes();
            if (nodes.length === 0) {
                throw new Error('No healthy Lavalink nodes are available right now. Try again in a few seconds.');
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

    async playTrack(track, seekSeconds = 0, _retried = false) {
        if (!track) return;
        this.cancelDisconnect();
        this._stopping = false;
        this.currentTrack = track;
        this.currentLyrics = null;
        this.isPlaying = true;
        this.pausedAt = 0;
        this._seeking = seekSeconds > 0;
        this.playbackStartTime = Date.now() - (seekSeconds * 1000);

        // Fetch synced lyrics in background (guarded so stale responses don't overwrite newer tracks)
        const trackUrl = track.url;
        lyricsService.fetchLyrics(`${track.title} ${track.author || ''}`).then(res => {
            if (this.currentTrack && this.currentTrack.url === trackUrl) {
                this.currentLyrics = res;
            }
        }).catch(() => {});

        try {
            if (!this.player && this.voiceChannel) {
                await this.connect(this.voiceChannel, this.textChannel);
            }
            if (!this.player) {
                throw new Error('Voice player is not connected.');
            }

            // Ensure track is encoded by the active player's own node (or re-encode on failover)
            const playerNodeName = this.player.node ? this.player.node.name : null;
            let trackEncoded = (_retried || (track.encodedNode && playerNodeName && track.encodedNode !== playerNodeName))
                ? null
                : track.encoded;

            if (!trackEncoded && this.player.node) {
                const node = this.player.node;
                const queriesToTry = [];
                if (track.url && (track.url.startsWith('http://') || track.url.startsWith('https://'))) {
                    queriesToTry.push(track.url);
                }
                const searchStr = `${track.title || ''} ${track.author || ''}`.trim();
                if (searchStr) {
                    queriesToTry.push(`ytsearch:${searchStr}`);
                    queriesToTry.push(`ytmsearch:${searchStr}`);
                    queriesToTry.push(`scsearch:${searchStr}`);
                }

                for (const qTarget of queriesToTry) {
                    try {
                        const res = await node.rest.resolve(qTarget);
                        if (res && res.data && res.loadType !== 'empty' && res.loadType !== 'error') {
                            trackEncoded = Array.isArray(res.data)
                                ? res.data[0]?.encoded
                                : (res.data.encoded || res.data.tracks?.[0]?.encoded);
                            if (trackEncoded) {
                                track.encoded = trackEncoded;
                                track.encodedNode = node.name;
                                break;
                            }
                        }
                    } catch (_) {}
                }
            }

            if (!trackEncoded) {
                throw new Error(`Node "${playerNodeName || 'unknown'}" could not encode track stream`);
            }

            // Play track via Lavalink
            await this.player.playTrack({
                track: { encoded: trackEncoded },
                position: seekSeconds * 1000
            });

            // Re-apply volume & filters
            await this.player.setGlobalVolume(this.volume);
            await this.applyFilter(this.activeFilter, this.speed, false);
        } catch (err) {
            // The node accepted the voice join but refuses to play (403 / 404 / 5xx / encode failure):
            // blacklist it, move this guild to the next healthy node, and retry up to 2 times.
            const retryCount = typeof _retried === 'number' ? _retried : (_retried ? 1 : 0);
            if (retryCount < 2 && this.voiceChannel && musicManager.shoukaku) {
                const badName = this.player && this.player.node ? this.player.node.name : null;
                console.warn(`[LAVALINK] Node "${badName || 'unknown'}" failed to play (${err.status || err.message}). Failing over (attempt ${retryCount + 1})...`);
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

        if (this.speed && this.speed !== 1.0 && this.activeFilter !== 'nightcore' && this.activeFilter !== 'vaporwave') {
            const clamped = Math.max(0.5, Math.min(2.0, this.speed));
            filters.timescale = { speed: clamped, pitch: 1.0, rate: 1.0 };
        }

        try {
            await this.player.setFilters(filters);
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
        return this.queue.splice(index, 1)[0];
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

    markBad(nodeName, ttlMs = 180000) {
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
        // If all connected nodes were marked bad, reset blacklist so we can still attempt playback
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
            console.warn(`[LAVALINK] Node "${name}" closed (code ${code}): ${reason || 'No reason'}`);
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
     * Resolves queries using Lavalink REST with graceful fallback to yt-search
     */
    async resolveQuery(rawQuery, requester) {
        let cleanQuery = rawQuery.trim();

        // Node check - iterate healthy connected nodes
        const activeNodes = this.getHealthyNodes();

        for (const node of activeNodes) {
            try {
                let identifier = cleanQuery;
                if (!cleanQuery.startsWith('http://') && !cleanQuery.startsWith('https://')) {
                    identifier = `ytsearch:${cleanQuery}`;
                }

                const res = await node.rest.resolve(identifier);
                if (res && res.data) {
                    if (res.loadType === 'track') {
                        const t = res.data;
                        const info = t.info || {};
                        const track = {
                            title: info.title || 'Unknown Title',
                            url: info.uri || cleanQuery,
                            duration: this.formatSeconds(Math.floor((info.length || 0) / 1000)),
                            seconds: Math.floor((info.length || 0) / 1000),
                            author: info.author || 'Unknown Artist',
                            thumbnail: info.artworkUrl || `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg`,
                            encoded: t.encoded,
                            encodedNode: node.name,
                            requester: {
                                id: requester.id,
                                tag: requester.tag || requester.username,
                                avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                            }
                        };
                        return { type: 'track', track };
                    } else if (res.loadType === 'playlist') {
                        const playlistData = res.data;
                        const tracks = (playlistData.tracks || []).map(t => {
                            const info = t.info || {};
                            return {
                                title: info.title || 'Unknown Title',
                                url: info.uri || `https://www.youtube.com/watch?v=${info.identifier}`,
                                duration: this.formatSeconds(Math.floor((info.length || 0) / 1000)),
                                seconds: Math.floor((info.length || 0) / 1000),
                                author: info.author || 'Unknown Artist',
                                thumbnail: info.artworkUrl || `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg`,
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
                            type: 'playlist',
                            title: (playlistData.info && playlistData.info.name) || 'Playlist',
                            tracks
                        };
                    } else if (res.loadType === 'search' && Array.isArray(res.data) && res.data.length > 0) {
                        const topTracks = res.data.slice(0, 5).map(t => {
                            const info = t.info || {};
                            return {
                                title: info.title || 'Unknown Title',
                                url: info.uri || `https://www.youtube.com/watch?v=${info.identifier}`,
                                duration: this.formatSeconds(Math.floor((info.length || 0) / 1000)),
                                seconds: Math.floor((info.length || 0) / 1000),
                                author: info.author || 'Unknown Artist',
                                thumbnail: info.artworkUrl || `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg`,
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
                }
            } catch (lavalinkErr) {
                // Try next node if this one fails
                continue;
            }
        }

        // Fallback: yt-search + Lavalink encode
        // Check if query is a playlist ID or playlist URL
        const playlistMatch = cleanQuery.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        if (playlistMatch) {
            try {
                const listId = playlistMatch[1];
                const pResult = await yts({ listId });
                if (pResult && pResult.videos && pResult.videos.length > 0) {
                    const tracks = pResult.videos.map(v => ({
                        title: v.title || 'Unknown Title',
                        url: v.url || `https://www.youtube.com/watch?v=${v.videoId}`,
                        duration: v.duration?.timestamp || this.formatSeconds(v.duration?.seconds || 0),
                        seconds: v.duration?.seconds || 0,
                        author: v.author ? v.author.name : (pResult.author ? pResult.author.name : 'Unknown Artist'),
                        thumbnail: v.thumbnail || null,
                        encoded: null,
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
            } catch (pErr) {
                console.warn('[YTS PLAYLIST FALLBACK WARN]', pErr.message);
            }
        }

        const searchResult = await yts(cleanQuery);
        if (!searchResult || !searchResult.videos || searchResult.videos.length === 0) {
            return { type: 'empty' };
        }

        // Attempt resolving first video via Lavalink if a healthy node is available
        const firstVid = searchResult.videos[0];
        let encodedTrack = null;
        let encodedNode = null;
        const fallbackNode = activeNodes[0] || null;
        if (fallbackNode) {
            try {
                const check = await fallbackNode.rest.resolve(firstVid.url);
                if (check && check.data) {
                    encodedTrack = Array.isArray(check.data) ? check.data[0]?.encoded : (check.data.encoded || check.data.tracks?.[0]?.encoded);
                    if (encodedTrack) encodedNode = fallbackNode.name;
                }
            } catch (_) {}
        }

        const topVideos = searchResult.videos.slice(0, 5).map((v, idx) => ({
            title: v.title,
            url: v.url,
            duration: v.timestamp || this.formatSeconds(v.seconds),
            seconds: v.seconds || 0,
            author: v.author ? v.author.name : 'Unknown Artist',
            thumbnail: v.thumbnail || null,
            views: v.views ? v.views.toLocaleString() : 'N/A',
            encoded: idx === 0 ? encodedTrack : null,
            encodedNode: idx === 0 ? encodedNode : null,
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
