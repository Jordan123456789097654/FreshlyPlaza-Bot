const { 
    AudioPlayerStatus, 
    createAudioPlayer, 
    createAudioResource, 
    joinVoiceChannel, 
    VoiceConnectionStatus, 
    entersState,
    StreamType
} = require('@discordjs/voice');
const ffmpegStatic = require('ffmpeg-static');
const prism = require('prism-media');
const { Ytdl, Quality } = require('@distube/ytdl-core');
const yts = require('yt-search');
const config = require('../config');
const lyricsService = require('./lyricsService');

// Ensure ffmpeg path is set in process environment
if (ffmpegStatic && !process.env.FFMPEG_PATH) {
    process.env.FFMPEG_PATH = ffmpegStatic;
}

const yt = new Ytdl();

/**
 * Filter Presets definitions
 */
const DSP_PRESETS = {
    bassboost_low: 'equalizer=f=60:width_type=h:width=50:g=6,equalizer=f=120:width_type=h:width=80:g=4',
    bassboost_medium: 'equalizer=f=60:width_type=h:width=50:g=12,equalizer=f=120:width_type=h:width=80:g=8',
    bassboost_hard: 'equalizer=f=60:width_type=h:width=50:g=18,equalizer=f=120:width_type=h:width=80:g=12',
    bassboost_extreme: 'equalizer=f=60:width_type=h:width=50:g=25,equalizer=f=120:width_type=h:width=80:g=16',
    nightcore: 'asetrate=48000*1.25,aresample=48000',
    vaporwave: 'asetrate=48000*0.85,aresample=48000,aecho=0.8:0.9:1000:0.3',
    spatial_8d: 'apulsator=hz=0.125',
    karaoke: 'pan=stereo|c0=c0-c1|c1=c1-c0',
    treble_boost: 'treble=g=8',
    pop: 'equalizer=f=60:width_type=h:width=50:g=-1.5,equalizer=f=170:width_type=h:width=100:g=3.9,equalizer=f=310:width_type=h:width=150:g=5.4,equalizer=f=600:width_type=h:width=300:g=4.5,equalizer=f=1000:width_type=h:width=500:g=1.5,equalizer=f=3000:width_type=h:width=1500:g=-1.5,equalizer=f=6000:width_type=h:width=3000:g=-1.5',
    rock: 'equalizer=f=60:width_type=h:width=50:g=4.8,equalizer=f=170:width_type=h:width=100:g=3,equalizer=f=310:width_type=h:width=150:g=-3.3,equalizer=f=600:width_type=h:width=300:g=-4.5,equalizer=f=1000:width_type=h:width=500:g=1.5,equalizer=f=3000:width_type=h:width=1500:g=3.6,equalizer=f=6000:width_type=h:width=3000:g=5.1',
    classical: 'equalizer=f=60:width_type=h:width=50:g=4.5,equalizer=f=170:width_type=h:width=100:g=3.6,equalizer=f=310:width_type=h:width=150:g=3,equalizer=f=600:width_type=h:width=300:g=-2.4,equalizer=f=1000:width_type=h:width=500:g=-2.4,equalizer=f=3000:width_type=h:width=1500:g=1.5,equalizer=f=6000:width_type=h:width=3000:g=3.9'
};

/**
 * Per-Guild Music Subscription & Queue Manager with DSP Audio Filters
 */
class GuildMusicQueue {
    constructor(guildId) {
        this.guildId = guildId;
        this.voiceChannelId = null;
        this.voiceChannelName = 'None';
        this.textChannel = null;
        this.connection = null;
        this.player = createAudioPlayer();
        this.queue = [];
        this.history = [];
        this.currentTrack = null;
        this.volume = 100;
        this.currentResource = null;
        this.loopMode = 'off'; // 'off' | 'track' | 'queue'
        this.isPlaying = false;
        this.disconnectTimeout = null;

        // DSP Filter States
        this.speed = 1.0;
        this.activeFilter = 'none'; // 'none' | 'nightcore' | 'vaporwave' | 'bassboost_medium' | 'spatial_8d' | 'karaoke' | etc.
        this.playbackStartTime = 0;
        this.pausedAt = 0;

        // Current Track Synced Lyrics
        this.currentLyrics = null;

        this.setupPlayerListeners();
    }

    setupPlayerListeners() {
        this.player.on(AudioPlayerStatus.Idle, () => {
            if (this.currentTrack) {
                // Record in history for analytics
                this.history.unshift({
                    ...this.currentTrack,
                    playedAt: new Date().toISOString()
                });
                if (this.history.length > 50) this.history.pop();

                if (this.loopMode === 'track') {
                    this.playTrack(this.currentTrack);
                    return;
                } else if (this.loopMode === 'queue') {
                    this.queue.push(this.currentTrack);
                }
            }

            this.currentTrack = null;
            this.currentResource = null;
            this.currentLyrics = null;

            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                musicManager.updateDiscordPresence();
                this.scheduleDisconnect();
            }
        });

        this.player.on('error', error => {
            console.error(`[MUSIC ERROR in Guild ${this.guildId}]`, error.message);
            if (this.textChannel) {
                this.textChannel.send(`⚠️ **Playback Error:** (${error.message}). Skipping to next track...`).catch(() => {});
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
    }

    scheduleDisconnect() {
        if (this.disconnectTimeout) clearTimeout(this.disconnectTimeout);
        this.disconnectTimeout = setTimeout(() => {
            if (!this.isPlaying && this.queue.length === 0) {
                this.destroy();
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

    connect(voiceChannel, textChannel) {
        this.cancelDisconnect();
        this.textChannel = textChannel;
        this.voiceChannelId = voiceChannel.id;
        this.voiceChannelName = voiceChannel.name;

        if (!this.connection || this.connection.state.status === VoiceConnectionStatus.Destroyed) {
            this.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: this.guildId,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator
            });

            this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(this.connection, VoiceConnectionStatus.Connecting, 5000)
                    ]);
                } catch {
                    this.destroy();
                }
            });

            this.connection.subscribe(this.player);
        }

        return this.connection;
    }

    /**
     * Builds the active FFmpeg audio filter string based on speed, presets, and DSP settings
     */
    buildFilterString() {
        const filters = [];

        // 1. Preset Filters
        if (this.activeFilter && DSP_PRESETS[this.activeFilter]) {
            filters.push(DSP_PRESETS[this.activeFilter]);
        }

        // 2. Custom Speed / Pitch (if not using nightcore or vaporwave presets which set rate themselves)
        if (this.activeFilter !== 'nightcore' && this.activeFilter !== 'vaporwave') {
            if (this.speed && this.speed !== 1.0) {
                const clamped = Math.max(0.5, Math.min(2.0, this.speed));
                filters.push(`atempo=${clamped}`);
            }
        }

        return filters.length > 0 ? filters.join(',') : null;
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
            const info = await yt.getInfo(track.url);
            const rawStream = yt.download(info, {
                quality: Quality.HighestAudio,
                filter: { hasAudio: true, hasVideo: false },
                highWaterMark: 1 << 25
            });

            const filterStr = this.buildFilterString();
            let finalStream = rawStream;

            if (filterStr) {
                const transcoder = new prism.FFmpeg({
                    args: [
                        '-analyzeduration', '0',
                        '-loglevel', '0',
                        '-i', 'pipe:0',
                        '-af', filterStr,
                        '-f', 's16le',
                        '-ar', '48000',
                        '-ac', '2'
                    ]
                });
                finalStream = rawStream.pipe(transcoder);
            }

            const resource = createAudioResource(finalStream, {
                inputType: filterStr ? StreamType.Raw : StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(this.volume / 100);
            }

            this.currentResource = resource;
            this.player.play(resource);

            musicManager.updateDiscordPresence(track.title);

            // Announce in text channel
            if (this.textChannel) {
                const { buildNowPlayingEmbed, buildMusicControlRow } = require('./musicUtils');
                const embed = buildNowPlayingEmbed(track, this);
                const row = buildMusicControlRow(this);
                this.textChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
            }
        } catch (err) {
            console.error('[PLAY TRACK ERROR]', err);
            if (this.textChannel) {
                this.textChannel.send(`❌ Failed to load audio for **${track.title}**: ${err.message}`).catch(() => {});
            }
            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                musicManager.updateDiscordPresence();
                this.scheduleDisconnect();
            }
        }
    }

    /**
     * Re-applies active filter or speed without skipping track
     */
    async applyFilter(filterName, customSpeed = null) {
        if (filterName !== undefined) this.activeFilter = filterName;
        if (customSpeed !== null) this.speed = customSpeed;

        if (this.currentTrack) {
            const elapsed = this.getPlaybackSeconds();
            await this.playTrack(this.currentTrack, elapsed);
        }
    }

    getPlaybackSeconds() {
        if (!this.isPlaying || !this.playbackStartTime) return 0;
        if (this.player.state.status === 'paused') {
            return Math.floor((this.pausedAt - this.playbackStartTime) / 1000);
        }
        return Math.floor((Date.now() - this.playbackStartTime) / 1000);
    }

    setVolume(val) {
        this.volume = Math.max(1, Math.min(200, val));
        if (this.currentResource && this.currentResource.volume) {
            this.currentResource.volume.setVolume(this.volume / 100);
        }
        return this.volume;
    }

    pause() {
        this.pausedAt = Date.now();
        return this.player.pause();
    }

    resume() {
        if (this.pausedAt && this.playbackStartTime) {
            this.playbackStartTime += (Date.now() - this.pausedAt);
        }
        return this.player.unpause();
    }

    skip() {
        if (!this.currentTrack) return null;
        const skipped = this.currentTrack;
        this.player.stop();
        return skipped;
    }

    stop() {
        this.queue = [];
        this.currentTrack = null;
        this.currentLyrics = null;
        this.player.stop(true);
        this.isPlaying = false;
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

    destroy() {
        this.cancelDisconnect();
        this.queue = [];
        this.currentTrack = null;
        this.currentLyrics = null;
        this.isPlaying = false;
        musicManager.updateDiscordPresence();
        try {
            this.player.stop(true);
        } catch (_) {}
        if (this.connection) {
            try {
                this.connection.destroy();
            } catch (_) {}
            this.connection = null;
        }
        musicManager.queues.delete(this.guildId);
    }
}

/**
 * Global Music Manager
 */
const musicManager = {
    queues: new Map(),
    clientRef: null,

    init(client) {
        this.clientRef = client;
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
        const q = this.queues.get(guildId);
        if (q) q.destroy();
    },

    async resolveQuery(query, requester) {
        const cleanQuery = query.trim();

        // 1. YouTube Playlist Detection
        if (cleanQuery.includes('playlist?list=') || cleanQuery.includes('&list=')) {
            try {
                const playlist = await yt.getPlaylist(cleanQuery);
                if (playlist && playlist.videos && playlist.videos.length > 0) {
                    const tracks = playlist.videos.map(v => ({
                        title: v.title || 'Unknown Title',
                        url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
                        duration: v.lengthSeconds ? this.formatSeconds(v.lengthSeconds) : 'Unknown',
                        seconds: v.lengthSeconds || 0,
                        author: v.author ? v.author.name : 'Unknown Artist',
                        thumbnail: (v.thumbnails && v.thumbnails[0]) ? v.thumbnails[0].url : null,
                        requester: {
                            id: requester.id,
                            tag: requester.tag || requester.username,
                            avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                        }
                    }));
                    return {
                        type: 'playlist',
                        title: playlist.title || 'YouTube Playlist',
                        tracks
                    };
                }
            } catch (pErr) {
                console.warn('[PLAYLIST PARSE ERROR]', pErr.message);
            }
        }

        // 2. Direct Video URL Detection
        if (/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/.test(cleanQuery)) {
            try {
                const info = await yt.getInfo(cleanQuery);
                const track = {
                    title: info.videoDetails.title,
                    url: info.videoDetails.video_url || cleanQuery,
                    duration: this.formatSeconds(info.videoDetails.lengthSeconds),
                    seconds: parseInt(info.videoDetails.lengthSeconds, 10) || 0,
                    author: info.videoDetails.author ? info.videoDetails.author.name : 'Unknown Artist',
                    thumbnail: (info.videoDetails.thumbnails && info.videoDetails.thumbnails.length > 0) 
                        ? info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url 
                        : null,
                    requester: {
                        id: requester.id,
                        tag: requester.tag || requester.username,
                        avatar: requester.displayAvatarURL ? requester.displayAvatarURL() : null
                    }
                };
                return { type: 'track', track };
            } catch (vErr) {
                throw new Error(`Could not fetch YouTube video details: ${vErr.message}`);
            }
        }

        // 3. YouTube Keyword Search (yt-search)
        const searchResult = await yts(cleanQuery);
        if (!searchResult || !searchResult.videos || searchResult.videos.length === 0) {
            return { type: 'empty' };
        }

        const topVideos = searchResult.videos.slice(0, 5).map(v => ({
            title: v.title,
            url: v.url,
            duration: v.timestamp || this.formatSeconds(v.seconds),
            seconds: v.seconds || 0,
            author: v.author ? v.author.name : 'Unknown Artist',
            thumbnail: v.thumbnail || null,
            views: v.views ? v.views.toLocaleString() : 'N/A',
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
module.exports.DSP_PRESETS = DSP_PRESETS;
