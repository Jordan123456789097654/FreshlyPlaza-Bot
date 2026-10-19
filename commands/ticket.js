const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    SlashCommandBuilder, 
    ChannelType, 
    PermissionFlagsBits, 
    MessageFlags,
    AttachmentBuilder
} = require('discord.js');
const config = require('../config');
const { hasTicketOverride, withTicketOverride } = require('../utils/ticketAccess');
const { getDb } = require('../database');
const { generateHtmlTranscript } = require('../utils/transcript');

// Pre-defined quick support snippet tags for fast staff replies (Supports dynamic {staff}, {customer}, {store} placeholders)
const SUPPORT_TAGS = {
    intro_general: {
        title: '👋 Staff Intro: General Support',
        emoji: '👋',
        color: config.colors.primary,
        desc: 'Hello {customer}! My name is **{staff}** from the FreshlyPlaza Support Team.\n\nI will be assisting you with your ticket today. Please let me know how I can help or clarify your inquiry!'
    },
    intro_investigating: {
        title: '🔍 Staff Intro: Under Investigation',
        emoji: '🔍',
        color: config.colors.secondary,
        desc: 'Hello {customer}, my name is **{staff}**.\n\nI have claimed your ticket and am currently reviewing your provided details and checking our store logs. I will update you here shortly!'
    },
    intro_management: {
        title: '💼 Staff Intro: Management Handover',
        emoji: '💼',
        color: config.colors.warning,
        desc: 'Hello {customer}, this is **{staff}** from FreshlyPlaza Store Leadership & Management.\n\nThank you for reaching out regarding this matter. I am reviewing the specifics of your request and will provide formal guidance momentarily.'
    },
    proof: {
        title: '📸 Proof & Evidence Required',
        emoji: '📸',
        color: config.colors.danger,
        desc: 'To properly investigate and action reports regarding player behavior, exploiter activity, or staff misconduct, **clear, unedited screenshot or video proof is mandatory**.\n\nPlease upload your screenshot or record link directly here. Reports without evidence cannot be actioned.'
    },
    shifts: {
        title: '🕒 FreshlyPlaza Shift Information',
        emoji: '🕒',
        color: config.colors.secondary,
        desc: 'FreshlyPlaza supermarket shifts are hosted daily by our management team!\n\n• Check <#1505309843219546223> for ongoing store shifts.\n• You can register for upcoming shift alerts or attend in-game at [FreshlyPlaza Supermarket](https://www.roblox.com/games/76637220767393/FreshlyPlazza-V2).'
    },
    apply: {
        title: '💼 Staff & Developer Applications',
        emoji: '💼',
        color: config.colors.primary,
        desc: 'Thank you for your interest in working with FreshlyPlaza!\n\nApplications for Developer, Store Staff, and Management positions are reviewed directly by leadership here in support tickets.\n\nPlease provide your Roblox username, past portfolio/experience, and reasons for joining so our team can evaluate your application.'
    },
    verify: {
        title: '🎮 Roblox Account Verification',
        emoji: '🎮',
        color: config.colors.neutral,
        desc: 'To link your Roblox account with our Discord server:\n\n• Use the `/verify` command or visit <#1505203971839496344> (#verification).\n• Enter your Roblox username so our bot can sync your in-game store ranks and customer perks.'
    },
    tillbug: {
        title: '🛒 Self-Checkout & Register Issue Guide',
        emoji: '🛒',
        color: 0x9B59B6,
        desc: 'If a self-checkout till is stuck or scanner is unresponsive:\n\n1. Step away from the register zone for 3 seconds to reset the proximity prompt.\n2. Ensure your shopping basket is fully emptied onto the scanner pad.\n3. If issues persist, a Colleague can reset the terminal via the Staff Override key.'
    },
    appeal: {
        title: '⚖️ Moderation & Ban Appeal Guidelines',
        emoji: '⚖️',
        color: 0x1ABC9C,
        desc: 'When submitting a formal moderation or ban appeal, please follow these guidelines:\n\n• State your Discord tag, Roblox username, and reason for the ban.\n• Wait at least **48 hours** before submitting your appeal.\n• Explain honestly what happened and how you will follow server rules going forward.'
    },
    rules: {
        title: '📜 Store & Discord Rules',
        emoji: '📜',
        color: config.colors.warning,
        desc: 'All customers and staff members are expected to follow our guidelines:\n\n• Be respectful to other shoppers and colleagues.\n• No trolling, register spamming, or exploiting.\n• Follow Discord Community Guidelines & Terms of Service.'
    },
    patience: {
        title: '⏳ Our Team is Working on Your Request',
        emoji: '⏳',
        color: config.colors.secondary,
        desc: 'Thank you for your patience! Support Colleague **{staff}** is reviewing your ticket and gathering the necessary details. We will be right with you.'
    },
    moreinfo: {
        title: '❓ Additional Information Requested',
        emoji: '❓',
        color: config.colors.warning,
        desc: 'In order for **{staff}** to assist you further, please provide additional details regarding your request:\n\n• What exactly occurred and when?\n• Any relevant Roblox usernames or screenshots?\n• Steps to reproduce if you are reporting a bug or till error.'
    },
    resolved: {
        title: '✅ Issue Resolved / Anything Else?',
        emoji: '✅',
        color: config.colors.primary,
        desc: 'It looks like this issue has been successfully resolved! Is there anything else **{staff}** can assist you with today before we close this ticket?'
    },
    closing_soon: {
        title: '🔒 Inactivity / Pending Closure Notice',
        emoji: '🔒',
        color: config.colors.neutral,
        desc: 'Hello {customer}! We haven\'t heard back from you in a little while. If you no longer need assistance, this ticket will be closed shortly. Feel free to reply if you still need help!'
    }
};

function buildSnippetSelectMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_support_tag')
            .setPlaceholder('⚡ Select a Quick Support Tag Snippet...')
            .addOptions(
                Object.entries(SUPPORT_TAGS).map(([key, tag]) => ({
                    label: tag.title.replace(/[^\w\s&()/-]/g, '').trim(),
                    value: key,
                    emoji: tag.emoji,
                    description: tag.desc.slice(0, 95)
                }))
            )
    );
}

// Multi-category definitions with corresponding customer support role
const TICKET_CATEGORIES = {
    general: {
        label: 'Customer & General Support',
        emoji: '🛒',
        description: 'Help with FreshlyPlaza Roblox store, checkout, and discord',
        roleKey: 'supportGeneral',
        color: config.colors.secondary
    },
    report: {
        label: 'Player or Staff Report',
        emoji: '🛡️',
        description: 'Report rule violations, toxic behavior, or exploiter activity',
        roleKey: 'supportReport',
        color: config.colors.danger
    },
    management: {
        label: 'HR & Management Inquiry',
        emoji: '💼',
        description: 'Staff leadership, business contact, promotion, or LOA queries',
        roleKey: 'supportManagement',
        color: config.colors.warning
    },
    technical: {
        label: 'Technical & Bug Support',
        emoji: '🐛',
        description: 'Store glitches, register bugs, or account connection issues',
        roleKey: 'supportTechnical',
        color: 0x9B59B6
    },
    appeals: {
        label: 'Moderation & Ban Appeal',
        emoji: '⚖️',
        description: 'Appeal a store timeout, server ban, or strike',
        roleKey: 'supportAppeals',
        color: 0x1ABC9C
    },
    data_entries: {
        label: 'DATA-ENTRIES (AI Disabled)',
        emoji: '📁',
        description: 'Direct staff records, roster adjustments, and data entries (AI disabled)',
        roleKey: 'supportManagement',
        targetUserId: '1046538179399929957',
        color: 0x34495E,
        aiDisabled: true,
        staffOnly: true
    }
};

async function buildTicketPanelEmbed(guild) {
    const { getDb } = require('../database');
    const db = getDb();
    const settings = await db.getTicketSettings();

    if (!settings.enabled) {
        const disabledEmbed = new EmbedBuilder()
            .setTitle('🎫 FreshlyPlaza Support Center — Temporarily Paused')
            .setDescription(
                `⚠️ **Support Tickets are Currently Paused**\n\n` +
                `${settings.disabled_reason || 'Support tickets are temporarily closed for scheduled maintenance.'}\n\n` +
                `Please check back soon or keep an eye on <#${config.channels.announcements}> for updates!`
            )
            .setColor(config.colors.warning)
            .setThumbnail(guild ? guild.iconURL({ dynamic: true }) : null)
            .setFooter({ text: 'FreshlyPlaza Support • Status: Paused' });

        if (settings.panel_image_url) {
            disabledEmbed.setImage(settings.panel_image_url);
        }
        return disabledEmbed;
    }

    // Live Queue Statistics & Dynamic Wait Times
    const allTickets = (db.getData().tickets || []);

    // Filter active tickets strictly to those whose Discord channel currently exists in the guild!
    const activeTickets = allTickets.filter(t => {
        const isLiveStatus = t.status === 'OPEN' || t.status === 'CLAIMED' || t.status === 'ESCALATED';
        if (!isLiveStatus) return false;
        if (!guild) return true;
        // Verify channel is currently present in guild cache
        const channelExists = guild.channels.cache.has(t.channel_id);
        if (!channelExists && t.channel_id) {
            return false;
        }
        return true;
    });

    const openTicketsWaiting = activeTickets.filter(t => (t.status === 'OPEN' || t.status === 'ESCALATED') && !t.claimed_by).length;
    const totalOpenTickets = activeTickets.length;

    const catCounts = {
        general: 0,
        report: 0,
        management: 0,
        technical: 0,
        appeals: 0,
        data_entries: 0
    };

    activeTickets.forEach(t => {
        const catKey = t.type || 'general';
        if (catCounts[catKey] !== undefined) {
            catCounts[catKey]++;
        } else {
            catCounts.general++;
        }
    });

    // Save DB if any ghost tickets were cleaned up
    db.save();

    if (guild && guild.members.cache.size < 10) {
        try {
            await guild.members.fetch();
        } catch (e) {}
    }

    const staffMembers = guild ? guild.members.cache.filter(m => 
        (m.roles.cache.has(config.roles.staff) || m.roles.cache.has(config.roles.mr) || m.roles.cache.has(config.roles.hr)) && 
        !m.user.bot
    ) : null;

    let onlineStaffCount = 0;
    if (staffMembers) {
        const online = staffMembers.filter(m => m.presence && m.presence.status !== 'offline');
        onlineStaffCount = online.size > 0 ? online.size : staffMembers.size;
    }
    const activeStaffCount = Math.max(1, onlineStaffCount);

    // Estimated wait calculation
    let waitTimeText = '⚡ Instant (< 1 min)';
    let footerEst = '~1m';
    if (openTicketsWaiting > 0) {
        const estimatedMinutes = Math.max(1, Math.ceil((openTicketsWaiting * 4) / Math.max(1, activeStaffCount)));
        waitTimeText = estimatedMinutes <= 3 ? `⚡ ~${estimatedMinutes} mins (Very Fast)` : estimatedMinutes <= 10 ? `⏱️ ~${estimatedMinutes} mins (Normal)` : `⏳ ~${estimatedMinutes} mins (High Traffic)`;
        footerEst = `~${estimatedMinutes}m`;
    }

    const embed = new EmbedBuilder()
        .setTitle('🎫 FreshlyPlaza — Customer & Staff Support Center')
        .setDescription(
            `Welcome to the **FreshlyPlaza Support System**!\n` +
            `Our automated AI Assistant and dedicated department staff are here to help.\n\n` +
            `📊 **Live Support Queue & Response Status:**\n` +
            `> 🟢 **Staff on Duty:** \`${activeStaffCount} Colleagues Online\`\n` +
            `> 🎫 **Total Open Tickets:** \`${totalOpenTickets} Active\` (${openTicketsWaiting} awaiting staff)\n` +
            `> ⚡ **Estimated Wait Time:** \`${waitTimeText}\`\n\n` +
            `📋 **Active Tickets by Category:**\n` +
            `> 🛒 General: \`${catCounts.general}\` • 🛡️ Report: \`${catCounts.report}\` • 💼 Management: \`${catCounts.management}\`\n` +
            `> 🐛 Technical: \`${catCounts.technical}\` • ⚖️ Appeals: \`${catCounts.appeals}\` • 📁 Data Entries: \`${catCounts.data_entries}\`\n\n` +
            `⚠️ **AI Beta Notice:** *Our automated AI assistant is currently in beta. All tickets opened will help train and refine our AI model to better serve FreshlyPlaza customers!*\n\n` +
            `Select the appropriate category from the menu below to open your private support ticket.`
        )
        .addFields(
            { name: `🛒 Customer & General Support (${catCounts.general} open)`, value: 'Questions regarding store items, aisles, shifts, or Roblox store gameplay.', inline: false },
            { name: `🛡️ Player & Staff Report (${catCounts.report} open)`, value: 'Report exploiter activity, rule infractions, or colleague misconduct *(Valid proof/screenshot required)*.', inline: false },
            { name: `💼 HR & Management Inquiry (${catCounts.management} open)`, value: 'Inquiries for Foundership, High Rank management, and staff partnerships.', inline: false },
            { name: `🐛 Technical & Bug Support (${catCounts.technical} open)`, value: 'Report game bugs, till errors, or Discord verification issues.', inline: false },
            { name: `⚖️ Moderation & Ban Appeal (${catCounts.appeals} open)`, value: 'Submit formal appeals regarding strikes, kicks, or server bans.', inline: false },
            { name: `📁 DATA-ENTRIES (AI Disabled) (${catCounts.data_entries} open)`, value: 'Direct human-only staff records, roster adjustments, and data entries.', inline: false }
        )
        .setColor(config.colors.primary)
        .setThumbnail(guild ? guild.iconURL({ dynamic: true }) : null)
        .setFooter({ text: `FreshlyPlaza Support Suite • ${totalOpenTickets} Open Tickets • Est: ${footerEst}`, iconURL: guild ? guild.iconURL() : null });

    if (settings.panel_image_url) {
        embed.setImage(settings.panel_image_url);
    }

    return embed;
}

function buildTicketPanelSelectMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_ticket_type')
            .setPlaceholder('Select a Support Category to Open a Ticket...')
            .addOptions(
                Object.entries(TICKET_CATEGORIES).map(([key, cat]) => ({
                    label: cat.label,
                    value: key,
                    emoji: cat.emoji,
                    description: cat.description
                }))
            )
    );
}

function buildTransferSelectMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_ticket_transfer')
            .setPlaceholder('Select a department to transfer this ticket to...')
            .addOptions(
                Object.entries(TICKET_CATEGORIES).map(([key, cat]) => ({
                    label: cat.label,
                    value: key,
                    emoji: cat.emoji,
                    description: `Reassign to ${cat.label}`
                }))
            )
    );
}

function buildTicketControlRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_ticket_claim').setLabel('✋ Claim Ticket').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_ticket_transfer_menu').setLabel('🔀 Transfer').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_ticket_snippets').setLabel('⚡ Quick Tags').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_ticket_ai_summary').setLabel('📝 AI Summary').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_ticket_close_prompt').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
    );
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('ticket-panel')
            .setDescription('Deploy the interactive multi-category Ticket Support Panel in this channel')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        async execute(interaction) {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                 member.roles.cache.has(config.roles.hr) ||
                                 member.roles.cache.has(config.roles.mr) ||
                                 (config.ignoredUserIds || []).includes(interaction.user.id);

            if (!isAuthorized) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff Management can deploy the ticket panel.', flags: MessageFlags.Ephemeral });
            }

            const embed = await buildTicketPanelEmbed(interaction.guild);
            const menu = buildTicketPanelSelectMenu();

            const panelMsg = await interaction.channel.send({ embeds: [embed], components: [menu] });
            const db = getDb();
            await db.updateTicketSettings({
                panel_channel_id: interaction.channel.id,
                panel_message_id: panelMsg.id
            });
            return interaction.reply({ content: '✅ Interactive Ticket Panel deployed successfully in this channel!', flags: MessageFlags.Ephemeral });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-create')
            .setDescription('Create a private support ticket directly via slash command')
            .addStringOption(opt =>
                opt.setName('category')
                   .setDescription('Support category')
                   .setRequired(true)
                   .addChoices(
                       { name: '🛒 Customer & General Support', value: 'general' },
                       { name: '🛡️ Player or Staff Report', value: 'report' },
                       { name: '💼 HR & Management Inquiry', value: 'management' },
                       { name: '🐛 Technical & Bug Support', value: 'technical' },
                       { name: '⚖️ Moderation & Ban Appeal', value: 'appeals' },
                       { name: '📁 DATA-ENTRIES (AI Disabled)', value: 'data_entries' }
                   )
            )
            .addStringOption(opt =>
                opt.setName('subject')
                   .setDescription('Brief summary of what you need help with')
                   .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const categoryKey = interaction.options.getString('category');
            const subject = interaction.options.getString('subject') || 'Direct Slash Command Ticket';

            const activeTicket = await db.getActiveUserTicket(interaction.user.id, categoryKey);
            if (activeTicket) {
                return interaction.editReply({
                    content: `⚠️ You already have an open ticket in this category: <#${activeTicket.channel_id}>. Please resolve your existing ticket first.`
                });
            }

            const catConfig = TICKET_CATEGORIES[categoryKey] || TICKET_CATEGORIES.general;
            const targetRoleId = config.roles[catConfig.roleKey] || config.roles.staff;

            if (catConfig.staffOnly) {
                const isStaff = interaction.member && (
                    hasTicketOverride(interaction.member) || interaction.member.roles.cache.has(config.roles.staff) ||
                    interaction.member.roles.cache.has(config.roles.mr) ||
                    interaction.member.roles.cache.has(config.roles.hr) ||
                    interaction.member.roles.cache.has(config.roles.trainee) ||
                    interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
                );
                if (!isStaff) {
                    return interaction.editReply({
                        content: '🚫 **Access Denied:** The `DATA-ENTRIES` category is strictly reserved for FreshlyPlaza Staff members.'
                    });
                }
            }

            // Find dedicated ━━━ 🎫 SUPPORT TICKETS ━━━ category in the guild
            const supportCategory = interaction.guild.channels.cache.find(c => 
                c.type === ChannelType.GuildCategory && 
                (c.name.includes('SUPPORT TICKETS') || c.id === config.channels.ticketsCategory || c.id === '1558519068951187498')
            );
            const parentCategoryId = supportCategory ? supportCategory.id : (config.channels.ticketsCategory || interaction.channel.parentId);

            const permissionOverwrites = [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { 
                    id: interaction.user.id, 
                    allow: [
                        PermissionFlagsBits.ViewChannel, 
                        PermissionFlagsBits.SendMessages, 
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks
                    ] 
                }
            ];

            if (catConfig.targetUserId) {
                // Only this user can see it; explicitly deny other staff roles from seeing it
                const rolesToDeny = [
                    config.roles.staff,
                    config.roles.mr,
                    config.roles.hr,
                    config.roles.trainee,
                    config.roles.supportManagement,
                    config.roles.supportGeneral,
                    config.roles.supportReport,
                    config.roles.supportTechnical,
                    config.roles.supportAppeals
                ].filter(Boolean);

                for (const rId of rolesToDeny) {
                    permissionOverwrites.push({
                        id: rId,
                        deny: [PermissionFlagsBits.ViewChannel]
                    });
                }

                if (interaction.user.id !== catConfig.targetUserId) {
                    permissionOverwrites.push({
                        id: catConfig.targetUserId,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ManageMessages
                        ]
                    });
                }
            } else {
                permissionOverwrites.push({
                    id: targetRoleId, 
                    allow: [
                        PermissionFlagsBits.ViewChannel, 
                        PermissionFlagsBits.SendMessages, 
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages
                    ] 
                });
            }

            const ticketChannel = await interaction.guild.channels.create({
                name: `${categoryKey}-${interaction.user.username.toLowerCase()}`.slice(0, 32),
                type: ChannelType.GuildText,
                parent: parentCategoryId,
                permissionOverwrites: withTicketOverride(permissionOverwrites)
            });

            const ticketRecord = await db.createTicketRecord({
                channelId: ticketChannel.id,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                type: categoryKey,
                subject,
                details: subject,
                aiDisabled: Boolean(catConfig.aiDisabled)
            });

            const staffMention = catConfig.targetUserId ? `<@${catConfig.targetUserId}>` : `<@&${targetRoleId}>`;

            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket #${ticketRecord.id} — ${catConfig.label}`)
                .setDescription(
                    catConfig.aiDisabled
                        ? `Hello <@${interaction.user.id}>! You have opened a **DATA-ENTRIES** ticket.\n\n🚫 **AI Support is DISABLED** for this room. You are speaking directly with ${staffMention}.\n\nPlease provide your data entries, roster updates, or internal records below.`
                        : `Hello <@${interaction.user.id}>! Thank you for contacting FreshlyPlaza Support.\n\n` +
                          `🤖 **AI Support:** Our intelligent system is actively monitoring this ticket. If your question is standard, you will receive an immediate resolution. If specialized assistance is required, it will instantly escalate to our ${staffMention} team.\n\n` +
                          `Please explain your question or issue in detail below.`
                )
                .addFields(
                    { name: '📋 Category', value: `${catConfig.emoji} ${catConfig.label}`, inline: true },
                    { name: '👤 Creator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: catConfig.targetUserId ? '🛡️ Assigned Staff' : '🛡️ Assigned Department', value: staffMention, inline: true },
                    { name: '📝 Subject', value: subject, inline: false }
                )
                .setColor(catConfig.color)
                .setTimestamp()
                .setFooter({ text: catConfig.aiDisabled ? 'FreshlyPlaza Data Room • Human Staff Only' : 'FreshlyPlaza Ticket Suite • Use buttons below to manage', iconURL: interaction.guild.iconURL() });

            await ticketChannel.send({
                content: catConfig.targetUserId ? `<@${catConfig.targetUserId}>` : `<@${interaction.user.id}> <@&${targetRoleId}>`,
                embeds: [welcomeEmbed],
                components: [buildTicketControlRow()]
            });

            return interaction.editReply({
                content: `✅ Your ticket **#${ticketRecord.id}** has been created! Head over to <#${ticketChannel.id}>.`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-force-open')
            .setDescription('Force open a direct, human-only ticket with a member (AI is completely disabled)')
            .addUserOption(opt =>
                opt.setName('member')
                    .setDescription('The member to force open a ticket with')
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt.setName('category')
                    .setDescription('Support category for this ticket')
                    .setRequired(true)
                    .addChoices(
                        { name: '💼 HR & Management Inquiry', value: 'management' },
                        { name: '🛡️ Player or Staff Report', value: 'report' },
                        { name: '🛒 Customer & General Support', value: 'general' },
                        { name: '🐛 Technical & Bug Support', value: 'technical' },
                        { name: '⚖️ Moderation & Ban Appeal', value: 'appeals' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('reason')
                    .setDescription('Reason for force opening this ticket with the member')
                    .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                                 hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                                 member.roles.cache.has(config.roles.mr) ||
                                 member.roles.cache.has(config.roles.hr) ||
                                 (config.ignoredUserIds || []).includes(interaction.user.id);

            if (!isAuthorized) {
                return interaction.editReply({ content: '❌ Only FreshlyPlaza Staff can force open a ticket.' });
            }

            const targetUser = interaction.options.getUser('member');
            const categoryKey = interaction.options.getString('category');
            const reason = interaction.options.getString('reason') || 'Staff initiated inquiry / investigation';

            const db = getDb();
            const catConfig = TICKET_CATEGORIES[categoryKey] || TICKET_CATEGORIES.general;
            const targetRoleId = config.roles[catConfig.roleKey] || config.roles.staff;

            // Find dedicated ━━━ 🎫 SUPPORT TICKETS ━━━ category in the guild
            const supportCategory = interaction.guild.channels.cache.find(c => 
                c.type === ChannelType.GuildCategory && 
                (c.name.includes('SUPPORT TICKETS') || c.id === config.channels.ticketsCategory || c.id === '1558519068951187498')
            );
            const parentCategoryId = supportCategory ? supportCategory.id : (config.channels.ticketsCategory || interaction.channel.parentId);

            const ticketChannel = await interaction.guild.channels.create({
                name: `forced-${targetUser.username.toLowerCase()}`.slice(0, 32),
                type: ChannelType.GuildText,
                parent: parentCategoryId,
                permissionOverwrites: withTicketOverride([
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { 
                        id: targetUser.id, 
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks
                        ] 
                    },
                    { 
                        id: interaction.user.id, 
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks
                        ] 
                    },
                    { 
                        id: targetRoleId, 
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.ManageMessages
                        ] 
                    }
                ])
            });

            const ticketRecord = await db.createTicketRecord({
                channelId: ticketChannel.id,
                userId: targetUser.id,
                userTag: targetUser.tag,
                type: categoryKey,
                subject: `[STAFF FORCE OPENED] ${reason}`,
                details: `Opened by staff <@${interaction.user.id}> for reason: ${reason}`,
                aiDisabled: true
            });

            // Mark as immediately claimed by initiating staff
            ticketRecord.claimed_by = interaction.user.id;
            ticketRecord.claimed_at = new Date().toISOString();
            ticketRecord.status = 'CLAIMED';
            ticketRecord.ai_disabled = true;
            db.save();

            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🚨 Staff Direct Inquiry — Ticket #${ticketRecord.id}`)
                .setDescription(
                    `Hello <@${targetUser.id}>,\n\n` +
                    `A FreshlyPlaza Staff Member (<@${interaction.user.id}>) has opened this direct communication channel with you regarding:\n` +
                    `> **${reason}**\n\n` +
                    `🚫 **AI Support is DISABLED** for this ticket. You are speaking directly with our verified Human Staff Team.\n\n` +
                    `Please review the staff member's message and respond in this channel.`
                )
                .addFields(
                    { name: '📋 Category', value: `${catConfig.emoji} ${catConfig.label}`, inline: true },
                    { name: '👤 Member', value: `<@${targetUser.id}>`, inline: true },
                    { name: '🛡️ Initiating Staff', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🤖 AI Assistant Status', value: '`🔴 DISABLED (Human Staff Only)`', inline: false }
                )
                .setColor(config.colors.warning)
                .setTimestamp()
                .setFooter({ text: 'FreshlyPlaza Staff Direct Channel • Human Moderation' });

            await ticketChannel.send({
                content: `<@${targetUser.id}> <@${interaction.user.id}> <@&${targetRoleId}> 🔔 **DIRECT STAFF INQUIRY**`,
                embeds: [welcomeEmbed],
                components: [buildTicketControlRow()]
            });

            // Attempt friendly DM notification to user
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`🏪 FreshlyPlaza — Direct Staff Inquiry`)
                    .setDescription(`A FreshlyPlaza Staff Member (<@${interaction.user.id}>) has opened a direct support ticket with you in the server.\n\n**Reason:** ${reason}\n\nPlease head over to <#${ticketChannel.id}> to speak with staff.`)
                    .setColor(config.colors.warning);
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (dmErr) {}

            return interaction.editReply({
                content: `✅ Force-opened ticket **#${ticketRecord.id}** with <@${targetUser.id}> in <#${ticketChannel.id}>! (AI disabled)`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-claim')
            .setDescription('Claim ownership of the current ticket as a staff member'),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ This command can only be used inside an active ticket channel.' });
            }

            if (ticket.claimed_by) {
                return interaction.editReply({ content: `⚠️ This ticket has already been claimed by <@${ticket.claimed_by}>.` });
            }

            ticket.claimed_by = interaction.user.id;
            ticket.claimed_at = new Date().toISOString();
            ticket.status = 'CLAIMED';
            db.save();

            const claimEmbed = new EmbedBuilder()
                .setTitle('✋ Ticket Claimed')
                .setDescription(`This ticket has been officially claimed by <@${interaction.user.id}>! They will be assisting you with your request.`)
                .setColor(config.colors.primary)
                .setTimestamp();

            await interaction.channel.send({ embeds: [claimEmbed] });
            return interaction.editReply({ content: `✅ You have successfully claimed Ticket #${ticket.id}.` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-close')
            .setDescription('Close and archive the current ticket')
            .addStringOption(opt => 
                opt.setName('reason')
                   .setDescription('Reason for closing this ticket')
                   .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply();
            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ This command can only be used inside an active ticket channel.' });
            }

            const reason = interaction.options.getString('reason') || 'Resolved by staff';

            // Generate HTML transcript
            const htmlContent = await generateHtmlTranscript(interaction.channel, ticket);
            const transcriptAttachment = new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), {
                name: `transcript-ticket-${ticket.id}.html`
            });

            ticket.status = 'CLOSED';
            ticket.closed_at = new Date().toISOString();
            ticket.closed_by = interaction.user.id;
            ticket.close_reason = reason;
            db.save();

            // Train the AI: store user query and verified resolution as training example
            if (ticket.subject || ticket.details) {
                await db.addAiTrainingExample({
                    ticketId: ticket.id,
                    category: ticket.type,
                    userQuery: `${ticket.subject || ''} - ${ticket.details || ''}`.trim(),
                    resolution: reason,
                    resolvedBy: interaction.user.id,
                    wasAiHandled: false
                });
            }

            // Log to #ticket-logs
            const logsChannelId = config.channels.ticketLogs;
            const logChannel = interaction.guild.channels.cache.get(logsChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`📋 Ticket #${ticket.id} Closed & Archived`)
                    .addFields(
                        { name: 'Category', value: ticket.type.toUpperCase(), inline: true },
                        { name: 'Creator', value: `<@${ticket.user_id}>`, inline: true },
                        { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Claimed By', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'None', inline: true },
                        { name: 'Reason', value: reason, inline: false }
                    )
                    .setColor(config.colors.secondary)
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed], files: [transcriptAttachment] });
            }

            // DM User with transcript and feedback survey
            try {
                const ticketUser = await interaction.client.users.fetch(ticket.user_id);
                if (ticketUser) {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`🏪 FreshlyPlaza — Ticket #${ticket.id} Closed`)
                        .setDescription(`Your support ticket in **${config.storeName}** has been closed.\nA complete transcript has been attached for your records.`)
                        .addFields(
                            { name: 'Reason', value: reason, inline: true },
                            { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setColor(config.colors.primary);

                    const surveyRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_5`).setLabel('⭐ 5 (Excellent)').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_4`).setLabel('⭐ 4 (Good)').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_3`).setLabel('⭐ 3 (Average)').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_1`).setLabel('⭐ 1 (Poor)').setStyle(ButtonStyle.Danger)
                    );

                    await ticketUser.send({ embeds: [dmEmbed], files: [transcriptAttachment], components: [surveyRow] });
                }
            } catch (e) {}

            await interaction.editReply({ content: '🔒 Ticket closed. Channel will be deleted in 5 seconds...' });
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {}
            }, 5000);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-deny-app')
            .setDescription('Deny a staff/developer application, ping applicant, notify them in DMs, and close channel')
            .addUserOption(opt => 
                opt.setName('applicant')
                   .setDescription('Applicant to deny (defaults to the channel ticket creator if left empty)')
                   .setRequired(false)
            )
            .addStringOption(opt => 
                opt.setName('reason')
                   .setDescription('Reason for denying this application')
                   .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply();
            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ This command can only be used inside an active ticket channel.' });
            }

            // Determine applicant: from option, or ticket record, or channel name/history
            let applicantUser = interaction.options.getUser('applicant');
            if (!applicantUser && ticket && ticket.user_id) {
                try {
                    applicantUser = await interaction.client.users.fetch(ticket.user_id);
                } catch (e) {}
            }

            // Fallback: try finding first non-bot member in channel if not explicitly provided
            if (!applicantUser) {
                const members = interaction.channel.members?.filter(m => !m.user.bot && m.id !== interaction.user.id);
                if (members && members.size > 0) {
                    applicantUser = members.first().user;
                }
            }

            const applicantId = applicantUser ? applicantUser.id : (ticket ? ticket.user_id : interaction.user.id);
            const applicantTag = applicantUser ? applicantUser.tag : (ticket ? ticket.user_tag : 'Applicant');
            const ticketId = ticket ? ticket.id : 'N/A';
            const reason = interaction.options.getString('reason') || 'Application requirements not met at this time';

            // Generate HTML transcript
            let transcriptAttachment = null;
            try {
                const htmlContent = await generateHtmlTranscript(interaction.channel, ticket || { id: 'APP', user_tag: applicantTag });
                transcriptAttachment = new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), {
                    name: `transcript-application-denied-${applicantId}.html`
                });
            } catch (e) {}

            if (ticket) {
                ticket.status = 'CLOSED';
                ticket.closed_at = new Date().toISOString();
                ticket.closed_by = interaction.user.id;
                ticket.close_reason = `Application Denied: ${reason}`;
                ticket.app_status = 'DENIED';
                db.save();
            }

            // Log to #ticket-logs / HR mod logs
            const logsChannelId = config.channels.ticketLogs;
            const logChannel = interaction.guild.channels.cache.get(logsChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`❌ Application Denied — ${applicantTag}`)
                    .addFields(
                        { name: 'Applicant', value: `<@${applicantId}> (\`${applicantId}\`)`, inline: true },
                        { name: 'Reviewed / Denied By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                        { name: 'Denial Reason', value: reason, inline: false }
                    )
                    .setColor(config.colors.danger)
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed], files: transcriptAttachment ? [transcriptAttachment] : [] });
            }

            // Public notification in channel with clear ping before deletion
            const channelNoticeEmbed = new EmbedBuilder()
                .setTitle('❌ FreshlyPlaza — Application Denied')
                .setDescription(
                    `Hello <@${applicantId}>,\n\n` +
                    `Thank you for taking the time to apply to join the **FreshlyPlaza** team. After careful review by leadership, your application has been **denied** at this time.\n\n` +
                    `• **Reason / Feedback:** ${reason}\n` +
                    `• **Reviewed By:** <@${interaction.user.id}>\n\n` +
                    `You are welcome to re-apply during future recruitment openings or once requirements are met. Thank you for your interest!`
                )
                .setColor(config.colors.danger)
                .setFooter({ text: 'FreshlyPlaza Management Team' })
                .setTimestamp();

            await interaction.channel.send({
                content: `<@${applicantId}> 🔔 **APPLICATION DECISION NOTICE**`,
                embeds: [channelNoticeEmbed]
            });

            // DM Applicant with official denial letter & transcript
            let dmSent = false;
            if (applicantUser) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`💼 FreshlyPlaza — Application Status Update`)
                        .setDescription(
                            `Hello **${applicantUser.username}**,\n\n` +
                            `Thank you for applying to the **FreshlyPlaza** team.\n\n` +
                            `Following review by our management team, we regret to inform you that your application has been **denied** at this time.`
                        )
                        .addFields(
                            { name: '📋 Decision', value: '❌ **Denied**', inline: true },
                            { name: '🛡️ Reviewed By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '📝 Reason / Feedback', value: reason, inline: false },
                            { name: 'ℹ️ Future Applications', value: 'You are welcome to re-apply during future recruitment cycles once experience and requirements are refined.', inline: false }
                        )
                        .setColor(config.colors.danger)
                        .setFooter({ text: 'FreshlyPlaza HR & Management' })
                        .setTimestamp();

                    await applicantUser.send({ embeds: [dmEmbed], files: transcriptAttachment ? [transcriptAttachment] : [] });
                    dmSent = true;
                } catch (e) {}
            }

            await interaction.editReply({
                content: `❌ Application for <@${applicantId}> denied. ${dmSent ? '✅ DM delivered to applicant.' : '⚠️ Applicant DMs closed.'} Channel will close and delete in 5 seconds...`
            });

            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {}
            }, 5000);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-add')
            .setDescription('Add a user or staff member to the current ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)),
        async execute(interaction) {
            const targetUser = interaction.options.getUser('user');
            await interaction.channel.permissionOverwrites.edit(targetUser.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true
            });
            return interaction.reply({ content: `✅ Added <@${targetUser.id}> to this ticket!` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-remove')
            .setDescription('Remove a user from the current ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true)),
        async execute(interaction) {
            const targetUser = interaction.options.getUser('user');
            await interaction.channel.permissionOverwrites.delete(targetUser.id);
            return interaction.reply({ content: `✅ Removed <@${targetUser.id}> from this ticket.` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-note')
            .setDescription('Add an internal staff note to this ticket (saved in transcript)')
            .addStringOption(opt => opt.setName('note').setDescription('Staff note content').setRequired(true)),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const noteText = interaction.options.getString('note');
            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket) {
                return interaction.editReply({ content: '❌ This command can only be used inside a ticket channel.' });
            }

            await db.addTicketNote(interaction.channel.id, interaction.user.id, noteText);

            const noteEmbed = new EmbedBuilder()
                .setTitle('📝 Staff Internal Note Added')
                .setDescription(`\`\`\`${noteText}\`\`\``)
                .setFooter({ text: `Recorded by ${interaction.user.tag}` })
                .setColor(config.colors.neutral)
                .setTimestamp();

            await interaction.channel.send({ embeds: [noteEmbed] });
            return interaction.editReply({ content: '✅ Internal note added to ticket history!' });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-stats')
            .setDescription('View support ticket statistics and resolution metrics'),
        async execute(interaction) {
            const db = getDb();
            const data = db.getData();
            const tickets = data.tickets || [];

            const total = tickets.length;
            const open = tickets.filter(t => t.status === 'OPEN' || t.status === 'CLAIMED').length;
            const closed = tickets.filter(t => t.status === 'CLOSED').length;
            const aiResolved = tickets.filter(t => t.status === 'RESOLVED_BY_AI').length;

            const embed = new EmbedBuilder()
                .setTitle('📊 FreshlyPlaza — Support Ticket Metrics')
                .addFields(
                    { name: '🎫 Total Tickets', value: `\`${total}\``, inline: true },
                    { name: '🟢 Active Open', value: `\`${open}\``, inline: true },
                    { name: '🔒 Closed & Archived', value: `\`${closed}\``, inline: true },
                    { name: '🤖 Handled & Resolved by AI', value: `\`${aiResolved}\``, inline: true }
                )
                .setColor(config.colors.secondary)
                .setTimestamp()
                .setFooter({ text: 'FreshlyPlaza Support Analytics' });

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('tag')
            .setDescription('Send a pre-written support snippet / quick tag into this ticket')
            .addStringOption(opt => 
                opt.setName('name')
                    .setDescription('The snippet to send')
                    .setRequired(true)
                    .addChoices(
                        { name: '📸 Proof Required (Reports/Exploiters)', value: 'proof' },
                        { name: '🕒 Shifts Info (Schedule & Hosting)', value: 'shifts' },
                        { name: '💼 Apply for Staff / Job', value: 'apply' },
                        { name: '🎮 Verification Help (Roblox Link)', value: 'verify' },
                        { name: '📜 Store Rules & Guidelines', value: 'rules' },
                        { name: '⏳ Staff Working on Ticket (Patience)', value: 'patience' },
                        { name: '❓ More Information Needed', value: 'moreinfo' }
                    )
            ),
        async execute(interaction) {
            const tagName = interaction.options.getString('name');
            const selected = SUPPORT_TAGS[tagName];
            if (!selected) {
                return interaction.reply({ content: '❌ Unknown snippet tag.', flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
                .setTitle(selected.title)
                .setDescription(selected.desc)
                .setColor(selected.color)
                .setFooter({ text: `Snippet posted by FreshlyPlaza Staff • Tag: ${tagName}` });

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-reply-anon')
            .setDescription('Send an official anonymous response to this ticket concealing your staff identity')
            .addStringOption(opt => opt.setName('message').setDescription('Message to send as FreshlyPlaza Support').setRequired(true)),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can send official anonymous replies.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket) {
                return interaction.reply({ content: '❌ This command can only be used inside a ticket channel.', flags: MessageFlags.Ephemeral });
            }

            const replyText = interaction.options.getString('message');

            // Record as internal note for auditing
            await db.addTicketNote(interaction.channel.id, interaction.user.id, `[ANON REPLY]: ${replyText}`);

            // Mark staff response timestamp for SLA
            await db.updateTicket(interaction.channel.id, {
                first_response_at: ticket.first_response_at || new Date().toISOString(),
                last_staff_response_at: new Date().toISOString(),
                awaiting_customer: true,
                customer_warned_at: null
            });

            const embed = new EmbedBuilder()
                .setAuthor({ 
                    name: 'FreshlyPlaza Support Team', 
                    iconURL: interaction.guild.iconURL() || undefined 
                })
                .setDescription(replyText)
                .setColor(config.colors.secondary)
                .setFooter({ text: 'Official FreshlyPlaza Support Response • Staff ID Protected' })
                .setTimestamp();

            await interaction.channel.send({ embeds: [embed] });
            return interaction.reply({ content: '✅ Anonymous support response dispatched.', flags: MessageFlags.Ephemeral });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-blacklist')
            .setDescription('Manage ticket blacklist (ban users from opening support tickets)')
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addSubcommand(sub => 
                sub.setName('add')
                    .setDescription('Blacklist a user from opening tickets')
                    .addUserOption(opt => opt.setName('user').setDescription('User to blacklist').setRequired(true))
                    .addStringOption(opt => opt.setName('reason').setDescription('Reason for blacklist').setRequired(true))
                    .addIntegerOption(opt => opt.setName('hours').setDescription('Duration in hours (leave empty for permanent)').setRequired(false))
            )
            .addSubcommand(sub =>
                sub.setName('remove')
                    .setDescription('Unblacklist a user allowing them to open tickets again')
                    .addUserOption(opt => opt.setName('user').setDescription('User to unblacklist').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('check')
                    .setDescription('Check if a user is ticket blacklisted')
                    .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true))
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                                 member.roles.cache.has(config.roles.hr) ||
                                 member.roles.cache.has(config.roles.mr);

            if (!isAuthorized) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza MR/HR Management can manage ticket blacklists.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            const sub = interaction.options.getSubcommand();
            const targetUser = interaction.options.getUser('user');

            if (sub === 'add') {
                const reason = interaction.options.getString('reason');
                const hours = interaction.options.getInteger('hours') || null;

                const entry = await db.setTicketBlacklist(targetUser.id, interaction.user.id, reason, hours);

                const embed = new EmbedBuilder()
                    .setTitle('🚫 User Blacklisted from Support Tickets')
                    .setDescription(`**Target:** <@${targetUser.id}> (\`${targetUser.id}\`)\n**Reason:** ${reason}\n**Duration:** ${hours ? `${hours} hours` : 'Permanent'}\n**Actioned by:** <@${interaction.user.id}>`)
                    .setColor(config.colors.danger)
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            } else if (sub === 'remove') {
                const removed = await db.removeTicketBlacklist(targetUser.id);
                if (!removed) {
                    return interaction.reply({ content: `⚠️ <@${targetUser.id}> is not currently blacklisted.`, flags: MessageFlags.Ephemeral });
                }

                return interaction.reply({ content: `✅ Removed ticket blacklist for <@${targetUser.id}>. They may now open tickets.` });
            } else if (sub === 'check') {
                const status = await db.isTicketBlacklisted(targetUser.id);
                if (!status) {
                    return interaction.reply({ content: `✅ <@${targetUser.id}> is **not** blacklisted from opening tickets.` });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🚫 Ticket Blacklist Status: Active')
                    .setDescription(`**User:** <@${targetUser.id}>\n**Reason:** ${status.reason}\n**Blacklisted At:** <t:${Math.floor(new Date(status.blacklisted_at).getTime() / 1000)}:R>\n**Expires:** ${status.expires_at ? `<t:${Math.floor(new Date(status.expires_at).getTime() / 1000)}:R>` : 'Never (Permanent)'}\n**Staff:** <@${status.blacklisted_by}>`)
                    .setColor(config.colors.danger);

                return interaction.reply({ embeds: [embed] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-transfer')
            .setDescription('Transfer the current ticket to another staff member or department role')
            .addMentionableOption(opt => 
                opt.setName('target')
                    .setDescription('Staff member or role to transfer the ticket to')
                    .setRequired(true)
            )
            .addStringOption(opt => 
                opt.setName('reason')
                    .setDescription('Reason for the transfer')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can transfer tickets.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', flags: MessageFlags.Ephemeral });
            }

            const targetMentionable = interaction.options.getMentionable('target');
            const reason = interaction.options.getString('reason') || 'Assistance requested by assigned staff.';

            // If a User / Member
            if (targetMentionable.user || targetMentionable instanceof require('discord.js').User) {
                const targetUserId = targetMentionable.user ? targetMentionable.user.id : targetMentionable.id;
                await interaction.channel.permissionOverwrites.edit(targetUserId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });

                ticket.claimed_by = targetUserId;
                ticket.claimed_at = new Date().toISOString();
                ticket.status = 'CLAIMED';
                db.save();

                await db.addTicketNote(interaction.channel.id, interaction.user.id, `Transferred ticket to <@${targetUserId}>: ${reason}`);

                const transferEmbed = new EmbedBuilder()
                    .setTitle('🔄 Ticket Transferred to Staff Colleague')
                    .setDescription(`This ticket has been transferred from <@${interaction.user.id}> to <@${targetUserId}>.\n\n**Reason:** ${reason}`)
                    .setColor(config.colors.secondary)
                    .setTimestamp();

                return interaction.reply({ content: `<@${targetUserId}>`, embeds: [transferEmbed] });
            } else {
                // It's a Role
                const targetRoleId = targetMentionable.id;
                await interaction.channel.permissionOverwrites.edit(targetRoleId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true
                });

                ticket.claimed_by = null;
                ticket.status = 'ESCALATED';
                db.save();

                await db.addTicketNote(interaction.channel.id, interaction.user.id, `Transferred ticket to department <@&${targetRoleId}>: ${reason}`);

                const transferEmbed = new EmbedBuilder()
                    .setTitle('🔄 Ticket Re-Routed to Department')
                    .setDescription(`This ticket has been transferred to the <@&${targetRoleId}> department by <@${interaction.user.id}>.\n\n**Reason:** ${reason}`)
                    .setColor(config.colors.warning)
                    .setTimestamp();

                return interaction.reply({ content: `<@&${targetRoleId}>`, embeds: [transferEmbed] });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-escalate')
            .setDescription('Escalate this ticket to a specific staff member or department and raise priority')
            .addUserOption(opt => 
                opt.setName('staff_user')
                   .setDescription('Specific staff member, manager, or leader to escalate this ticket to')
                   .setRequired(true)
            )
            .addStringOption(opt => 
                opt.setName('reason')
                   .setDescription('Reason for escalation / handover brief')
                   .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can escalate tickets.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', flags: MessageFlags.Ephemeral });
            }

            const targetStaff = interaction.options.getUser('staff_user');
            const reason = interaction.options.getString('reason') || 'Senior staff / leadership intervention required';

            // Grant the escalated user channel permissions so they have full access
            try {
                await interaction.channel.permissionOverwrites.edit(targetStaff.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    ManageMessages: true
                });
            } catch (permErr) {
                console.error('[TICKET ESCALATE PERMISSION ERROR]', permErr);
            }

            ticket.status = 'ESCALATED';
            ticket.claimed_by = targetStaff.id;
            ticket.claimed_at = new Date().toISOString();
            ticket.priority = 'HIGH';
            db.save();
            await db.addTicketNote(interaction.channel.id, interaction.user.id, `[ESCALATED TO ${targetStaff.tag}]: ${reason}`);

            const escalateEmbed = new EmbedBuilder()
                .setTitle('🚨 Support Ticket Escalated')
                .setDescription(
                    `🔔 **Attn <@${targetStaff.id}>:** This channel has been officially escalated to you by <@${interaction.user.id}>.\n\n` +
                    `• **Assigned Staff Member:** <@${targetStaff.id}> (\`${targetStaff.tag}\`)\n` +
                    `• **Escalated By:** <@${interaction.user.id}>\n` +
                    `• **Channel:** <#${interaction.channel.id}>\n` +
                    `• **Escalation Reason / Brief:** ${reason}\n` +
                    `• **Priority:** ⚡ \`HIGH\``
                )
                .setColor(config.colors.danger)
                .setFooter({ text: 'FreshlyPlaza Leadership Escalation' })
                .setTimestamp();

            // Direct Message the escalated staff member so they never miss it
            let dmDelivered = false;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle(`🚨 FreshlyPlaza — Ticket Escalation Assigned to You`)
                    .setDescription(`You have been assigned an escalated support ticket in **${interaction.guild.name}**!`)
                    .addFields(
                        { name: '📍 Channel', value: `<#${interaction.channel.id}>`, inline: true },
                        { name: '🛡️ Escalated By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📝 Reason / Handover Brief', value: reason, inline: false },
                        { name: '⚡ Priority', value: '`HIGH`', inline: true }
                    )
                    .setColor(config.colors.danger)
                    .setTimestamp();

                await targetStaff.send({ embeds: [dmEmbed] });
                dmDelivered = true;
            } catch (e) {}

            return interaction.reply({
                content: `🚨 <@${targetStaff.id}> **URGENT: TICKET ESCALATED TO YOU** ${dmDelivered ? '(DM notification delivered)' : ''}`,
                embeds: [escalateEmbed]
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-invite')
            .setDescription('Allow customers or colleagues to invite friends / other users to this group ticket')
            .addUserOption(opt => 
                opt.setName('user')
                    .setDescription('User to invite to this ticket room')
                    .setRequired(true)
            ),
        async execute(interaction) {
            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', flags: MessageFlags.Ephemeral });
            }

            const isTicketCreator = ticket.user_id === interaction.user.id;
            const isStaff = hasTicketOverride(interaction.member) || interaction.member.roles.cache.has(config.roles.staff) ||
                            interaction.member.roles.cache.has(config.roles.mr) ||
                            interaction.member.roles.cache.has(config.roles.hr) ||
                            interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isTicketCreator && !isStaff) {
                return interaction.reply({ content: '❌ Only the ticket creator or staff members can invite other users.', flags: MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('user');
            if (targetUser.bot) {
                return interaction.reply({ content: '❌ Bots cannot be invited to customer tickets.', flags: MessageFlags.Ephemeral });
            }

            await interaction.channel.permissionOverwrites.edit(targetUser.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                EmbedLinks: true
            });

            const inviteEmbed = new EmbedBuilder()
                .setTitle('👥 Multi-User Group Ticket — Participant Added')
                .setDescription(`Welcome <@${targetUser.id}> to this support ticket!\nYou were invited by <@${interaction.user.id}>.`)
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.reply({ content: `<@${targetUser.id}>`, embeds: [inviteEmbed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-resolve')
            .setDescription('Resolve this ticket with a mandatory resolution summary and close it')
            .addStringOption(opt => 
                opt.setName('resolution')
                    .setDescription('Mandatory explanation of how the customer issue was resolved')
                    .setRequired(true)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can resolve tickets.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ This command can only be used inside an active ticket channel.' });
            }

            const resolutionText = interaction.options.getString('resolution');

            // Generate HTML transcript
            const htmlContent = await generateHtmlTranscript(interaction.channel, ticket);
            const transcriptAttachment = new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), {
                name: `transcript-ticket-${ticket.id}.html`
            });

            ticket.status = 'CLOSED';
            ticket.closed_at = new Date().toISOString();
            ticket.closed_by = interaction.user.id;
            ticket.close_reason = resolutionText;
            ticket.resolution_notes = resolutionText;
            db.save();

            // AI Training: Automatically train the AI on this verified senior resolution
            if (ticket.subject || ticket.details) {
                await db.addAiTrainingExample({
                    ticketId: ticket.id,
                    category: ticket.type,
                    userQuery: `${ticket.subject || ''} - ${ticket.details || ''}`.trim(),
                    resolution: resolutionText,
                    resolvedBy: interaction.user.id,
                    wasAiHandled: false
                });
            }

            // Log to #ticket-logs
            const logsChannelId = config.channels.ticketLogs;
            const logChannel = interaction.guild.channels.cache.get(logsChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`✅ Ticket #${ticket.id} Resolved by Staff`)
                    .addFields(
                        { name: 'Category', value: ticket.type.toUpperCase(), inline: true },
                        { name: 'Creator', value: `<@${ticket.user_id}>`, inline: true },
                        { name: 'Resolved By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Resolution Notes', value: resolutionText, inline: false }
                    )
                    .setColor(config.colors.primary)
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed], files: [transcriptAttachment] });
            }

            // DM User with transcript and interactive reopen button
            try {
                const ticketUser = await interaction.client.users.fetch(ticket.user_id);
                if (ticketUser) {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`🏪 FreshlyPlaza — Ticket #${ticket.id} Resolved`)
                        .setDescription(`Your support ticket has been marked **RESOLVED** by <@${interaction.user.id}>.\n\n**Staff Resolution Summary:**\n\`\`\`\n${resolutionText}\n\`\`\`\nA complete HTML transcript is attached for your records.`)
                        .addFields(
                            { name: '🔄 Need Further Help?', value: 'If this issue is NOT resolved, you can click **Reopen Ticket** below within the next **2 hours**.', inline: false }
                        )
                        .setColor(config.colors.primary);

                    const surveyRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_5`).setLabel('⭐ 5').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_4`).setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_3`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_1`).setLabel('⭐ 1').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`reopen_ticket_${ticket.id}`).setLabel('🔄 Reopen Ticket').setStyle(ButtonStyle.Secondary)
                    );

                    await ticketUser.send({ embeds: [dmEmbed], files: [transcriptAttachment], components: [surveyRow] });
                }
            } catch (e) {}

            await interaction.editReply({ content: '✅ Ticket marked as resolved and logged to AI training knowledge! Channel closing in 5 seconds...' });
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {}
            }, 5000);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-close-request')
            .setDescription('Send a formal close confirmation request to the customer with Accept and Decline buttons')
            .addStringOption(opt => 
                opt.setName('reason')
                    .setDescription('Reason or resolution message for the close request')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can request ticket closure.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', flags: MessageFlags.Ephemeral });
            }

            const reasonText = interaction.options.getString('reason') || 'Your inquiry appears to be resolved.';

            const requestEmbed = new EmbedBuilder()
                .setTitle('🔒 FreshlyPlaza Support — Ticket Close Request')
                .setDescription(
                    `Hello <@${ticket.user_id}>,\n\n` +
                    `Staff member <@${interaction.user.id}> has requested to **close this support ticket**.\n\n` +
                    `**Staff Message / Summary:**\n> ${reasonText}\n\n` +
                    `Has your question or issue been fully resolved? Please select an option below:`
                )
                .addFields(
                    { name: '✅ Accept Close', value: 'Closes the ticket, generates an HTML transcript, and sends your rating survey.', inline: true },
                    { name: '❌ Keep Ticket Open', value: 'Cancels the close request so you can continue speaking with staff.', inline: true }
                )
                .setColor(config.colors.secondary)
                .setFooter({ text: 'FreshlyPlaza Ticket Close Protocol' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_accept_close_${ticket.id}`)
                    .setLabel('✅ Yes, Close Ticket')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`btn_decline_close_${ticket.id}`)
                    .setLabel('❌ No, I Still Need Help')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.channel.send({
                content: `<@${ticket.user_id}>`,
                embeds: [requestEmbed],
                components: [row]
            });

            return interaction.reply({ content: `✅ Formal close request dispatched to <@${ticket.user_id}>.`, flags: MessageFlags.Ephemeral });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-config')
            .setDescription('Configure ticket system settings, pause tickets, update panel image, and operating hours')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addSubcommand(sub =>
                sub.setName('status')
                    .setDescription('View current ticket system configuration status')
            )
            .addSubcommand(sub =>
                sub.setName('toggle')
                    .setDescription('Enable or temporarily pause ticket creation')
                    .addBooleanOption(opt => opt.setName('enabled').setDescription('Set ticket system active (true) or paused (false)').setRequired(true))
                    .addStringOption(opt => opt.setName('reason').setDescription('Reason if pausing tickets').setRequired(false))
            )
            .addSubcommand(sub =>
                sub.setName('panel-image')
                    .setDescription('Set or clear the image banner for the ticket support panel embed')
                    .addStringOption(opt => opt.setName('url').setDescription('Direct image URL (e.g. https://.../banner.png) or type "none" to remove').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('operating-hours')
                    .setDescription('Set human staff operating hours window (in UTC)')
                    .addIntegerOption(opt => opt.setName('start_utc').setDescription('Start hour UTC (0-23, e.g. 8 for 08:00 UTC)').setRequired(true))
                    .addIntegerOption(opt => opt.setName('end_utc').setDescription('End hour UTC (0-23, e.g. 23 for 23:00 UTC)').setRequired(true))
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                 member.roles.cache.has(config.roles.hr) ||
                                 member.roles.cache.has(config.roles.mr);

            if (!isAuthorized) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff Management can configure ticket settings.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            const sub = interaction.options.getSubcommand();
            const settings = await db.getTicketSettings();

            const refreshPanelIfPresent = async () => {
                if (settings.panel_channel_id && settings.panel_message_id) {
                    try {
                        const channel = interaction.guild.channels.cache.get(settings.panel_channel_id);
                        if (channel) {
                            const msg = await channel.messages.fetch(settings.panel_message_id);
                            if (msg) {
                                const newEmbed = await buildTicketPanelEmbed(interaction.guild);
                                await msg.edit({ embeds: [newEmbed] });
                            }
                        }
                    } catch (e) {
                        console.warn('[PANEL REFRESH WARNING]', e.message);
                    }
                }
            };

            if (sub === 'status') {
                const embed = new EmbedBuilder()
                    .setTitle('⚙️ FreshlyPlaza Ticket System Configuration')
                    .addFields(
                        { name: '🟢 System Status', value: settings.enabled ? '✅ Active / Open' : `⚠️ Paused (${settings.disabled_reason || 'Maintenance'})`, inline: false },
                        { name: '🕒 Staff Operating Hours', value: `\`${settings.operating_hours.start_utc}:00 UTC – ${settings.operating_hours.end_utc}:00 UTC\``, inline: true },
                        { name: '🖼️ Panel Banner Image', value: settings.panel_image_url ? `[Banner Link](${settings.panel_image_url})` : '*Default (None)*', inline: true },
                        { name: '📍 Deployed Panel Message', value: settings.panel_channel_id ? `<#${settings.panel_channel_id}> (\`${settings.panel_message_id}\`)` : '*Not deployed via command yet*', inline: false }
                    )
                    .setColor(settings.enabled ? config.colors.primary : config.colors.warning)
                    .setFooter({ text: 'FreshlyPlaza Ticket Administration' });

                if (settings.panel_image_url) {
                    embed.setImage(settings.panel_image_url);
                }

                return interaction.reply({ embeds: [embed] });
            } else if (sub === 'toggle') {
                const enabled = interaction.options.getBoolean('enabled');
                const reason = interaction.options.getString('reason') || 'Support tickets are temporarily closed for scheduled maintenance.';

                await db.updateTicketSettings({
                    enabled,
                    disabled_reason: reason
                });

                await refreshPanelIfPresent();

                const embed = new EmbedBuilder()
                    .setTitle(enabled ? '✅ Ticket Creation Re-Enabled' : '⏸️ Ticket Creation Paused')
                    .setDescription(enabled ? 'Customers may now open new support tickets across all categories.' : `Ticket creation has been paused.\n**Reason:** ${reason}\n*Support panel has been updated.*`)
                    .setColor(enabled ? config.colors.primary : config.colors.warning);

                return interaction.reply({ embeds: [embed] });
            } else if (sub === 'panel-image') {
                const url = interaction.options.getString('url').trim();
                const newUrl = (url.toLowerCase() === 'none' || url.toLowerCase() === 'clear') ? null : url;

                await db.updateTicketSettings({ panel_image_url: newUrl });
                await refreshPanelIfPresent();

                return interaction.reply({ content: `✅ Panel banner image updated! ${newUrl ? `Set to: ${newUrl}` : 'Banner image cleared.'}` });
            } else if (sub === 'operating-hours') {
                const startHour = interaction.options.getInteger('start_utc');
                const endHour = interaction.options.getInteger('end_utc');

                settings.operating_hours.start_utc = startHour;
                settings.operating_hours.end_utc = endHour;
                await db.updateTicketSettings({ operating_hours: settings.operating_hours });
                await refreshPanelIfPresent();

                return interaction.reply({ content: `✅ Operating hours updated to **${startHour}:00 UTC – ${endHour}:00 UTC**.` });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-checklist')
            .setDescription('View and update the in-ticket investigation milestone checklist')
            .addIntegerOption(opt =>
                opt.setName('step')
                    .setDescription('Select checklist item to toggle')
                    .setRequired(false)
                    .addChoices(
                        { name: '1. Evidence & Details Verified', value: 0 },
                        { name: '2. Roblox Account / Store Records Checked', value: 1 },
                        { name: '3. Customer Inquiries Addressed', value: 2 },
                        { name: '4. Resolution Confirmed by Customer', value: 3 }
                    )
            )
            .addBooleanOption(opt =>
                opt.setName('completed')
                    .setDescription('Set task status (True = Checked, False = Unchecked)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can manage ticket checklists.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            let ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', flags: MessageFlags.Ephemeral });
            }

            const step = interaction.options.getInteger('step');
            const completed = interaction.options.getBoolean('completed');

            if (step !== null && completed !== null) {
                ticket = await db.updateTicketChecklist(interaction.channel.id, step, completed);
            }

            const checklist = ticket.checklist || [
                { task: 'Evidence & Details Verified', done: false },
                { task: 'Roblox Account / Store Records Checked', done: false },
                { task: 'Customer Inquiries Addressed', done: false },
                { task: 'Resolution Confirmed by Customer', done: false }
            ];

            const lines = checklist.map((item, idx) => `${item.done ? '✅' : '⬜'} **Step ${idx + 1}:** ${item.task}`);
            const allDone = checklist.every(i => i.done);

            const embed = new EmbedBuilder()
                .setTitle(`📋 Ticket #${ticket.id} — Milestone Checklist`)
                .setDescription(lines.join('\n\n'))
                .setColor(allDone ? config.colors.primary : config.colors.secondary)
                .setFooter({ text: allDone ? '🎉 All milestone checks complete! Ready for closure.' : 'Use /ticket-checklist step:<num> completed:<true|false> to update' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-coclaim')
            .setDescription('Co-claim this ticket alongside another colleague (for mentorship or dual investigation)')
            .addUserOption(opt =>
                opt.setName('colleague')
                    .setDescription('Staff colleague to co-claim this ticket with')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can co-claim tickets.', flags: MessageFlags.Ephemeral });
            }

            const db = getDb();
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This command can only be used inside an active ticket channel.', flags: MessageFlags.Ephemeral });
            }

            const partnerUser = interaction.options.getUser('colleague') || interaction.user;
            await db.setTicketCoClaim(interaction.channel.id, partnerUser.id);

            // Give partner channel access
            try {
                await interaction.channel.permissionOverwrites.edit(partnerUser.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    AttachFiles: true,
                    ManageMessages: true
                });
            } catch (e) {}

            const embed = new EmbedBuilder()
                .setTitle('🤝 Ticket Co-Claimed')
                .setDescription(`This ticket is now co-managed by <@${ticket.claimed_by || interaction.user.id}> and <@${partnerUser.id}>!\n\nBoth colleagues are collaborating to resolve this customer inquiry.`)
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-pin')
            .setDescription('Pin key evidence, notes, or findings to this ticket banner')
            .addStringOption(opt =>
                opt.setName('text')
                    .setDescription('Text or evidence link to pin')
                    .setRequired(true)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can pin notes in tickets.', flags: MessageFlags.Ephemeral });
            }

            const text = interaction.options.getString('text');
            const db = getDb();
            await db.setTicketPinnedMessage(interaction.channel.id, text, interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('📌 Ticket Notice Pinned by Staff')
                .setDescription(`> ${text}`)
                .setFooter({ text: `Pinned by ${interaction.user.tag}` })
                .setColor(config.colors.warning)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-priority')
            .setDescription('Update the priority level of this ticket')
            .addStringOption(opt =>
                opt.setName('level')
                    .setDescription('Priority level')
                    .setRequired(true)
                    .addChoices(
                        { name: '🟢 Low Priority', value: 'LOW' },
                        { name: '🔵 Normal Priority', value: 'NORMAL' },
                        { name: '🟡 High Priority', value: 'HIGH' },
                        { name: '🔴 Urgent / Critical Priority', value: 'URGENT' }
                    )
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can adjust ticket priority.', flags: MessageFlags.Ephemeral });
            }

            const level = interaction.options.getString('level');
            const db = getDb();
            await db.updateTicket(interaction.channel.id, { priority: level });

            const colors = { LOW: config.colors.neutral, NORMAL: config.colors.secondary, HIGH: config.colors.warning, URGENT: config.colors.danger };
            const embed = new EmbedBuilder()
                .setTitle('⚡ Ticket Priority Updated')
                .setDescription(`Priority has been adjusted to **${level}** by <@${interaction.user.id}>.`)
                .setColor(colors[level] || config.colors.primary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('ticket-history')
            .setDescription('Look up previous ticket records, ratings, and details for a member')
            .addUserOption(opt =>
                opt.setName('member')
                    .setDescription('Member to check ticket history for')
                    .setRequired(true)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Staff can inspect ticket history.', flags: MessageFlags.Ephemeral });
            }

            const targetUser = interaction.options.getUser('member');
            const db = getDb();
            const allTickets = (db.getData().tickets || []).filter(t => t.user_id === targetUser.id);

            if (allTickets.length === 0) {
                return interaction.reply({ content: `ℹ️ No past tickets found for <@${targetUser.id}>.`, flags: MessageFlags.Ephemeral });
            }

            const total = allTickets.length;
            const openCount = allTickets.filter(t => t.status !== 'CLOSED').length;
            const recent = allTickets.slice(-5).reverse();

            const historyText = recent.map(t => {
                const dateStr = `<t:${Math.floor(new Date(t.created_at).getTime() / 1000)}:R>`;
                const ratingStr = t.feedback_rating ? `${'⭐'.repeat(t.feedback_rating)}` : '*No rating*';
                return `• **Ticket #${t.id}** (${t.type.toUpperCase()}) — Status: \`${t.status}\`\n  *Subject:* "${t.subject || 'N/A'}" | ${dateStr}\n  *Feedback:* ${ratingStr}`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setTitle(`📜 Ticket History: ${targetUser.username}`)
                .setDescription(`Found **${total} total tickets** (**${openCount} currently active**).\n\n${historyText}`)
                .setColor(config.colors.secondary)
                .setFooter({ text: 'FreshlyPlaza Customer Support Records' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
];

module.exports.TICKET_CATEGORIES = TICKET_CATEGORIES;
module.exports.SUPPORT_TAGS = SUPPORT_TAGS;
module.exports.buildTicketControlRow = buildTicketControlRow;
module.exports.buildSnippetSelectMenu = buildSnippetSelectMenu;
module.exports.buildTransferSelectMenu = buildTransferSelectMenu;
module.exports.buildTicketPanelEmbed = buildTicketPanelEmbed;
module.exports.buildTicketPanelSelectMenu = buildTicketPanelSelectMenu;
