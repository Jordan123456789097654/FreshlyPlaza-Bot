const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ChannelType, 
    PermissionFlagsBits, 
    AttachmentBuilder 
} = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');
const { withTicketOverride, hasTicketOverride } = require('../utils/ticketAccess');
const { generateHtmlTranscript, saveTranscriptAndGetUrl } = require('../utils/transcript');

const MODMAIL_CATEGORIES = {
    general: {
        label: 'Customer & General ModMail',
        emoji: '🛒',
        description: 'Store questions, gameplay, aisles, checkout, and general help',
        roleKey: 'supportGeneral',
        color: config.colors.secondary
    },
    report: {
        label: 'Player or Staff Report',
        emoji: '🛡️',
        description: 'Report exploiter activity, rule infractions, or colleague misconduct',
        roleKey: 'supportReport',
        color: config.colors.danger
    },
    management: {
        label: 'HR & Management ModMail',
        emoji: '💼',
        description: 'Staff leadership, business contact, partnerships, or LOA queries',
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
        description: 'Direct staff records, roster adjustments, and data entries',
        roleKey: 'supportManagement',
        targetUserId: '1046538179399929957',
        color: 0x34495E,
        staffOnly: true
    }
};

/**
 * Creates a dedicated Staff ModMail Channel and establishes DM bridge with the user
 */
async function createModmailThread({ guild, user, member = null, categoryKey = 'general', subject = 'ModMail Inquiry', details = '', client }) {
    const db = getDb();

    // 1. Check blacklist
    const isBanned = await db.isTicketBlacklisted(user.id);
    if (isBanned) {
        throw new Error(`You are blacklisted from opening Grandway Shopping ModMail: ${isBanned.reason}`);
    }

    // 2. Check existing active thread (auto-closes old server tickets if channel no longer exists)
    let activeTicket = await db.getActiveUserTicket(user.id, null, guild);
    if (activeTicket) {
        const channelExists = guild.channels.cache.has(activeTicket.channel_id);
        if (!channelExists) {
            activeTicket.status = 'CLOSED';
            activeTicket.closed_at = new Date().toISOString();
            activeTicket.close_reason = 'Auto-closed: Legacy server ticket';
            db.save();
            activeTicket = null;
        } else {
            throw new Error(`You already have an active ModMail thread: <#${activeTicket.channel_id}>. Please close it before opening a new one.`);
        }
    }

    const catConfig = MODMAIL_CATEGORIES[categoryKey] || MODMAIL_CATEGORIES.general;
    const targetRoleId = config.roles[catConfig.roleKey] || config.roles.staff;

    // 3. Find ModMail / Tickets Category in Guild
    const parentCategory = guild.channels.cache.find(c => 
        c.type === ChannelType.GuildCategory && 
        (c.name.includes('SUPPORT TICKETS') || c.name.includes('MODMAIL') || c.id === config.channels.ticketsCategory || c.id === '1558519068951187498')
    );
    const parentCategoryId = parentCategory ? parentCategory.id : (config.channels.ticketsCategory || null);

    // 4. Set Permissions: Staff ONLY (User is in DMs, NOT in the guild channel!)
    const permissionOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }
    ];

    if (catConfig.targetUserId) {
        // Specific user (e.g. DATA-ENTRIES)
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
    } else {
        // Department Role
        if (targetRoleId) {
            permissionOverwrites.push({
                id: targetRoleId,
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
    }

    // 5. Create Staff Channel (mail-username)
    const cleanUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
    const channelName = `mail-${cleanUsername}`;

    const staffChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentCategoryId,
        topic: `ModMail Thread for @${user.tag} (${user.id}) | Category: ${catConfig.label}`,
        permissionOverwrites: withTicketOverride(permissionOverwrites)
    });

    // 6. Record in Database
    const ticketRecord = await db.createTicketRecord({
        channelId: staffChannel.id,
        userId: user.id,
        userTag: user.tag || user.username,
        type: categoryKey,
        subject: subject || `${catConfig.label} ModMail`,
        details: details || '',
        aiDisabled: Boolean(catConfig.staffOnly)
    });

    // Set anon_mode to true by default for maximum staff privacy
    ticketRecord.anon_mode = true;
    db.save();

    // 7. Send DM Greeting to User
    const dmGreeting = new EmbedBuilder()
        .setTitle('📬 Grandway Shopping — ModMail Thread Established')
        .setDescription(
            `Hello <@${user.id}>! Your **ModMail thread** is now active with our **${catConfig.label}** team.\n\n` +
            `💬 **How to Chat:**\n` +
            `Simply type your message, questions, or send attachments **directly in this DM**.\n` +
            `Everything you type will be securely forwarded directly to our on-duty moderation and staff colleagues.\n\n` +
            `🔒 **Confidentiality:**\n` +
            `Staff responses will be relayed directly to you here in this chat.\n\n` +
            `*To close this thread at any time, click the button below or type \`=close\`.*`
        )
        .setColor(config.colors.primary)
        .setFooter({ text: `Grandway Shopping ModMail • Thread #${ticketRecord.id} Active Relay` })
        .setTimestamp();

    const dmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`btn_modmail_dm_close_${ticketRecord.id}`).setLabel('🔒 Close ModMail').setStyle(ButtonStyle.Danger)
    );

    try {
        await user.send({ embeds: [dmGreeting], components: [dmRow] });
    } catch (dmErr) {
        await staffChannel.delete().catch(() => {});
        throw new Error('Could not send a Direct Message (DM) to you. Please enable DMs from server members in your Discord privacy settings and try again.');
    }

    // 8. Send Staff Header & Controls in Staff Channel
    const { buildTicketControlRow, buildTicketControlRow2 } = require('../commands/ticket');

    const staffMention = catConfig.targetUserId ? `<@${catConfig.targetUserId}>` : `<@&${targetRoleId}>`;

    const staffHeader = new EmbedBuilder()
        .setTitle(`📬 ModMail #${ticketRecord.id} — ${catConfig.label}`)
        .setDescription(
            `A new **ModMail thread** has been opened by **<@${user.id}>** (\`${user.id}\`).\n\n` +
            `🌐 **ModMail Bridge Mode:** Direct Message Relay\n` +
            `• User is chatting via **Direct Messages (DMs)** with the bot.\n` +
            `• Messages typed here (or sent via **Anon Reply**) will be dispatched directly into the user's DMs.\n` +
            `• **Staff Anonymous Mode:** \`ENABLED 🟢\` (Staff identity is protected in DMs).\n\n` +
            `📝 **Initial Subject:** ${subject}\n` +
            (details ? `💬 **Details:** ${details}\n\n` : '\n') +
            `**Shortcuts in chat:**\n` +
            `• \`!anon <msg>\` or normal typing (when Anon Mode is ON): Send anonymous reply\n` +
            `• \`!note <text>\`: Leave internal staff note (never sent to user)\n` +
            `• \`!close [reason]\`: Close thread & send transcript to user`
        )
        .addFields(
            { name: '👤 User', value: `<@${user.id}>\n\`${user.tag}\``, inline: true },
            { name: '🛡️ Department', value: staffMention, inline: true },
            { name: '📅 User Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
        )
        .setColor(catConfig.color)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `ModMail Thread #${ticketRecord.id} • DM Relay Active` })
        .setTimestamp();

    await staffChannel.send({
        content: staffMention,
        embeds: [staffHeader],
        components: [buildTicketControlRow(true), buildTicketControlRow2()]
    });

    return { staffChannel, ticketRecord };
}

/**
 * Handles incoming Direct Messages (DMs) from users (User -> Staff Relay)
 */
async function handleIncomingModmailDm(message, client) {
    if (message.author.bot) return;
    if (message.guild) return; // Only process DMs

    const db = getDb();

    // Check blacklist
    const isBanned = await db.isTicketBlacklisted(message.author.id);
    if (isBanned) {
        return message.author.send(`🚫 You are currently restricted from opening Grandway Shopping ModMail.\n• Reason: ${isBanned.reason}`);
    }

    // Find active ModMail thread
    const guild = client.guilds.cache.get(config.guildId);
    let ticket = await db.getActiveUserTicket(message.author.id, null, guild);
    if (ticket && guild) {
        const channelExists = guild.channels.cache.has(ticket.channel_id);
        if (!channelExists) {
            ticket.status = 'CLOSED';
            ticket.closed_at = new Date().toISOString();
            ticket.close_reason = 'Auto-closed: Legacy server ticket';
            db.save();
            ticket = null;
        }
    }

    // If user typed =close in DM
    if (message.content && /^(?:=close|!close)/i.test(message.content.trim())) {
        if (!ticket) {
            return message.author.send('ℹ️ You do not currently have an active ModMail thread.');
        }
        const guild = client.guilds.cache.get(config.guildId);
        const staffChannel = guild ? guild.channels.cache.get(ticket.channel_id) : null;
        return closeModmailThread({
            channel: staffChannel,
            ticket,
            closedBy: message.author,
            reason: message.content.replace(/^(?:=close|!close)\s*/i, '').trim() || 'Closed by user in DMs',
            guild,
            client
        });
    }

    // 1. Thread Already Active: Forward message to Staff Channel
    if (ticket) {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return;

        const staffChannel = guild.channels.cache.get(ticket.channel_id);
        if (!staffChannel) {
            ticket.status = 'CLOSED';
            db.save();
            return message.author.send('⚠️ Your previous ModMail channel could not be found and has been concluded. Please choose a category below to start a new thread.');
        }

        // Build User Relay Embed
        const relayEmbed = new EmbedBuilder()
            .setAuthor({
                name: `${message.author.tag} (${message.author.id})`,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            })
            .setDescription(message.content || '*[Attachment/Image Only]*')
            .setColor(config.colors.secondary)
            .setFooter({ text: `ModMail #${ticket.id} • Customer DM Message` })
            .setTimestamp();

        let files = [];
        if (message.attachments.size > 0) {
            files = Array.from(message.attachments.values()).map(att => att.url);
        }

        await staffChannel.send({ embeds: [relayEmbed], files });

        // Update timestamps
        ticket.last_customer_response_at = new Date().toISOString();
        ticket.awaiting_customer = false;
        ticket.customer_warned_at = null;
        db.save();

        // React on user DM to confirm delivery
        try {
            await message.react('📨');
        } catch (_) {}

        return;
    }

    // 2. No Active Thread: Prompt User to Select Category
    const welcomeEmbed = new EmbedBuilder()
        .setTitle('📬 Grandway Shopping — Official ModMail')
        .setDescription(
            `Hello <@${message.author.id}>! Welcome to Grandway Shopping ModMail.\n\n` +
            `Please select a category from the dropdown menu below to start your private thread with our store staff team:`
        )
        .setColor(config.colors.primary)
        .setFooter({ text: 'Grandway Shopping ModMail • Direct Staff Bridge' });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('dm_modmail_select_category')
            .setPlaceholder('📬 Choose a category to open your thread...')
            .addOptions([
                { label: 'Customer & General Support', value: 'general', emoji: '🛒', description: 'Store questions, gameplay, aisles, checkout, and general help' },
                { label: 'Player or Staff Report', value: 'report', emoji: '🛡️', description: 'Report exploiter activity, rule infractions, or misconduct' },
                { label: 'HR & Management Inquiry', value: 'management', emoji: '💼', description: 'Leadership inquiries, business, or staff queries' },
                { label: 'Technical & Bug Support', value: 'technical', emoji: '🐛', description: 'Store glitches, register bugs, or account issues' },
                { label: 'Moderation & Ban Appeal', value: 'appeals', emoji: '⚖️', description: 'Appeal a store timeout, server ban, or strike' }
            ])
    );

    await message.author.send({ embeds: [welcomeEmbed], components: [row] });
}

/**
 * Handles incoming Staff message in Staff ModMail Channel (Staff -> User DM Relay)
 */
async function handleStaffModmailMessage(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const db = getDb();
    const ticket = await db.getTicketByChannel(message.channel.id);
    if (!ticket || ticket.status === 'CLOSED') return;

    const isTicketCreator = message.author.id === ticket.user_id;
    if (isTicketCreator) return; // Staff only

    const isStaff = hasTicketOverride(message.member) ||
                    message.member?.roles.cache.has(config.roles.staff) ||
                    message.member?.roles.cache.has(config.roles.mr) ||
                    message.member?.roles.cache.has(config.roles.hr) ||
                    message.member?.permissions.has(PermissionFlagsBits.ManageMessages);

    if (!isStaff) return;

    const rawContent = (message.content || '').trim();

    // 1. Internal Note (!note <text> or // <text>)
    const isStaffNote = /^(?:!note|=note|\/\/)\s+/i.test(rawContent);
    if (isStaffNote) {
        const noteText = rawContent.replace(/^(?:!note|=note|\/\/)\s+/i, '').trim();
        try { await message.delete(); } catch (_) {}

        if (noteText.length > 0) {
            await db.addTicketNote(message.channel.id, message.author.id, noteText);
            const noteEmbed = new EmbedBuilder()
                .setAuthor({
                    name: `🔒 Staff Internal Note — ${message.author.username}`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .setDescription(noteText)
                .setColor(config.colors.warning)
                .setFooter({ text: 'Internal Staff Note • Not sent to user DM' })
                .setTimestamp();
            await message.channel.send({ embeds: [noteEmbed] });
        }
        return;
    }

    // 2. Staff Close Command (!close [reason] or =close [reason])
    const isCloseCmd = /^(?:!close|=close)/i.test(rawContent);
    if (isCloseCmd) {
        const reason = rawContent.replace(/^(?:!close|=close)\s*/i, '').trim() || 'Resolved by staff in chat';
        return closeModmailThread({
            channel: message.channel,
            ticket,
            closedBy: message.author,
            reason,
            guild: message.guild,
            client
        });
    }

    // 3. Staff Reply (Relay to User DM)
    const isExplicitAnon = /^(?:!anon|=anon|=reply|=ar)\s+/i.test(rawContent);
    const isExplicitSigned = /^(?:!signed|=signed|=r)\s+/i.test(rawContent);
    const isAnonModeActive = Boolean(ticket.anon_mode);

    // If anon mode is on, or explicit anon prefix used, reply anonymously
    const shouldSendAnon = isExplicitAnon || (isAnonModeActive && !isExplicitSigned);

    let cleanText = rawContent;
    if (isExplicitAnon) cleanText = cleanText.replace(/^(?:!anon|=anon|=reply|=ar)\s+/i, '').trim();
    if (isExplicitSigned) cleanText = cleanText.replace(/^(?:!signed|=signed|=r)\s+/i, '').trim();

    // If message is a slash command or empty, ignore
    if (cleanText.startsWith('/') || cleanText.length === 0) return;

    // Fetch Target User
    let targetUser = null;
    try {
        targetUser = await client.users.fetch(ticket.user_id);
    } catch (_) {
        return message.channel.send('❌ Could not find or fetch the user associated with this ModMail thread.');
    }

    // Prepare DM Embed
    const dmEmbed = new EmbedBuilder()
        .setAuthor({
            name: shouldSendAnon ? 'Grandway Shopping ModMail Team 🛡️' : `${message.author.username} (Staff Colleague)`,
            iconURL: shouldSendAnon ? (message.guild.iconURL({ dynamic: true }) || undefined) : message.author.displayAvatarURL({ dynamic: true })
        })
        .setDescription(cleanText)
        .setColor(config.colors.secondary)
        .setFooter({ text: shouldSendAnon ? 'Official ModMail Response • Support Staff ID Protected' : 'Grandway Shopping Staff Response' })
        .setTimestamp();

    let files = [];
    if (message.attachments.size > 0) {
        files = Array.from(message.attachments.values()).map(att => att.url);
    }

    try {
        await targetUser.send({ embeds: [dmEmbed], files });
    } catch (dmErr) {
        return message.channel.send(`⚠️ **Failed to deliver DM to <@${ticket.user_id}>!** The user may have DMs closed or blocked the bot.`);
    }

    // Delete staff raw message to keep channel tidy
    try { await message.delete(); } catch (_) {}

    // Send confirmation receipt into staff channel
    const receiptEmbed = new EmbedBuilder()
        .setAuthor({
            name: `${message.author.username} (${shouldSendAnon ? 'Anonymous to Customer' : 'Signed'})`,
            iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setDescription(cleanText)
        .setColor(shouldSendAnon ? config.colors.secondary : config.colors.primary)
        .setFooter({ text: `Relayed to user DM • ${shouldSendAnon ? 'Staff identity hidden in DM' : 'Staff name displayed in DM'}` })
        .setTimestamp();

    await message.channel.send({ embeds: [receiptEmbed], files });

    // Internal audit note
    await db.addTicketNote(message.channel.id, message.author.id, `[STAFF RELAY ${shouldSendAnon ? '(ANONYMOUS)' : '(SIGNED)'}]: ${cleanText}`);

    // Update timestamps
    ticket.last_staff_response_at = new Date().toISOString();
    ticket.awaiting_customer = true;
    ticket.customer_warned_at = null;
    if (!ticket.first_response_at) ticket.first_response_at = new Date().toISOString();
    db.save();
}

/**
 * Closes the ModMail thread, sends transcript to user DM, logs archive, and cleans up channel
 */
async function closeModmailThread({ channel, ticket, closedBy, reason = 'Resolved by staff', guild, client }) {
    const db = getDb();
    if (!ticket || ticket.status === 'CLOSED') return;

    ticket.status = 'CLOSED';
    ticket.closed_at = new Date().toISOString();
    ticket.closed_by = closedBy.id;
    ticket.close_reason = reason;
    db.save();

    // 1. Generate Transcript & Web URL
    let transcriptUrl = '';
    let htmlContent = '';
    if (channel) {
        try {
            htmlContent = await generateHtmlTranscript(channel, ticket);
            transcriptUrl = await saveTranscriptAndGetUrl(ticket.id, htmlContent);
        } catch (tErr) {
            console.error('[MODMAIL TRANSCRIPT ERROR]', tErr);
        }
    }

    // 2. DM User with Web Transcript Link & Feedback Survey
    try {
        const user = await client.users.fetch(ticket.user_id);
        if (user) {
            const dmCloseEmbed = new EmbedBuilder()
                .setTitle(`📬 Grandway Shopping — ModMail Thread #${ticket.id} Closed`)
                .setDescription(
                    `Your ModMail thread with the Grandway Shopping team has been concluded.\n\n` +
                    `• **Reason for Closure:** ${reason}\n` +
                    `• **Closed By:** ${closedBy.username}\n\n` +
                    (transcriptUrl ? `🌐 **Online Transcript:** [Click here to view transcript](${transcriptUrl})\n\n` : '') +
                    `You can view your complete message archive anytime using the online link.`
                )
                .setColor(config.colors.primary)
                .setFooter({ text: 'Thank you for contacting Grandway Shopping ModMail!' })
                .setTimestamp();

            const surveyRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`survey_${ticket.id}_5`).setLabel('⭐ 5 (Excellent)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`survey_${ticket.id}_4`).setLabel('⭐ 4 (Good)').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`survey_${ticket.id}_3`).setLabel('⭐ 3 (Average)').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`survey_${ticket.id}_1`).setLabel('⭐ 1 (Poor)').setStyle(ButtonStyle.Danger)
            );

            const rowButtons = [surveyRow];
            if (transcriptUrl) {
                const linkRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('View Online Transcript')
                        .setStyle(ButtonStyle.Link)
                        .setURL(transcriptUrl)
                        .setEmoji('🌐')
                );
                rowButtons.unshift(linkRow);
            }

            await user.send({ embeds: [dmCloseEmbed], components: rowButtons });
        }
    } catch (_) {}

    // 3. Send Archive to Staff Ticket Logs
    const logChannelId = config.channels.ticketLogs;
    const logChannel = guild ? guild.channels.cache.get(logChannelId) : null;
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle(`📬 ModMail #${ticket.id} Closed & Archived`)
            .addFields(
                { name: 'Category', value: (ticket.type || 'General').toUpperCase(), inline: true },
                { name: 'User', value: `<@${ticket.user_id}>`, inline: true },
                { name: 'Closed By', value: `<@${closedBy.id}>`, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: '🌐 Web Transcript', value: transcriptUrl ? `[View Transcript Online](${transcriptUrl})` : 'Unavailable', inline: false }
            )
            .setColor(config.colors.secondary)
            .setTimestamp();

        const logComponents = [];
        if (transcriptUrl) {
            logComponents.push(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Open Transcript Online')
                        .setStyle(ButtonStyle.Link)
                        .setURL(transcriptUrl)
                        .setEmoji('🌐')
                )
            );
        }

        await logChannel.send({ embeds: [logEmbed], components: logComponents });
    }

    // 4. Delete Channel after 5 seconds
    if (channel) {
        await channel.send('🔒 **ModMail thread closed.** This channel will delete in 5 seconds...');
        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (_) {}
        }, 5000);
    }
}

module.exports = {
    MODMAIL_CATEGORIES,
    createModmailThread,
    handleIncomingModmailDm,
    handleStaffModmailMessage,
    closeModmailThread
};
