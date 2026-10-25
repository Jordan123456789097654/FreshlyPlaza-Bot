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

        // Synced Lyrics & Sleep Timer
        this.currentLyrics = null;
        this.sleepTimeout = null;
        this.sleepEndsAt = null;
        this.skipVotes = new Set();
    }

    setupPlayerListeners() {
        if (!this.player) return;

        this.player.on('start', () => {
            this.isPlaying = true;
            this.playbackStartTime = Date.now();
            musicManager.updateDiscordPresence(this.currentTrack ? this.currentTrack.title : null);

            if (this.textChannel && this.currentTrack) {
                const { buildNowPlayingEmbed, buildMusicControlRow } = require('./musicUtils');
                const embed = buildNowPlayingEmbed(this.currentTrack, this);
                const row = buildMusicControlRow(this);
                this.textChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
            }
        });

        this.player.on('end', async (reason) => {
            // reason can be 'finished', 'replaced', 'stopped', etc.
            if (reason && reason.type === 'replaced') return;

            if (this.currentTrack) {
                this.history.unshift({
                    ...this.currentTrack,
                    playedAt: new Date().toISOString()
                });
                if (this.history.length > 50) this.history.pop();

                if (this.loopMode === 'track') {
                    await this.playTrack(this.currentTrack);
                    return;
                } else if (this.loopMode === 'queue') {
                    this.queue.push(this.currentTrack);
                }
            }

            this.currentTrack = null;
            this.currentLyrics = null;

            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                await this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                musicManager.updateDiscordPresence();
                this.scheduleDisconnect();
            }
        });

        this.player.on('error', (err) => {
            console.error(`[LAVALINK PLAYER ERROR Guild ${this.guildId}]`, err);
            if (this.textChannel) {
                this.textChannel.send(`⚠️ **Playback Issue:** Track encountered an issue. Skipping...`).catch(() => {});
            }
            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                this.currentTrack = null;
                musicManager.updateDiscordPresence();
                this.scheduleDisconnect();
            }
        });

        this.player.on('closed', () => {
            this.isPlaying = false;
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
        this.textChannel = textChannel;
        this.voiceChannelId = voiceChannel.id;
        this.voiceChannelName = voiceChannel.name;

        if (!musicManager.shoukaku) {
            throw new Error('Lavalink audio client is not initialized or still connecting.');
        }

        if (!this.player) {
            this.player = await musicManager.shoukaku.joinVoiceChannel({
                guildId: this.guildId,
                channelId: voiceChannel.id,
                shardId: voiceChannel.guild.shardId || 0,
                deaf: true
            });
            this.setupPlayerListeners();
        }

        return this.player;
    }

    async playTrack(track, seekSeconds = 0) {
        this.cancelDisconnect();
        this.currentTrack = track;
        this.isPlaying = true;
        this.playbackStartTime = Date.now() - (seekSeconds * 1000);

        // Fetch synced lyrics in background
        lyricsService.fetchLyrics(`${track.title} ${track.author}`).then(res => {
            this.currentLyrics = res;
        }).catch(() => {});

        try {
            if (!this.player) {
                throw new Error('Voice player is not connected.');
            }

            // If track does not have an encoded string yet (e.g. from yt-search playlist fallback), resolve it on the fly
            let trackEncoded = track.encoded;
            if (!trackEncoded) {
                const activeNodes = musicManager.shoukaku ? Array.from(musicManager.shoukaku.nodes.values()).filter(n => n.state === 2 || n.state === 1) : [];
                for (const node of activeNodes) {
                    try {
                        const res = await node.rest.resolve(track.url);
                        if (res && res.data) {
                            trackEncoded = Array.isArray(res.data) ? res.data[0]?.encoded : (res.data.encoded || res.data.tracks?.[0]?.encoded);
                            if (trackEncoded) {
                                track.encoded = trackEncoded;
                                break;
                            }
                        }
                    } catch (_) {}
                }
            }

            if (!trackEncoded) {
                throw new Error('Could not encode track audio stream from Lavalink node');
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
        if (!this.isPlaying || !this.playbackStartTime) return 0;
        if (this.player && this.player.position) {
            return Math.floor(this.player.position / 1000);
        }
        if (this.pausedAt) {
            return Math.floor((this.pausedAt - this.playbackStartTime) / 1000);
        }
        return Math.floor((Date.now() - this.playbackStartTime) / 1000);
    }

    async setVolume(val) {
        this.volume = Math.max(1, Math.min(200, val));
        if (this.player) {
            await this.player.setGlobalVolume(this.volume).catch(() => {});
        }
        return this.volume;
    }

    async pause() {
        this.pausedAt = Date.now();
        if (this.player) {
            await this.player.setPaused(true).catch(() => {});
        }
        return true;
    }

    async resume() {
        if (this.pausedAt && this.playbackStartTime) {
            this.playbackStartTime += (Date.now() - this.pausedAt);
        }
        if (this.player) {
            await this.player.setPaused(false).catch(() => {});
        }
        return true;
    }

    async skip() {
        if (!this.currentTrack) return null;
        const skipped = this.currentTrack;
        if (this.player) {
            await this.player.stopTrack().catch(() => {});
        }
        return skipped;
    }

    async stop() {
        this.queue = [];
        this.currentTrack = null;
        this.currentLyrics = null;
        this.isPlaying = false;
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

    init(client) {
        this.clientRef = client;

        const nodes = config.lavalinkNodes || [
            {
                name: 'Serenetia-SSL',
                url: 'lavalinkv4.serenetia.com:443',
                auth: 'https://dsc.gg/ajidevserver',
                secure: true
            }
        ];

        this.shoukaku = new Shoukaku(
            new Connectors.DiscordJS(client),
            nodes,
            {
                moveOnDisconnect: false,
                resume: false,
                reconnectTries: 10,
                reconnectInterval: 5
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

        // Node check - iterate connected nodes
        const activeNodes = this.shoukaku ? Array.from(this.shoukaku.nodes.values()).filter(n => n.state === 2 || n.state === 1) : [];

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

        // Attempt resolving first video via Lavalink if node is available
        const firstVid = searchResult.videos[0];
        let encodedTrack = null;
        if (node) {
            try {
                const check = await node.rest.resolve(firstVid.url);
                if (check && check.data) {
                    encodedTrack = Array.isArray(check.data) ? check.data[0]?.encoded : (check.data.encoded || check.data.tracks?.[0]?.encoded);
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
