const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    MessageFlags 
} = require('discord.js');
const musicManager = require('../utils/musicManager');
const { buildNowPlayingEmbed, buildMusicControlRow, buildSearchResultsMenu, buildQueueEmbed } = require('../utils/musicUtils');
const lyricsService = require('../utils/lyricsService');
const config = require('../config');

// Temporary search sessions storage
const searchSessions = new Map();

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play a song from a YouTube URL or search keywords')
            .addStringOption(opt =>
                opt.setName('query')
                    .setDescription('YouTube video URL, playlist link, or search keywords')
                    .setRequired(true)
            )
            .addBooleanOption(opt =>
                opt.setName('search')
                    .setDescription('Show top 5 search choices to pick from instead of auto-playing the first result')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) {
                return interaction.reply({
                    content: '🔊 You must be connected to a voice channel to play music!',
                    flags: MessageFlags.Ephemeral
                });
            }

            const permissions = voiceChannel.permissionsFor(interaction.client.user);
            if (!permissions.has('Connect') || !permissions.has('Speak')) {
                return interaction.reply({
                    content: '❌ I do not have permission to **Connect** or **Speak** in your voice channel!',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            const query = interaction.options.getString('query');
            const showChoices = interaction.options.getBoolean('search') || false;
            const queue = musicManager.getQueue(interaction.guild.id);

            try {
                const result = await musicManager.resolveQuery(query, interaction.user);

                if (result.type === 'empty') {
                    return interaction.editReply({
                        content: `🔍 No YouTube results found for: \`${query}\`. Please verify your keywords or link.`
                    });
                }

                // Connect voice channel
                queue.connect(voiceChannel, interaction.channel);

                if (result.type === 'playlist') {
                    result.tracks.forEach(t => queue.queue.push(t));

                    const embed = new EmbedBuilder()
                        .setTitle('📑 YouTube Playlist Added to Queue')
                        .setDescription(`Added **${result.tracks.length} tracks** from [**${result.title}**](${query})`)
                        .addFields(
                            { name: '👤 Added By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '🎶 First Track', value: result.tracks[0].title, inline: true }
                        )
                        .setColor(config.colors.primary)
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });

                    if (!queue.isPlaying && !queue.currentTrack) {
                        const firstTrack = queue.queue.shift();
                        queue.playTrack(firstTrack);
                    }
                    return;
                }

                if (result.type === 'search' && showChoices) {
                    const sessionId = `search_${Date.now()}_${interaction.user.id}`;
                    searchSessions.set(sessionId, {
                        tracks: result.results,
                        voiceChannel,
                        textChannel: interaction.channel,
                        guildId: interaction.guild.id,
                        userId: interaction.user.id
                    });

                    setTimeout(() => searchSessions.delete(sessionId), 60000);

                    const selectMenu = buildSearchResultsMenu(result.results, sessionId);
                    return interaction.editReply({
                        content: `🔍 **YouTube Search Results for:** \`${query}\`\nSelect a track below to start playback:`,
                        components: [selectMenu]
                    });
                }

                const track = result.type === 'track' ? result.track : result.topTrack;

                if (queue.isPlaying || queue.currentTrack) {
                    queue.queue.push(track);

                    const embed = new EmbedBuilder()
                        .setTitle('🎵 Track Added to Queue')
                        .setDescription(`[**${track.title}**](${track.url})`)
                        .addFields(
                            { name: '🎤 Artist / Channel', value: track.author || 'Unknown', inline: true },
                            { name: '⏱️ Duration', value: track.duration, inline: true },
                            { name: '📍 Position in Queue', value: `#${queue.queue.length}`, inline: true }
                        )
                        .setColor(config.colors.secondary)
                        .setThumbnail(track.thumbnail)
                        .setFooter({ text: `Requested by ${interaction.user.username}` })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({
                        content: `🎶 Starting playback for **${track.title}**...`
                    });
                    queue.playTrack(track);
                }
            } catch (err) {
                console.error('[PLAY COMMAND ERROR]', err);
                return interaction.editReply({
                    content: `❌ Could not load audio from YouTube: ${err.message}`
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('pause')
            .setDescription('Pause the current music playback'),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            if (!queue.isPlaying && !queue.currentTrack) {
                return interaction.reply({ content: '⚠️ Nothing is currently playing!', flags: MessageFlags.Ephemeral });
            }

            const success = queue.pause();
            return interaction.reply({
                content: success ? '⏸️ Music playback has been **paused**.' : '⚠️ Playback is already paused!'
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('resume')
            .setDescription('Resume paused music playback'),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            if (!queue.currentTrack) {
                return interaction.reply({ content: '⚠️ Nothing is currently playing!', flags: MessageFlags.Ephemeral });
            }

            const success = queue.resume();
            return interaction.reply({
                content: success ? '▶️ Music playback has been **resumed**.' : '⚠️ Playback is not paused!'
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('skip')
            .setDescription('Skip the current playing track'),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            if (!queue.currentTrack) {
                return interaction.reply({ content: '⚠️ Nothing is currently playing to skip!', flags: MessageFlags.Ephemeral });
            }

            const skipped = queue.skip();
            return interaction.reply({
                content: `⏭️ Skipped: **${skipped.title}**`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop music playback, clear the queue, and disconnect'),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            if (!queue.currentTrack && queue.queue.length === 0) {
                return interaction.reply({ content: '⚠️ Nothing is playing and the queue is already empty.', flags: MessageFlags.Ephemeral });
            }

            queue.stop();
            return interaction.reply({
                content: '⏹️ Stopped playback and cleared the queue.'
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('queue')
            .setDescription('View the current music queue and upcoming tracks')
            .addIntegerOption(opt =>
                opt.setName('page')
                    .setDescription('Page number of queue to view')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            const page = interaction.options.getInteger('page') || 1;
            const embed = buildQueueEmbed(queue, page);
            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('nowplaying')
            .setDescription('Display detailed information about the current playing track'),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            if (!queue.currentTrack) {
                return interaction.reply({ content: '⚠️ Nothing is currently playing!', flags: MessageFlags.Ephemeral });
            }

            const embed = buildNowPlayingEmbed(queue.currentTrack, queue);
            const controls = buildMusicControlRow(queue);
            return interaction.reply({ embeds: [embed], components: [controls] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('volume')
            .setDescription('Adjust the music volume (1% - 200%)')
            .addIntegerOption(opt =>
                opt.setName('percent')
                    .setDescription('Volume level between 1 and 200')
                    .setMinValue(1)
                    .setMaxValue(200)
                    .setRequired(true)
            ),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            const vol = interaction.options.getInteger('percent');
            queue.setVolume(vol);

            return interaction.reply({
                content: `🔊 Volume set to **${vol}%**`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('shuffle')
            .setDescription('Randomly shuffle the upcoming tracks in the music queue'),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            if (queue.queue.length < 2) {
                return interaction.reply({
                    content: '⚠️ You need at least 2 tracks in the queue to shuffle!',
                    flags: MessageFlags.Ephemeral
                });
            }

            queue.shuffle();
            return interaction.reply({
                content: `🔀 Successfully shuffled **${queue.queue.length}** tracks in the queue!`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('loop')
            .setDescription('Toggle loop mode (Off, Track, or Queue)')
            .addStringOption(opt =>
                opt.setName('mode')
                    .setDescription('Loop mode')
                    .setRequired(true)
                    .addChoices(
                        { name: '❌ Off (Normal playback)', value: 'off' },
                        { name: '🔂 Single Track (Repeat current song)', value: 'track' },
                        { name: '🔁 Entire Queue (Repeat whole queue)', value: 'queue' }
                    )
            ),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            const mode = interaction.options.getString('mode');
            queue.loopMode = mode;

            const modeNames = {
                off: '❌ Off',
                track: '🔂 Single Track',
                queue: '🔁 Entire Queue'
            };

            return interaction.reply({
                content: `🔁 Loop mode has been set to: **${modeNames[mode]}**`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('lyrics')
            .setDescription('Display real-time synchronized scrolling lyrics for the current song or search term')
            .addStringOption(opt =>
                opt.setName('song')
                    .setDescription('Optional specific song name or artist to look up lyrics for')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            const customQuery = interaction.options.getString('song');
            const targetQuery = customQuery || (queue.currentTrack ? `${queue.currentTrack.title} ${queue.currentTrack.author}` : null);

            if (!targetQuery) {
                return interaction.reply({
                    content: '⚠️ No song is currently playing. Please provide a song name (e.g. `/lyrics song:Shape of You`).',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            const lyricsData = await lyricsService.fetchLyrics(targetQuery);
            if (!lyricsData || (!lyricsData.plainLyrics && !lyricsData.syncedLyrics)) {
                return interaction.editReply({
                    content: `🔍 No synchronized or plain lyrics found for: **${targetQuery}**.`
                });
            }

            const elapsedSec = queue.getPlaybackSeconds();
            let displayLyrics = '';

            if (lyricsData.syncedLyrics && lyricsData.syncedLyrics.length > 0) {
                // Find current active line
                let activeIdx = 0;
                for (let i = 0; i < lyricsData.syncedLyrics.length; i++) {
                    if (elapsedSec >= lyricsData.syncedLyrics[i].time) {
                        activeIdx = i;
                    } else {
                        break;
                    }
                }

                // Show window of 8 lines around current line
                const start = Math.max(0, activeIdx - 3);
                const end = Math.min(lyricsData.syncedLyrics.length, start + 8);
                const slice = lyricsData.syncedLyrics.slice(start, end);

                displayLyrics = slice.map((line, idx) => {
                    const actualIdx = start + idx;
                    const mins = Math.floor(line.time / 60);
                    const secs = Math.floor(line.time % 60).toString().padStart(2, '0');
                    if (actualIdx === activeIdx) {
                        return `▶️ **[${mins}:${secs}] ${line.text || '♪'}**`;
                    }
                    return `   [${mins}:${secs}] ${line.text || '♪'}`;
                }).join('\n');
            } else {
                displayLyrics = lyricsData.plainLyrics.slice(0, 1500) + (lyricsData.plainLyrics.length > 1500 ? '\n\n*... (lyrics truncated)*' : '');
            }

            const embed = new EmbedBuilder()
                .setTitle(`🎤 Lyrics: ${lyricsData.trackName || targetQuery}`)
                .setDescription(`**Artist:** ${lyricsData.artistName || 'Unknown'}\n\n${displayLyrics}`)
                .setColor(config.colors.secondary)
                .setFooter({ text: 'Powered by LRCLIB • Use web portal for real-time scrolling view' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
];

module.exports.searchSessions = searchSessions;
