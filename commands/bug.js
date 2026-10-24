const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    PermissionFlagsBits 
} = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

const BUG_CATEGORIES = {
    registers: '🛒 Cash Registers & Self-Checkouts',
    bakery: '🥐 Greggs Bakery & Food Stations',
    inventory: '📦 Inventory, Shelves & Trolleys',
    map: '🏬 Store Building & Physics/Collisions',
    security: '🛡️ Security & Door Access',
    bot: '🤖 Discord Bot & Commands',
    other: '❓ General / Other Glitch'
};

const SEVERITY_CONFIG = {
    critical: { label: '🔴 Critical / Game-Breaking', color: 0xE74C3C },
    moderate: { label: '🟡 Moderate Glitch', color: 0xF1C40F },
    minor:    { label: '🟢 Minor / Visual Bug', color: 0x2ECC71 }
};

/**
 * Builds the visual Discord Embed for a bug report
 */
function buildBugEmbed(bug) {
    const sevInfo = SEVERITY_CONFIG[bug.severity] || SEVERITY_CONFIG.moderate;
    const catLabel = BUG_CATEGORIES[bug.category] || (bug.category || 'General Bug');

    let statusDisplay = '⏳ Pending Review';
    let embedColor = sevInfo.color;

    if (bug.status === 'INVESTIGATING') {
        statusDisplay = '🔍 Investigating by Developer';
        embedColor = 0x3498DB;
    } else if (bug.status === 'KNOWN_ISSUE') {
        statusDisplay = '📌 Known Issue / Fix Planned';
        embedColor = 0xE67E22;
    } else if (bug.status === 'RESOLVED') {
        statusDisplay = '✅ Resolved & Patched';
        embedColor = 0x2ECC71;
    } else if (bug.status === 'INVALID') {
        statusDisplay = '❌ Cannot Reproduce / Invalid';
        embedColor = 0x95A5A6;
    }

    const embed = new EmbedBuilder()
        .setTitle(`🐛 Bug Report #${bug.id} — ${bug.title}`)
        .setDescription(bug.details)
        .addFields(
            { name: '📌 Status', value: `**${statusDisplay}**`, inline: true },
            { name: '⚠️ Severity', value: sevInfo.label, inline: true },
            { name: '🏬 Category', value: catLabel, inline: true },
            { name: '👤 Reporter', value: `<@${bug.user_id}>`, inline: true },
            { name: '🆔 Bug ID', value: `\`#${bug.id}\``, inline: true }
        )
        .setColor(embedColor)
        .setFooter({ text: `Grandway Shopping Bug Tracker • Submitted on` })
        .setTimestamp(bug.created_at ? new Date(bug.created_at) : new Date());

    if (bug.steps && bug.steps !== 'None provided') {
        embed.addFields({ name: '🔄 Steps to Reproduce', value: bug.steps, inline: false });
    }

    if (bug.evidence && bug.evidence !== 'None') {
        embed.addFields({ name: '📎 Evidence / Screenshot Links', value: bug.evidence, inline: false });
    }

    if (bug.handled_by) {
        embed.addFields({ name: '🛠️ Actioned By', value: `<@${bug.handled_by}>`, inline: true });
    }

    if (bug.resolution_notes) {
        embed.addFields({ name: '📝 Developer Notes', value: bug.resolution_notes, inline: false });
    }

    return embed;
}

/**
 * Builds Developer interactive action buttons for a bug card
 */
function buildBugActionButtons(bugId, currentStatus) {
    const isResolved = currentStatus === 'RESOLVED';
    const isInvalid = currentStatus === 'INVALID';

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bug_action_investigate_${bugId}`)
            .setLabel('Investigate')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentStatus === 'INVESTIGATING' || isResolved),
        new ButtonBuilder()
            .setCustomId(`bug_action_known_${bugId}`)
            .setLabel('Known Issue')
            .setEmoji('📌')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentStatus === 'KNOWN_ISSUE' || isResolved),
        new ButtonBuilder()
            .setCustomId(`bug_action_resolve_${bugId}`)
            .setLabel('Resolve & Patch')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(isResolved),
        new ButtonBuilder()
            .setCustomId(`bug_action_invalid_${bugId}`)
            .setLabel('Invalid')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(isInvalid || isResolved)
    );

    return [row];
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('bug')
            .setDescription('Submit a bug report to Grandway Shopping developers')
            .addStringOption(opt => opt.setName('title').setDescription('Short bug title / summary').setRequired(true))
            .addStringOption(opt => opt.setName('details').setDescription('Detailed description of what occurred').setRequired(true))
            .addStringOption(opt =>
                opt.setName('severity')
                    .setDescription('Bug severity level')
                    .setRequired(true)
                    .addChoices(
                        { name: '🔴 Critical / Game-Breaking (Exploit, Data Loss, Cash Register Crash)', value: 'critical' },
                        { name: '🟡 Moderate (Gameplay Glitch, Inventory Issue, Broken Button)', value: 'moderate' },
                        { name: '🟢 Minor (Visual Glitch, Collision, Minor Typo)', value: 'minor' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('category')
                    .setDescription('Affected store department')
                    .setRequired(false)
                    .addChoices(
                        { name: '🛒 Cash Registers & Checkouts', value: 'registers' },
                        { name: '🥐 Greggs Bakery & Food Counters', value: 'bakery' },
                        { name: '📦 Inventory, Shelves & Trolleys', value: 'inventory' },
                        { name: '🏬 Store Building & Physics', value: 'map' },
                        { name: '🛡️ Security & Door Access', value: 'security' },
                        { name: '🤖 Discord Bot & Commands', value: 'bot' }
                    )
            )
            .addStringOption(opt => opt.setName('steps').setDescription('Steps to reproduce (e.g. 1. Scan item, 2. Press card)').setRequired(false))
            .addStringOption(opt => opt.setName('evidence').setDescription('Screenshot or video links (e.g. medal.tv / imgur)').setRequired(false)),

        async execute(interaction) {
            const db = getDb();
            const data = db.getData();
            if (!data.bugs) data.bugs = [];

            const title = interaction.options.getString('title');
            const details = interaction.options.getString('details');
            const severity = interaction.options.getString('severity') || 'moderate';
            const category = interaction.options.getString('category') || 'other';
            const steps = interaction.options.getString('steps') || 'None provided';
            const evidence = interaction.options.getString('evidence') || 'None';

            const newId = data.bugs.length + 1;
            const bugRecord = {
                id: newId,
                user_id: interaction.user.id,
                title,
                details,
                severity,
                category,
                steps,
                evidence,
                status: 'PENDING',
                created_at: new Date().toISOString(),
                handled_by: null,
                resolution_notes: null,
                message_id: null,
                thread_id: null
            };

            data.bugs.push(bugRecord);
            db.save();

            const bugsChannel = interaction.guild.channels.cache.get(config.channels.bugsReport);
            if (bugsChannel) {
                const embed = buildBugEmbed(bugRecord);
                const buttons = buildBugActionButtons(newId, 'PENDING');
                const msg = await bugsChannel.send({ embeds: [embed], components: buttons });

                bugRecord.message_id = msg.id;

                // Create automatic public discussion thread
                try {
                    const thread = await msg.startThread({
                        name: `Bug #${newId} — ${title.slice(0, 50)}`,
                        autoArchiveDuration: 1440
                    });
                    bugRecord.thread_id = thread.id;
                    await thread.send(`👋 Discussion thread for Bug Report **#${newId}**. Players can share additional repro steps and screenshots here.`);
                } catch (tErr) {
                    console.warn('[BUG REPORT] Thread creation warning:', tErr.message);
                }

                db.save();
            }

            return interaction.reply({
                content: `✅ Bug report **#${newId}** has been submitted to <#${config.channels.bugsReport}>! Our development team has been notified.`,
                ephemeral: true
            });
        }
    },
];

module.exports.buildBugEmbed = buildBugEmbed;
module.exports.buildBugActionButtons = buildBugActionButtons;
module.exports.BUG_CATEGORIES = BUG_CATEGORIES;
module.exports.SEVERITY_CONFIG = SEVERITY_CONFIG;
