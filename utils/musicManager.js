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
const { Ytdl, Quality } = require('@distube/ytdl-core');
const yts = require('yt-search');
const config = require('../config');

// Ensure ffmpeg path is set in process environment
if (ffmpegStatic && !process.env.FFMPEG_PATH) {
    process.env.FFMPEG_PATH = ffmpegStatic;
}

const yt = new Ytdl();

/**
 * Per-Guild Music Subscription & Queue Manager
 */
class GuildMusicQueue {
    constructor(guildId) {
        this.guildId = guildId;
        this.voiceChannelId = null;
        this.textChannel = null;
        this.connection = null;
        this.player = createAudioPlayer();
        this.queue = [];
        this.currentTrack = null;
        this.volume = 100;
        this.currentResource = null;
        this.loopMode = 'off'; // 'off' | 'track' | 'queue'
        this.isPlaying = false;
        this.disconnectTimeout = null;

        this.setupPlayerListeners();
    }

    setupPlayerListeners() {
        this.player.on(AudioPlayerStatus.Idle, () => {
            if (this.currentTrack) {
                if (this.loopMode === 'track') {
                    // Replay same track
                    this.playTrack(this.currentTrack);
                    return;
                } else if (this.loopMode === 'queue') {
                    // Push finished track to end of queue
                    this.queue.push(this.currentTrack);
                }
            }

            this.currentTrack = null;
            this.currentResource = null;

            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                // Schedule idle timeout to disconnect after 3 minutes of silence
                this.scheduleDisconnect();
            }
        });

        this.player.on('error', error => {
            console.error(`[MUSIC ERROR in Guild ${this.guildId}]`, error.message);
            if (this.textChannel) {
                this.textChannel.send(`⚠️ **Playback Error:** Could not stream track (${error.message}). Skipping to next track...`).catch(() => {});
            }
            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                this.currentTrack = null;
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
                    this.textChannel.send('👋 Left the voice channel due to inactivity. Thanks for listening!').catch(() => {});
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

    async playTrack(track) {
        this.cancelDisconnect();
        this.currentTrack = track;
        this.isPlaying = true;

        try {
            const info = await yt.getInfo(track.url);
            const stream = yt.download(info, {
                quality: Quality.HighestAudio,
                filter: { hasAudio: true, hasVideo: false },
                highWaterMark: 1 << 25
            });

            const resource = createAudioResource(stream, {
                inputType: StreamType.Arbitrary,
                inlineVolume: true
            });

            if (resource.volume) {
                resource.volume.setVolume(this.volume / 100);
            }

            this.currentResource = resource;
            this.player.play(resource);

            // Announce now playing in text channel if configured
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
            // Auto advance
            if (this.queue.length > 0) {
                const nextTrack = this.queue.shift();
                this.playTrack(nextTrack);
            } else {
                this.isPlaying = false;
                this.scheduleDisconnect();
            }
        }
    }

    setVolume(val) {
        this.volume = Math.max(1, Math.min(200, val));
        if (this.currentResource && this.currentResource.volume) {
            this.currentResource.volume.setVolume(this.volume / 100);
        }
        return this.volume;
    }

    pause() {
        return this.player.pause();
    }

    resume() {
        return this.player.unpause();
    }

    skip() {
        if (!this.currentTrack) return null;
        const skipped = this.currentTrack;
        this.player.stop(); // triggers AudioPlayerStatus.Idle and plays next
        return skipped;
    }

    stop() {
        this.queue = [];
        this.currentTrack = null;
        this.player.stop(true);
        this.isPlaying = false;
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
        this.isPlaying = false;
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

    /**
     * Resolves song query: checks direct video URL, playlist URL, or runs YouTube keyword search
     */
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
                            avatar: requester.displayAvatarURL()
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
                        avatar: requester.displayAvatarURL()
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
                avatar: requester.displayAvatarURL()
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
