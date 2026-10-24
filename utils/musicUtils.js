const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const config = require('../config');

/**
 * Builds interactive Now Playing Embed with DSP effects badge
 */
function buildNowPlayingEmbed(track, queue) {
    const loopStatus = queue.loopMode === 'track' ? '🔂 Single Track' : (queue.loopMode === 'queue' ? '🔁 Entire Queue' : 'Off');
    const isPaused = queue.player.state.status === 'paused';
    const filterLabel = queue.activeFilter !== 'none' ? `🎛️ ${queue.activeFilter.toUpperCase()}` : 'Default (Clean)';
    const speedLabel = queue.speed !== 1.0 ? `${queue.speed}x` : '1.0x';

    const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`[**${track.title}**](${track.url})`)
        .addFields(
            { name: '🎤 Artist / Channel', value: track.author || 'Unknown', inline: true },
            { name: '⏱️ Duration', value: track.duration || 'Live', inline: true },
            { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
            { name: '⚡ Speed / Pitch', value: `\`${speedLabel}\``, inline: true },
            { name: '🎛️ DSP Preset', value: `\`${filterLabel}\``, inline: true },
            { name: '🔁 Loop Mode', value: loopStatus, inline: true },
            { name: '📑 In Queue', value: `${queue.queue.length} track(s)`, inline: true },
            { name: '👤 Requested By', value: `<@${track.requester.id}>`, inline: true }
        )
        .setColor(config.colors.primary)
        .setFooter({ text: `Grandway Music • Status: ${isPaused ? '⏸️ Paused' : '▶️ Playing'}` })
        .setTimestamp();

    if (track.thumbnail) {
        embed.setThumbnail(track.thumbnail);
    }

    return embed;
}

/**
 * Builds interactive control buttons for music player
 */
function buildMusicControlRow(queue) {
    const isPaused = queue.player.state.status === 'paused';

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_music_toggle_pause')
            .setLabel(isPaused ? '▶️ Resume' : '⏸️ Pause')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_music_skip')
            .setLabel('⏭️ Skip')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_music_stop')
            .setLabel('⏹️ Stop')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('btn_music_loop')
            .setLabel(`🔁 Loop (${queue.loopMode.toUpperCase()})`)
            .setStyle(queue.loopMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_music_show_queue')
            .setLabel('📜 Queue')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildSearchResultsMenu(results, searchSessionId) {
    const options = results.slice(0, 5).map((t, idx) => ({
        label: t.title.slice(0, 95),
        description: `${t.author} • ${t.duration}`.slice(0, 95),
        value: `${searchSessionId}_${idx}`,
        emoji: '🎵'
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_music_search_result')
            .setPlaceholder('🔍 Select a YouTube song to play...')
            .addOptions(options)
    );
}

function buildQueueEmbed(queue, page = 1) {
    const itemsPerPage = 8;
    const totalPages = Math.max(1, Math.ceil(queue.queue.length / itemsPerPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const embed = new EmbedBuilder()
        .setTitle('📜 Grandway Music Queue')
        .setColor(config.colors.secondary)
        .setFooter({ text: `Page ${currentPage} of ${totalPages} • Total in Queue: ${queue.queue.length}` });

    if (queue.currentTrack) {
        embed.setDescription(`**Currently Playing:**\n🎶 [${queue.currentTrack.title}](${queue.currentTrack.url}) | \`${queue.currentTrack.duration}\` • Requested by <@${queue.currentTrack.requester.id}>\n\n**Upcoming Tracks:**`);
    } else {
        embed.setDescription('**Currently Playing:** Nothing.\n\n**Upcoming Tracks:**');
    }

    if (queue.queue.length === 0) {
        embed.addFields({ name: 'Empty Queue', value: 'No tracks currently waiting. Use `/play` or the Web Dashboard to add music!' });
        return embed;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentTracks = queue.queue.slice(startIndex, startIndex + itemsPerPage);

    const listText = currentTracks.map((t, i) => {
        const trackNum = startIndex + i + 1;
        return `\`${trackNum}.\` [${t.title}](${t.url}) - \`${t.duration}\` (<@${t.requester.id}>)`;
    }).join('\n');

    embed.addFields({ name: 'Up Next', value: listText });

    return embed;
}

module.exports = {
    buildNowPlayingEmbed,
    buildMusicControlRow,
    buildSearchResultsMenu,
    buildQueueEmbed
};
