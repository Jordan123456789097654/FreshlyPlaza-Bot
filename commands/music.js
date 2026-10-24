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
const { getDb } = require('../database');
const config = require('../config');

// Temporary search sessions storage
const searchSessions = new Map();

/**
 * Checks if user is authorized as DJ or Staff
 */
async function isDjAuthorized(member, guildId) {
    const db = getDb();
    const settings = await db.getMusicSettings(guildId);
    if (!settings.djRoleId) return true; // No DJ role required if not set
    if (member.roles.cache.has(settings.djRoleId)) return true;
    if (member.roles.cache.has(config.roles.staff) || member.roles.cache.has(config.roles.mr) || member.roles.cache.has(config.roles.hr)) return true;
    if (member.permissions.has('ManageGuild') || member.permissions.has('Administrator')) return true;
    return false;
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play a song from a YouTube/Spotify/Apple Music link or keywords')
            .addStringOption(opt =>
                opt.setName('query')
                    .setDescription('YouTube, Spotify, SoundCloud URL or search keywords')
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

            const db = getDb();
            const musicSettings = await db.getMusicSettings(interaction.guild.id);
            const queue = musicManager.getQueue(interaction.guild.id);

            // Queue limits check
            const userTracksCount = queue.queue.filter(t => t.requester.id === interaction.user.id).length;
            if (userTracksCount >= (musicSettings.maxQueuePerUser || 10)) {
                return interaction.reply({
                    content: `⚠️ You have reached your maximum queue limit of **${musicSettings.maxQueuePerUser || 10} tracks**!`,
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            const query = interaction.options.getString('query');
            const showChoices = interaction.options.getBoolean('search') || false;

            try {
                const result = await musicManager.resolveQuery(query, interaction.user);

                if (result.type === 'empty') {
                    return interaction.editReply({
                        content: `🔍 No songs found for: \`${query}\`. Please verify your keywords or link.`
                    });
                }

                queue.connect(voiceChannel, interaction.channel);

                if (result.type === 'playlist') {
                    // Check max duration per track
                    const validTracks = result.tracks.filter(t => !musicSettings.maxTrackSeconds || t.seconds <= musicSettings.maxTrackSeconds);
                    validTracks.forEach(t => queue.queue.push(t));

                    const embed = new EmbedBuilder()
                        .setTitle('📑 Playlist Added to Queue')
                        .setDescription(`Added **${validTracks.length} tracks** from [**${result.title}**](${query})`)
                        .addFields(
                            { name: '👤 Added By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '🎶 First Track', value: validTracks[0].title, inline: true }
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
                        content: `🔍 **Search Results for:** \`${query}\`\nSelect a track below to start playback:`,
                        components: [selectMenu]
                    });
                }

                const track = result.type === 'track' ? result.track : result.topTrack;

                // Duration limit validation
                if (musicSettings.maxTrackSeconds && track.seconds > musicSettings.maxTrackSeconds) {
                    return interaction.editReply({
                        content: `⚠️ Track **${track.title}** is too long (${track.duration})! Server limit is **${Math.floor(musicSettings.maxTrackSeconds / 60)} minutes**.`
                    });
                }

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
                    content: `❌ Could not load audio: ${err.message}`
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('pause')
            .setDescription('Pause the current music playback'),
        async execute(interaction) {
            const isAuthorized = await isDjAuthorized(interaction.member, interaction.guild.id);
            if (!isAuthorized) {
                return interaction.reply({ content: '❌ You must have the DJ role to pause music.', flags: MessageFlags.Ephemeral });
            }

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
            const isAuthorized = await isDjAuthorized(interaction.member, interaction.guild.id);
            if (!isAuthorized) {
                return interaction.reply({ content: '❌ You must have the DJ role to resume music.', flags: MessageFlags.Ephemeral });
            }

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
            .setDescription('Skip current playing track or initiate a vote to skip'),
        async execute(interaction) {
            const queue = musicManager.getQueue(interaction.guild.id);
            if (!queue.currentTrack) {
                return interaction.reply({ content: '⚠️ Nothing is currently playing to skip!', flags: MessageFlags.Ephemeral });
            }

            const voiceChannel = interaction.member.voice.channel;
            const listeners = voiceChannel ? voiceChannel.members.filter(m => !m.user.bot).size : 1;
            const isAuthorized = await isDjAuthorized(interaction.member, interaction.guild.id);

            // Direct skip if DJ, requester, or alone in channel
            if (isAuthorized || queue.currentTrack.requester.id === interaction.user.id || listeners <= 2) {
                const skipped = queue.skip();
                return interaction.reply({
                    content: `⏭️ Skipped by <@${interaction.user.id}>: **${skipped.title}**`
                });
            }

            // Vote to Skip Mechanism
            queue.skipVotes.add(interaction.user.id);
            const votesNeeded = Math.ceil(listeners / 2);
            if (queue.skipVotes.size >= votesNeeded) {
                const skipped = queue.skip();
                queue.skipVotes.clear();
                return interaction.reply({
                    content: `🗳️ **Vote Passed (${queue.skipVotes.size}/${votesNeeded})!** Skipped: **${skipped.title}**`
                });
            } else {
                return interaction.reply({
                    content: `🗳️ <@${interaction.user.id}> voted to skip (**${queue.skipVotes.size}/${votesNeeded}** votes needed from active listeners in voice)!`
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop music playback, clear the queue, and disconnect'),
        async execute(interaction) {
            const isAuthorized = await isDjAuthorized(interaction.member, interaction.guild.id);
            if (!isAuthorized) {
                return interaction.reply({ content: '❌ You must have the DJ role to stop music.', flags: MessageFlags.Ephemeral });
            }

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
            const isAuthorized = await isDjAuthorized(interaction.member, interaction.guild.id);
            if (!isAuthorized) {
                return interaction.reply({ content: '❌ You must have the DJ role to adjust volume.', flags: MessageFlags.Ephemeral });
            }

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
            .setName('playlist')
            .setDescription('Save, load, and manage custom server playlists')
            .addSubcommand(sub =>
                sub.setName('save')
                    .setDescription('Save the current playing queue as a named server playlist')
                    .addStringOption(opt =>
                        opt.setName('name')
                            .setDescription('Playlist name (e.g. Grandway Shift Hits, Late Night Restock)')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('load')
                    .setDescription('Load and queue a saved server playlist')
                    .addStringOption(opt =>
                        opt.setName('name')
                            .setDescription('Playlist name to load')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('List all saved server playlists')
            ),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();
            const db = getDb();
            const queue = musicManager.getQueue(interaction.guild.id);

            if (sub === 'save') {
                const name = interaction.options.getString('name').trim();
                const allTracks = [];
                if (queue.currentTrack) allTracks.push(queue.currentTrack);
                allTracks.push(...queue.queue);

                if (allTracks.length === 0) {
                    return interaction.reply({
                        content: '⚠️ There are no tracks in the queue to save! Play some songs first.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await db.saveServerPlaylist(name, allTracks, interaction.user.id, interaction.guild.id);
                return interaction.reply({
                    content: `✅ Saved **${allTracks.length} tracks** as server playlist **"${name}"**! Anyone can load it using \`/playlist load ${name}\`.`
                });
            }

            if (sub === 'load') {
                const name = interaction.options.getString('name').trim();
                const playlist = await db.getServerPlaylist(name);
                if (!playlist || !playlist.tracks || playlist.tracks.length === 0) {
                    return interaction.reply({
                        content: `❌ Playlist **"${name}"** not found! Use \`/playlist list\` to view available playlists.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const member = interaction.member;
                const voiceChannel = member.voice.channel;
                if (!voiceChannel) {
                    return interaction.reply({ content: '🔊 Connect to a voice channel first to load a playlist!', flags: MessageFlags.Ephemeral });
                }

                queue.connect(voiceChannel, interaction.channel);
                playlist.tracks.forEach(t => {
                    queue.queue.push({
                        ...t,
                        requester: { id: interaction.user.id, tag: interaction.user.tag }
                    });
                });

                if (!queue.isPlaying && !queue.currentTrack) {
                    queue.playTrack(queue.queue.shift());
                }

                return interaction.reply({
                    content: `🎶 Loaded playlist **"${playlist.name}"** with **${playlist.tracks.length} tracks** into the queue!`
                });
            }

            if (sub === 'list') {
                const list = await db.listServerPlaylists();
                if (list.length === 0) {
                    return interaction.reply({ content: 'ℹ️ No server playlists saved yet. Use `/playlist save <name>` to save the active queue!' });
                }

                const embed = new EmbedBuilder()
                    .setTitle('📂 Grandway Server Playlists')
                    .setDescription(list.map((p, i) => `**${i + 1}. ${p.name}** — \`${p.tracks.length} tracks\` (Saved by <@${p.authorId}>)`).join('\n'))
                    .setColor(config.colors.secondary)
                    .setFooter({ text: 'Load any playlist with /playlist load <name>' });

                return interaction.reply({ embeds: [embed] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('favorite')
            .setDescription('Bookmark and load songs from your personal favorites list')
            .addSubcommand(sub =>
                sub.setName('add')
                    .setDescription('Bookmark the current playing track or a search query to your favorites')
                    .addStringOption(opt =>
                        opt.setName('query')
                            .setDescription('Song title or URL to bookmark (Defaults to currently playing track)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('View your bookmarked favorite songs')
            )
            .addSubcommand(sub =>
                sub.setName('play')
                    .setDescription('Load and play all your bookmarked favorites')
            ),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();
            const db = getDb();
            const queue = musicManager.getQueue(interaction.guild.id);

            if (sub === 'add') {
                const customQuery = interaction.options.getString('query');
                let targetTrack = null;

                if (customQuery) {
                    const resolved = await musicManager.resolveQuery(customQuery, interaction.user);
                    if (resolved && (resolved.track || resolved.topTrack)) {
                        targetTrack = resolved.track || resolved.topTrack;
                    }
                } else if (queue.currentTrack) {
                    targetTrack = queue.currentTrack;
                }

                if (!targetTrack) {
                    return interaction.reply({ content: '⚠️ Nothing is currently playing and no song query was provided.', flags: MessageFlags.Ephemeral });
                }

                const added = await db.addUserFavorite(interaction.user.id, targetTrack);
                return interaction.reply({
                    content: added
                        ? `⭐ Added **${targetTrack.title}** to your personal favorites!`
                        : `ℹ️ **${targetTrack.title}** is already in your favorites.`
                });
            }

            if (sub === 'list') {
                const favs = await db.getUserFavorites(interaction.user.id);
                if (favs.length === 0) {
                    return interaction.reply({ content: '⭐ You have no favorite tracks saved yet. Use `/favorite add` while listening to save music!' });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`⭐ ${interaction.user.username}'s Favorite Tracks`)
                    .setDescription(favs.map((t, i) => `\`${i + 1}.\` [**${t.title}**](${t.url}) - \`${t.duration}\``).join('\n'))
                    .setColor(config.colors.primary)
                    .setFooter({ text: 'Load them all anytime with /favorite play' });

                return interaction.reply({ embeds: [embed] });
            }

            if (sub === 'play') {
                const favs = await db.getUserFavorites(interaction.user.id);
                if (favs.length === 0) {
                    return interaction.reply({ content: '⭐ You have no favorite tracks saved yet. Use `/favorite add` first!', flags: MessageFlags.Ephemeral });
                }

                const voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel) {
                    return interaction.reply({ content: '🔊 Please join a voice channel first.', flags: MessageFlags.Ephemeral });
                }

                queue.connect(voiceChannel, interaction.channel);
                favs.forEach(t => {
                    queue.queue.push({
                        ...t,
                        requester: { id: interaction.user.id, tag: interaction.user.tag }
                    });
                });

                if (!queue.isPlaying && !queue.currentTrack) {
                    queue.playTrack(queue.queue.shift());
                }

                return interaction.reply({
                    content: `🎶 Loaded **${favs.length} tracks** from your favorites into the queue!`
                });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('music-dj')
            .setDescription('Configure DJ role requirements, track limits, and sleep timers')
            .addSubcommand(sub =>
                sub.setName('role')
                    .setDescription('Set or clear the DJ role requirement for music controls')
                    .addRoleOption(opt =>
                        opt.setName('role')
                            .setDescription('The DJ role (leave empty to disable DJ requirement)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('limits')
                    .setDescription('Configure max track length and max queue size per member')
                    .addIntegerOption(opt =>
                        opt.setName('max_minutes')
                            .setDescription('Max song duration in minutes (e.g. 15)')
                            .setRequired(false)
                    )
                    .addIntegerOption(opt =>
                        opt.setName('max_queue')
                            .setDescription('Max tracks queued per user (e.g. 10)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('sleep')
                    .setDescription('Set a sleep timer after which the bot fades out and disconnects')
                    .addIntegerOption(opt =>
                        opt.setName('minutes')
                            .setDescription('Minutes until automatic shutoff (e.g. 30, or 0 to cancel)')
                            .setMinValue(0)
                            .setMaxValue(360)
                            .setRequired(true)
                    )
            ),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();
            const db = getDb();
            const member = interaction.member;
            const isManager = member.permissions.has('ManageGuild') || member.permissions.has('Administrator');

            if (sub === 'role') {
                if (!isManager) {
                    return interaction.reply({ content: '❌ Only administrators can configure the DJ role.', flags: MessageFlags.Ephemeral });
                }
                const role = interaction.options.getRole('role');
                await db.updateMusicSettings(interaction.guild.id, { djRoleId: role ? role.id : null });
                return interaction.reply({
                    content: role ? `🎧 DJ Role set to <@&${role.id}>! Only DJs and staff can pause, skip, and stop.` : '🎧 DJ Role requirement removed. All members can control music.'
                });
            }

            if (sub === 'limits') {
                if (!isManager) {
                    return interaction.reply({ content: '❌ Only administrators can configure music limits.', flags: MessageFlags.Ephemeral });
                }
                const maxMins = interaction.options.getInteger('max_minutes');
                const maxQueue = interaction.options.getInteger('max_queue');
                const update = {};
                if (maxMins) update.maxTrackSeconds = maxMins * 60;
                if (maxQueue) update.maxQueuePerUser = maxQueue;
                await db.updateMusicSettings(interaction.guild.id, update);
                return interaction.reply({
                    content: `⚙️ Updated limits: Max song length **${maxMins || 15}m**, max queue per user **${maxQueue || 10} tracks**.`
                });
            }

            if (sub === 'sleep') {
                const mins = interaction.options.getInteger('minutes');
                const queue = musicManager.getQueue(interaction.guild.id);
                if (mins === 0) {
                    queue.cancelSleepTimer();
                    return interaction.reply({ content: '⏰ Sleep timer cancelled.' });
                } else {
                    queue.setSleepTimer(mins, interaction.channel);
                    return interaction.reply({
                        content: `😴 Sleep timer set for **${mins} minutes**. Playback will stop and the bot will leave voice automatically.`
                    });
                }
            }
        }
    }
];

module.exports.searchSessions = searchSessions;
