const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

function buildSuggestionEmbed(sug) {
    const upvotes = Array.isArray(sug.upvotes) ? sug.upvotes.length : (JSON.parse(sug.upvotes || '[]')).length;
    const downvotes = Array.isArray(sug.downvotes) ? sug.downvotes.length : (JSON.parse(sug.downvotes || '[]')).length;

    let statusText = '⏳ Under Review';
    let statusColor = config.colors.secondary;
    if (sug.status === 'ACCEPTED') {
        statusText = '✅ Accepted by Management';
        statusColor = config.colors.primary;
    } else if (sug.status === 'DENIED') {
        statusText = '❌ Denied by Management';
        statusColor = config.colors.danger;
    } else if (sug.status === 'IN_PROGRESS') {
        statusText = '🚧 In Progress / Planned';
        statusColor = config.colors.warning;
    }

    const embed = new EmbedBuilder()
        .setTitle(`💡 FreshlyPlaza Suggestion #${sug.id}`)
        .setDescription(sug.suggestion)
        .addFields(
            { name: '👤 Submitted By', value: `<@${sug.user_id}>`, inline: true },
            { name: '📌 Status', value: statusText, inline: true },
            { name: '📊 Community Feedback', value: `👍 **${upvotes}** Upvotes • 👎 **${downvotes}** Downvotes`, inline: false }
        )
        .setColor(statusColor)
        .setFooter({ text: 'FreshlyPlaza Community Suggestions' })
        .setTimestamp();

    if (sug.action_reason) {
        embed.addFields({ name: '📝 Management Note', value: sug.action_reason, inline: false });
    }

    return embed;
}

function buildSuggestionButtons(sug) {
    const upvotes = Array.isArray(sug.upvotes) ? sug.upvotes.length : (JSON.parse(sug.upvotes || '[]')).length;
    const downvotes = Array.isArray(sug.downvotes) ? sug.downvotes.length : (JSON.parse(sug.downvotes || '[]')).length;

    // Row 1: Public Voting Buttons
    const voteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sug_upvote_${sug.id}`)
            .setLabel(`👍 Upvote (${upvotes})`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`sug_downvote_${sug.id}`)
            .setLabel(`👎 Downvote (${downvotes})`)
            .setStyle(ButtonStyle.Danger)
    );

    // Row 2: Management Decision Buttons
    const manageRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sug_accept_${sug.id}`)
            .setLabel('✅ Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`sug_progress_${sug.id}`)
            .setLabel('🚧 In Progress')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`sug_deny_${sug.id}`)
            .setLabel('❌ Deny')
            .setStyle(ButtonStyle.Danger)
    );

    return [voteRow, manageRow];
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('suggest')
            .setDescription('Submit a community suggestion for FreshlyPlaza')
            .addStringOption(opt => opt.setName('suggestion').setDescription('Your suggestion for FreshlyPlaza').setRequired(true)),
        async execute(interaction) {
            const db = getDb();
            const suggestionText = interaction.options.getString('suggestion');

            const res = await db.run(
                `INSERT INTO suggestions (user_id, suggestion, status) VALUES (?, ?, 'PENDING')`,
                [interaction.user.id, suggestionText]
            );

            const sug = {
                id: res.lastID,
                user_id: interaction.user.id,
                suggestion: suggestionText,
                status: 'PENDING',
                upvotes: [],
                downvotes: []
            };

            const embed = buildSuggestionEmbed(sug);
            const rows = buildSuggestionButtons(sug);

            const suggestionsChannelId = config.channels.suggestions;
            let suggestionsChannel = interaction.guild.channels.cache.get(suggestionsChannelId);
            if (!suggestionsChannel) {
                try {
                    suggestionsChannel = await interaction.guild.channels.fetch(suggestionsChannelId);
                } catch (e) {
                    suggestionsChannel = interaction.channel;
                }
            }

            if (suggestionsChannel) {
                const msg = await suggestionsChannel.send({ embeds: [embed], components: rows });
                await db.run(`UPDATE suggestions SET message_id = ? WHERE id = ?`, [msg.id, sug.id]);
            }

            return interaction.reply({ 
                content: `✅ Suggestion **#${sug.id}** submitted to <#${suggestionsChannel ? suggestionsChannel.id : config.channels.suggestions}>!`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
];

module.exports.buildSuggestionEmbed = buildSuggestionEmbed;
module.exports.buildSuggestionButtons = buildSuggestionButtons;
