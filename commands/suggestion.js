const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    MessageFlags 
} = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

const SUGGESTION_CATEGORIES = {
    supermarket: '🛒 Store Features & Aisles',
    bakery: '🥐 Greggs Bakery & Food Items',
    uniforms: '👔 Staff Uniforms & Clothing',
    registers: '💳 Self-Checkouts & Payment',
    vehicles: '🚚 Delivery Trucks & Parking Lot',
    bot: '🤖 Discord Bot & Commands',
    other: '✨ General Community Idea'
};

/**
 * Builds a visual progress bar e.g. [████████░░] 80%
 */
function createProgressBar(yesCount, noCount, totalLength = 12) {
    const total = yesCount + noCount;
    if (total === 0) {
        return '`[░░░░░░░░░░░░]` **0% Yes (0 votes)**';
    }
    const yesRatio = yesCount / total;
    const filledCount = Math.round(yesRatio * totalLength);
    const emptyCount = totalLength - filledCount;
    const bar = '█'.repeat(filledCount) + '░'.repeat(emptyCount);
    const percentage = Math.round(yesRatio * 100);
    return `\`[${bar}]\` **${percentage}% Yes** (${yesCount} Yes • ${noCount} No)`;
}

function buildSuggestionEmbed(sug) {
    const upvotes = Array.isArray(sug.upvotes) ? sug.upvotes.length : JSON.parse(sug.upvotes || '[]').length;
    const downvotes = Array.isArray(sug.downvotes) ? sug.downvotes.length : JSON.parse(sug.downvotes || '[]').length;

    let statusText = '⏳ Community Voting & Under Review';
    let statusColor = 0x3498DB;

    if (sug.status === 'ACCEPTED') {
        statusText = '✅ Accepted by Management';
        statusColor = 0x2ECC71;
    } else if (sug.status === 'IN_PROGRESS') {
        statusText = '🚧 In Progress / Planned Update';
        statusColor = 0xF1C40F;
    } else if (sug.status === 'IMPLEMENTED') {
        statusText = '🎉 Implemented in Supermarket!';
        statusColor = 0x1ABC9C;
    } else if (sug.status === 'DENIED') {
        statusText = '❌ Denied by Leadership';
        statusColor = 0xE74C3C;
    }

    const catLabel = SUGGESTION_CATEGORIES[sug.category] || (sug.category || '✨ General Idea');
    const progressBar = createProgressBar(upvotes, downvotes);

    const embed = new EmbedBuilder()
        .setTitle(`💡 Grandway Suggestion #${sug.id} — ${sug.title || 'Community Idea'}`)
        .setDescription(sug.suggestion)
        .addFields(
            { name: '📌 Status', value: `**${statusText}**`, inline: true },
            { name: '🏬 Category', value: catLabel, inline: true },
            { name: '👤 Submitted By', value: `<@${sug.user_id}>`, inline: true },
            { name: '📊 Community Approval', value: progressBar, inline: false }
        )
        .setColor(statusColor)
        .setFooter({ text: 'Grandway Shopping Community Suggestions' })
        .setTimestamp(sug.created_at ? new Date(sug.created_at) : new Date());

    if (sug.actioned_by) {
        embed.addFields({ name: '👔 Actioned By', value: `<@${sug.actioned_by}>`, inline: true });
    }

    if (sug.action_reason) {
        embed.addFields({ name: '📝 Management Note', value: sug.action_reason, inline: false });
    }

    return embed;
}

function buildSuggestionButtons(sug) {
    const upvotes = Array.isArray(sug.upvotes) ? sug.upvotes.length : JSON.parse(sug.upvotes || '[]').length;
    const downvotes = Array.isArray(sug.downvotes) ? sug.downvotes.length : JSON.parse(sug.downvotes || '[]').length;

    const isClosed = sug.status === 'ACCEPTED' || sug.status === 'DENIED' || sug.status === 'IMPLEMENTED';

    // Row 1: Public Voting Buttons
    const voteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sug_upvote_${sug.id}`)
            .setLabel(`Upvote (${upvotes})`)
            .setEmoji('👍')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`sug_downvote_${sug.id}`)
            .setLabel(`Downvote (${downvotes})`)
            .setEmoji('👎')
            .setStyle(ButtonStyle.Danger)
    );

    // Row 2: Management Decision Buttons
    const manageRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`sug_accept_${sug.id}`)
            .setLabel('Accept')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(sug.status === 'ACCEPTED'),
        new ButtonBuilder()
            .setCustomId(`sug_progress_${sug.id}`)
            .setLabel('In Progress')
            .setEmoji('🚧')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(sug.status === 'IN_PROGRESS'),
        new ButtonBuilder()
            .setCustomId(`sug_implement_${sug.id}`)
            .setLabel('Implemented')
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Success)
            .setDisabled(sug.status === 'IMPLEMENTED'),
        new ButtonBuilder()
            .setCustomId(`sug_deny_${sug.id}`)
            .setLabel('Deny')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(sug.status === 'DENIED')
    );

    return [voteRow, manageRow];
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('suggest')
            .setDescription('Submit a community suggestion for Grandway Shopping')
            .addStringOption(opt => opt.setName('title').setDescription('Brief title for your suggestion').setRequired(true))
            .addStringOption(opt => opt.setName('idea').setDescription('Detailed description of your idea').setRequired(true))
            .addStringOption(opt =>
                opt.setName('category')
                    .setDescription('Suggestion category')
                    .setRequired(false)
                    .addChoices(
                        { name: '🛒 Store Features & Aisles', value: 'supermarket' },
                        { name: '🥐 Greggs Bakery & Food Items', value: 'bakery' },
                        { name: '👔 Staff Uniforms & Clothing', value: 'uniforms' },
                        { name: '💳 Self-Checkouts & Payment', value: 'registers' },
                        { name: '🚚 Delivery Trucks & Parking', value: 'vehicles' },
                        { name: '🤖 Discord Bot & Commands', value: 'bot' }
                    )
            ),
        async execute(interaction) {
            const db = getDb();
            const data = db.getData();
            if (!data.suggestions) data.suggestions = [];

            const title = interaction.options.getString('title');
            const idea = interaction.options.getString('idea');
            const category = interaction.options.getString('category') || 'other';

            const newId = data.suggestions.length + 1;
            const sug = {
                id: newId,
                user_id: interaction.user.id,
                title,
                suggestion: idea,
                category,
                status: 'PENDING',
                upvotes: [],
                downvotes: [],
                created_at: new Date().toISOString(),
                actioned_by: null,
                action_reason: null,
                message_id: null,
                thread_id: null
            };

            data.suggestions.push(sug);
            db.save();

            const suggestionsChannelId = config.channels.suggestions;
            const suggestionsChannel = interaction.guild.channels.cache.get(suggestionsChannelId);

            if (suggestionsChannel) {
                const embed = buildSuggestionEmbed(sug);
                const rows = buildSuggestionButtons(sug);
                const msg = await suggestionsChannel.send({ embeds: [embed], components: rows });

                sug.message_id = msg.id;

                // Create public discussion thread
                try {
                    const thread = await msg.startThread({
                        name: `Suggestion #${newId} — ${title.slice(0, 50)}`,
                        autoArchiveDuration: 1440
                    });
                    sug.thread_id = thread.id;
                    await thread.send(`👋 Community discussion thread for Suggestion **#${newId}**. Discuss your thoughts below!`);
                } catch (tErr) {}

                db.save();
            }

            return interaction.reply({ 
                content: `✅ Suggestion **#${sug.id}** submitted to <#${config.channels.suggestions}>!`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
];

module.exports.buildSuggestionEmbed = buildSuggestionEmbed;
module.exports.buildSuggestionButtons = buildSuggestionButtons;
module.exports.SUGGESTION_CATEGORIES = SUGGESTION_CATEGORIES;
