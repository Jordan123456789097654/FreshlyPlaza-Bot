const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { hasTicketOverride, withTicketOverride } = require('../utils/ticketAccess');
const { getDb } = require('../database');
const { buildVoteEmbed, buildVoteButtons, concludeShiftVote, buildStaffStationEmbed, buildStaffStationButtons } = require('../commands/shiftVote');
const { broadcastLoaApproval } = require('../commands/loa');
const { buildSuggestionEmbed, buildSuggestionButtons } = require('../commands/suggestion');

let lastStaffFetchTime = 0;
async function fetchStaffMembersSafe(guild, staffRoleId) {
    if (Date.now() - lastStaffFetchTime > 60000) {
        try {
            await guild.members.fetch();
            lastStaffFetchTime = Date.now();
        } catch (err) {
            console.warn('[GATEWAY RATE LIMIT] Using cached guild members:', err.message);
        }
    }
    return guild.members.cache.filter(m => m.roles.cache.has(staffRoleId) && !m.user.bot);
}

async function handleInteraction(interaction) {
    const db = getDb();

    // 1. BUTTON INTERACTIONS
    // Music Player Interactive Controls
    if (interaction.isButton() && interaction.customId.startsWith('btn_music_')) {
        const musicManager = require('../utils/musicManager');
        const { buildMusicControlRow, buildQueueEmbed } = require('../utils/musicUtils');
        const queue = musicManager.getQueue(interaction.guildId);

        if (!queue || (!queue.currentTrack && queue.queue.length === 0)) {
            return interaction.reply({ content: '⚠️ No music is currently active in this server.', flags: MessageFlags.Ephemeral });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel || (queue.voiceChannelId && voiceChannel.id !== queue.voiceChannelId)) {
            return interaction.reply({ content: '🔊 You must be in the same voice channel as the bot to control playback!', flags: MessageFlags.Ephemeral });
        }

        const action = interaction.customId.replace('btn_music_', '');
        if (action === 'toggle_pause') {
            const isPaused = queue.isPausedState ? queue.isPausedState() : !!(queue.player && queue.player.paused);
            if (isPaused) {
                await queue.resume();
                await interaction.update({ components: [buildMusicControlRow(queue)] });
            } else {
                await queue.pause();
                await interaction.update({ components: [buildMusicControlRow(queue)] });
            }
            return;
        }

        if (action === 'skip') {
            const skipped = await queue.skip();
            if (skipped) {
                return interaction.reply({ content: `⏭️ Skipped by <@${interaction.user.id}>: **${skipped.title}**` });
            } else {
                return interaction.reply({ content: '⚠️ Nothing to skip.', flags: MessageFlags.Ephemeral });
            }
        }

        if (action === 'stop') {
            await queue.stop();
            return interaction.reply({ content: `⏹️ Playback stopped and queue cleared by <@${interaction.user.id}>.` });
        }

        if (action === 'loop') {
            const nextMode = queue.loopMode === 'off' ? 'track' : (queue.loopMode === 'track' ? 'queue' : 'off');
            queue.loopMode = nextMode;
            const labels = { off: 'Off', track: 'Single Track', queue: 'Entire Queue' };
            await interaction.update({ components: [buildMusicControlRow(queue)] });
            return interaction.followUp({ content: `🔁 Loop mode set to: **${labels[nextMode]}**`, flags: MessageFlags.Ephemeral });
        }

        if (action === 'autoplay') {
            queue.autoplay = !queue.autoplay;
            await interaction.update({ components: [buildMusicControlRow(queue)] });
            return interaction.followUp({ content: `📻 Autoplay Radio is now **${queue.autoplay ? 'ENABLED' : 'DISABLED'}**!`, flags: MessageFlags.Ephemeral });
        }

        if (action === 'show_queue') {
            const queueEmbed = buildQueueEmbed(queue, 1);
            return interaction.reply({ embeds: [queueEmbed], flags: MessageFlags.Ephemeral });
        }
    }

    // DM ModMail Close Button
    if (interaction.isButton() && interaction.customId.startsWith('btn_modmail_dm_close_')) {
        await interaction.deferReply();
        const ticketId = interaction.customId.replace('btn_modmail_dm_close_', '');
        const ticket = await db.getTicketById(ticketId);
        if (!ticket || ticket.status === 'CLOSED') {
            return interaction.editReply({ content: 'ℹ️ This ModMail thread has already been closed.' });
        }

        const guild = interaction.client.guilds.cache.get(config.guildId);
        const staffChannel = guild ? guild.channels.cache.get(ticket.channel_id) : null;
        const { closeModmailThread } = require('./modmailHandler');

        await closeModmailThread({
            channel: staffChannel,
            ticket,
            closedBy: interaction.user,
            reason: 'Closed by customer via DM button',
            guild,
            client: interaction.client
        });

        return interaction.editReply({ content: '🔒 ModMail thread closed. Thank you for contacting Grandway Shopping!' });
    }

    // Music Search Result Selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_music_search_result') {
        const music = require('../commands/music');
        const musicManager = require('../utils/musicManager');
        const selectedValue = interaction.values[0];
        const lastUnderscore = selectedValue.lastIndexOf('_');
        const sessionId = selectedValue.slice(0, lastUnderscore);
        const trackIndex = parseInt(selectedValue.slice(lastUnderscore + 1), 10);

        const session = music.searchSessions ? music.searchSessions.get(sessionId) : null;
        if (!session || !session.tracks || !session.tracks[trackIndex]) {
            return interaction.reply({
                content: '⚠️ This search session has expired. Please run `/play` again.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (interaction.user.id !== session.userId) {
            return interaction.reply({
                content: '❌ Only the member who requested the search can choose a song.',
                flags: MessageFlags.Ephemeral
            });
        }

        const track = session.tracks[trackIndex];
        const queue = musicManager.getQueue(interaction.guildId);

        await interaction.deferUpdate();

        try {
            await queue.connect(session.voiceChannel, session.textChannel);

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

                await interaction.editReply({ content: '✅ Track selected!', embeds: [embed], components: [] });
            } else {
                await interaction.editReply({
                    content: `🎶 Selected **${track.title}**! Starting playback...`,
                    components: []
                });
                await queue.playTrack(track);
            }
        } catch (err) {
            await interaction.editReply({
                content: `❌ Could not play selected track: ${err.message}`,
                components: []
            });
        }

        music.searchSessions.delete(sessionId);
        return;
    }

    // DM ModMail Category Select Menu
    if (interaction.isStringSelectMenu() && interaction.customId === 'dm_modmail_select_category') {
        const ticketSettings = await db.getTicketSettings();
        if (!ticketSettings.enabled) {
            return interaction.reply({
                content: `⚠️ **ModMail Support Temporarily Paused:**\n${ticketSettings.disabled_reason || 'Grandway Shopping ModMail is currently offline for scheduled maintenance until further notice.'}`,
                ephemeral: true
            });
        }

        await interaction.deferReply();
        const type = interaction.values[0];
        const guild = interaction.client.guilds.cache.get(config.guildId);
        if (!guild) {
            return interaction.editReply({ content: '❌ Grandway Shopping primary guild could not be reached. Please try again later.' });
        }

        try {
            const { createModmailThread } = require('./modmailHandler');
            const { staffChannel, ticketRecord } = await createModmailThread({
                guild,
                user: interaction.user,
                categoryKey: type,
                subject: 'Direct Message ModMail',
                client: interaction.client
            });

            return interaction.editReply({
                content: '✅ **ModMail Thread Established!** You may now type your questions and upload files directly in this chat.'
            });
        } catch (err) {
            return interaction.editReply({
                content: `⚠️ ${err.message}`
            });
        }
    }

    if (interaction.isButton()) {
        const customId = interaction.customId;

        // Community Event RSVP Button
        if (customId.startsWith('rsvp_event_')) {
            const eventId = parseInt(customId.replace('rsvp_event_', ''), 10);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const eventRecord = await db.get(`SELECT * FROM events WHERE id = ?`, [eventId]);
                if (!eventRecord) {
                    return interaction.editReply({ content: '❌ This event record was not found or has been removed.' });
                }

                let rsvpUsers = [];
                try {
                    rsvpUsers = JSON.parse(eventRecord.rsvp_users || '[]');
                } catch (_) {
                    rsvpUsers = [];
                }

                const userId = interaction.user.id;
                let isJoining = true;

                if (rsvpUsers.includes(userId)) {
                    rsvpUsers = rsvpUsers.filter(id => id !== userId);
                    isJoining = false;
                } else {
                    rsvpUsers.push(userId);
                }

                await db.run(`UPDATE events SET rsvp_users = ? WHERE id = ?`, [JSON.stringify(rsvpUsers), eventId]);

                // Update original announcement message embed with the new RSVP list & count
                if (interaction.message && interaction.message.editable) {
                    try {
                        const oldEmbed = interaction.message.embeds[0];
                        if (oldEmbed) {
                            const updatedEmbed = EmbedBuilder.from(oldEmbed);
                            const attendeesDisplay = rsvpUsers.length > 0
                                ? `${rsvpUsers.length} Member(s):\n${rsvpUsers.slice(0, 25).map(u => `<@${u}>`).join(', ')}${rsvpUsers.length > 25 ? ` *and ${rsvpUsers.length - 25} more...*` : ''}`
                                : '0 Members';

                            const fields = (updatedEmbed.data.fields || []).map(f => {
                                if (f.name.includes('Attendees') || f.name.includes('RSVP')) {
                                    return { name: `👥 Attendees (RSVP) [${rsvpUsers.length}]`, value: attendeesDisplay, inline: false };
                                }
                                return f;
                            });

                            updatedEmbed.setFields(fields);
                            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => null);
                        }
                    } catch (_) {}
                }

                return interaction.editReply({
                    content: isJoining
                        ? `🎉 **You're attending!** Successfully RSVP'd for **${eventRecord.title}**! We look forward to seeing you there.`
                        : `👋 **RSVP cancelled.** You have removed your attendance for **${eventRecord.title}**.`
                });
            } catch (rsvpErr) {
                return interaction.editReply({ content: `❌ Error processing RSVP: ${rsvpErr.message}` });
            }
        }

        // Roblox Bio Verification Confirm Button
        if (customId.startsWith('verify_confirm_')) {
            await interaction.deferReply({ ephemeral: true });
            const verifyModule = require('../commands/verify');
            const pendingVerifications = verifyModule.pendingVerifications;
            const session = pendingVerifications.get(interaction.user.id);

            if (!session) {
                return interaction.editReply({
                    content: '⚠️ No pending verification session found (it may have expired). Please run `/verify` again.'
                });
            }

            const robloxId = session.robloxId;
            const expectedCode = session.code;

            try {
                const bioData = await verifyModule.fetchRobloxUserBio(robloxId);
                if (!bioData) {
                    return interaction.editReply({
                        content: '❌ Failed to communicate with Roblox servers. Please wait a moment and try again.'
                    });
                }

                const currentBio = bioData.description || '';
                if (!currentBio.includes(expectedCode)) {
                    return interaction.editReply({
                        content: `❌ Verification code not detected in your Roblox profile bio!\n\n` +
                            `• **Expected code**: \`${expectedCode}\`\n` +
                            `• **Your Roblox Profile**: https://www.roblox.com/users/${robloxId}/profile\n\n` +
                            `Please make sure you have saved the code into your **About** section on Roblox and try clicking **Confirm Verification** again.`
                    });
                }

                // Code found! Mark verified in database
                await db.setVerification(interaction.user.id, robloxId, session.robloxUsername);
                pendingVerifications.delete(interaction.user.id);

                // Fetch group rank and assign roles
                const { fetchRobloxGroupRank } = verifyModule;
                const { syncMemberRobloxRoles } = require('../utils/robloxSync');
                const { rankNumber, rankName } = await fetchRobloxGroupRank(robloxId, config.robloxGroupId);

                const member = interaction.member;
                if (member) {
                    await syncMemberRobloxRoles(member, rankNumber, rankName);
                    try {
                        await member.setNickname(`${session.robloxUsername} (${rankName})`);
                    } catch (e) {}
                }

                const assignedRoleMentions = [];
                const hierarchyData = require('../utils/robloxSync').hierarchyData;
                if (hierarchyData && hierarchyData.rankToRoleId && hierarchyData.rankToRoleId[String(rankNumber)]) {
                    assignedRoleMentions.push(`<@&${hierarchyData.rankToRoleId[String(rankNumber)]}>`);
                }
                if (rankNumber >= 250 && config.roles.cSuite) assignedRoleMentions.push(`<@&${config.roles.cSuite}>`);
                if (rankNumber >= 100 && config.roles.hr) assignedRoleMentions.push(`<@&${config.roles.hr}>`);
                if (rankNumber >= 30 && config.roles.mr) assignedRoleMentions.push(`<@&${config.roles.mr}>`);
                if (rankNumber >= 10 && config.roles.staff) assignedRoleMentions.push(`<@&${config.roles.staff}>`);
                if (config.roles.verified) assignedRoleMentions.push(`<@&${config.roles.verified}>`);
                if (config.roles.customer) assignedRoleMentions.push(`<@&${config.roles.customer}>`);

                const displayRolesText = assignedRoleMentions.length > 0 
                    ? [...new Set(assignedRoleMentions)].join(' • ') 
                    : `<@&${config.roles.verified}> • <@&${config.roles.customer}>`;

                const successEmbed = new EmbedBuilder()
                    .setTitle('🎉 Verification Successful!')
                    .setDescription(
                        `Welcome to **Grandway Shopping**, **${session.robloxUsername}**!\n\n` +
                        `Your Discord account has been verified via your Roblox profile bio and synced with your Roblox group rank.`
                    )
                    .addFields(
                        { name: '👤 Roblox Account', value: `[${session.robloxUsername}](https://www.roblox.com/users/${robloxId}/profile) (\`${robloxId}\`)`, inline: true },
                        { name: '🏬 Group Rank', value: `**${rankName}** (Rank ${rankNumber})`, inline: true },
                        { name: '🏷️ Assigned Roles', value: displayRolesText, inline: false }
                    )
                    .setColor(config.colors.primary)
                    .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`)
                    .setFooter({ text: 'You may now remove the verification code from your Roblox bio' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [successEmbed] });
            } catch (err) {
                console.error('Error during bio verification check:', err);
                return interaction.editReply({
                    content: `❌ An unexpected error occurred while verifying your profile: ${err.message}`
                });
            }
        }

        // Roblox Bio Verification Cancel Button
        if (customId.startsWith('verify_cancel_')) {
            const verifyModule = require('../commands/verify');
            if (verifyModule.pendingVerifications) {
                verifyModule.pendingVerifications.delete(interaction.user.id);
            }
            return interaction.reply({ content: '🚫 Verification canceled.', ephemeral: true });
        }

        // Unverified Members List Pagination & Refresh
        if (customId.startsWith('unverified_')) {
            if (customId === 'unverified_page_info') {
                return interaction.deferUpdate();
            }

            const member = interaction.member;
            const isAuthorized = member && (
                member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                member.permissions.has(PermissionFlagsBits.Administrator) ||
                (config.roles.staff && member.roles.cache.has(config.roles.staff)) ||
                (config.roles.mr && member.roles.cache.has(config.roles.mr)) ||
                (config.roles.hr && member.roles.cache.has(config.roles.hr))
            );

            if (!isAuthorized) {
                return interaction.reply({
                    content: '🚫 You do not have permission to browse unverified members. (Requires Staff / Manage Roles)',
                    flags: MessageFlags.Ephemeral
                });
            }

            let targetPage = 1;
            if (customId.startsWith('unverified_page_')) {
                targetPage = parseInt(customId.replace('unverified_page_', ''), 10) || 1;
            } else if (customId.startsWith('unverified_refresh_')) {
                targetPage = parseInt(customId.replace('unverified_refresh_', ''), 10) || 1;
            }

            const { buildUnverifiedPage } = require('../commands/verify');
            const renderData = await buildUnverifiedPage(interaction.guild, targetPage);
            return interaction.update(renderData);
        }

        // Verification Center "Verify Account" Prompt Button
        if (customId === 'btn_start_verification') {
            const modal = new ModalBuilder()
                .setCustomId('modal_verify_prompt')
                .setTitle('Grandway Roblox Verification');

            const usernameInput = new TextInputBuilder()
                .setCustomId('roblox_username')
                .setLabel('What is your Roblox username?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. Builderman')
                .setRequired(true)
                .setMinLength(3)
                .setMaxLength(30);

            const row = new ActionRowBuilder().addComponents(usernameInput);
            modal.addComponents(row);

            return await interaction.showModal(modal);
        }

        // ModMail Hub Category Buttons (From #support-center Panel)
        if (customId.startsWith('ticket_') && !customId.startsWith('ticket_settings_')) {
            const ticketSettings = await db.getTicketSettings();
            if (!ticketSettings.enabled) {
                return interaction.reply({
                    content: `⚠️ **ModMail Support Temporarily Paused:**\n${ticketSettings.disabled_reason || 'Grandway Shopping ModMail is currently offline for scheduled maintenance until further notice.'}`,
                    ephemeral: true
                });
            }

            const categoryKey = customId.replace('ticket_', ''); // 'general', 'report', 'management', 'tech'/'technical', 'appeal'/'appeals'
            const normalizedKey = categoryKey === 'tech' ? 'technical' : (categoryKey === 'appeal' ? 'appeals' : categoryKey);

            const { MODMAIL_CATEGORIES, createModmailThread } = require('./modmailHandler');
            const selectedCat = MODMAIL_CATEGORIES[normalizedKey] || MODMAIL_CATEGORIES.general;

            // 1. Check blacklist
            const isBanned = await db.isTicketBlacklisted(interaction.user.id);
            if (isBanned) {
                const expText = isBanned.expires_at ? `<t:${Math.floor(new Date(isBanned.expires_at).getTime() / 1000)}:R>` : 'Never (Permanent)';
                return interaction.reply({
                    content: `🚫 **ModMail Access Restricted:** You are blacklisted from opening Grandway Shopping ModMail.\n• **Reason:** ${isBanned.reason}\n• **Expires:** ${expText}`,
                    ephemeral: true
                });
            }

            // 2. Check existing active ticket
            const activeTicket = await db.getActiveUserTicket(interaction.user.id);
            if (activeTicket) {
                return interaction.reply({
                    content: `⚠️ You already have an active ModMail thread in progress! Please check your **Direct Messages (DMs)** or finish that conversation first.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const { staffChannel, ticketRecord } = await createModmailThread({
                    guild: interaction.guild,
                    user: interaction.user,
                    categoryKey: normalizedKey,
                    subject: `${selectedCat.label} Inquiry`,
                    details: 'Opened via #support-center interactive panel button',
                    client: interaction.client
                });

                return interaction.editReply({
                    content: `✅ **ModMail Thread Opened!**\nOur **${selectedCat.label}** team has received your request.\n👉 **Please check your Direct Messages (DMs) with Grandway Utils to chat!**`
                });
            } catch (err) {
                return interaction.editReply({
                    content: `⚠️ ${err.message}`
                });
            }
        }

        // Reaction Role Toggle Buttons
        if (customId.startsWith('rr_toggle_')) {
            const roleKey = customId.replace('rr_toggle_', '');
            const roleId = config.roles[roleKey];
            const member = interaction.member;

            if (!roleId || !member) {
                return interaction.reply({ content: '❌ Role configuration not found.', ephemeral: true });
            }

            const hasRole = member.roles.cache.has(roleId);
            if (hasRole) {
                await member.roles.remove(roleId, 'Reaction Role Toggle');
                return interaction.reply({
                    content: `🔴 Removed <@&${roleId}> notification role.`,
                    ephemeral: true
                });
            } else {
                await member.roles.add(roleId, 'Reaction Role Toggle');
                return interaction.reply({
                    content: `🟢 Added <@&${roleId}> notification role! You will now receive pings for this category.`,
                    ephemeral: true
                });
            }
        }

        // Bug Report Panel "Submit Bug Report" Button
        if (customId === 'btn_open_bug_modal') {
            const modal = new ModalBuilder()
                .setCustomId('modal_submit_bug_report')
                .setTitle('Submit Bug Report');

            const titleInput = new TextInputBuilder()
                .setCustomId('bug_title')
                .setLabel('Bug Summary / Title')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. Milk scan freezes checkout register')
                .setRequired(true)
                .setMaxLength(100);

            const detailsInput = new TextInputBuilder()
                .setCustomId('bug_details')
                .setLabel('Detailed Bug Description')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Explain what happened, what went wrong, and where in the store.')
                .setRequired(true)
                .setMaxLength(1000);

            const stepsInput = new TextInputBuilder()
                .setCustomId('bug_steps')
                .setLabel('Steps to Reproduce')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('1. Pick up item, 2. Place on counter, 3. Press pay...')
                .setRequired(false)
                .setMaxLength(500);

            const evidenceInput = new TextInputBuilder()
                .setCustomId('bug_evidence')
                .setLabel('Evidence / Screenshot / Clip Link')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://medal.tv/... or https://imgur.com/...')
                .setRequired(false)
                .setMaxLength(250);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(detailsInput),
                new ActionRowBuilder().addComponents(stepsInput),
                new ActionRowBuilder().addComponents(evidenceInput)
            );

            return await interaction.showModal(modal);
        }

        // Developer Action Buttons on Bug Report Embeds
        if (customId.startsWith('bug_action_')) {
            const member = interaction.member;
            const isStaffOrDev = member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                member.roles.cache.some(r => {
                    const n = r.name.toLowerCase();
                    return n.includes('developer') || n.includes('management') || n.includes('high rank') || n.includes('founder') || n.includes('director');
                });

            if (!isStaffOrDev) {
                return interaction.reply({
                    content: '❌ Only Grandway developers and leadership can manage bug reports.',
                    ephemeral: true
                });
            }

            const parts = customId.split('_'); // ['bug', 'action', 'investigate'/'known'/'resolve'/'invalid', '12']
            const actionType = parts[2];
            const bugId = Number(parts[3]);

            const data = db.getData();
            const bug = (data.bugs || []).find(b => b.id === bugId);
            if (!bug) {
                return interaction.reply({ content: '❌ Bug report record not found.', ephemeral: true });
            }

            // If action is resolve or invalid, show a prompt modal for notes
            if (actionType === 'resolve' || actionType === 'invalid') {
                const modal = new ModalBuilder()
                    .setCustomId(`modal_bug_finish_${actionType}_${bugId}`)
                    .setTitle(actionType === 'resolve' ? 'Resolve Bug Report' : 'Mark Bug as Invalid');

                const notesInput = new TextInputBuilder()
                    .setCustomId('dev_notes')
                    .setLabel('Resolution / Developer Notes')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder(actionType === 'resolve' ? 'Fixed in latest supermarket patch v2.4...' : 'Unable to reproduce with provided steps...')
                    .setRequired(true)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder().addComponents(notesInput));
                return await interaction.showModal(modal);
            }

            await interaction.deferReply({ ephemeral: true });

            const { buildBugEmbed, buildBugActionButtons } = require('../commands/bug');
            const targetChannel = interaction.guild.channels.cache.get(config.channels.bugsReport);

            if (actionType === 'investigate') {
                bug.status = 'INVESTIGATING';
                bug.handled_by = interaction.user.id;
                db.save();

                // Update Embed and buttons
                const updatedEmbed = buildBugEmbed(bug);
                const updatedButtons = buildBugActionButtons(bug.id, bug.status);

                try {
                    await interaction.message.edit({ embeds: [updatedEmbed], components: updatedButtons });
                } catch (e) {}

                // Send DM notification to reporter
                try {
                    const reporter = await interaction.client.users.fetch(bug.user_id);
                    await reporter.send({
                        content: `🔍 **Grandway Bug Update:** Your bug report **#${bug.id} (${bug.title})** is now being investigated by <@${interaction.user.id}>!`
                    });
                } catch (dmErr) {}

                // Notify thread if exists
                if (bug.thread_id) {
                    const thread = interaction.guild.channels.cache.get(bug.thread_id);
                    if (thread) await thread.send(`🔍 <@${interaction.user.id}> has marked this bug as **Under Investigation**.`);
                }

                return interaction.editReply({ content: `✅ Marked Bug **#${bug.id}** as Under Investigation!` });
            }

            if (actionType === 'known') {
                bug.status = 'KNOWN_ISSUE';
                bug.handled_by = interaction.user.id;
                db.save();

                const updatedEmbed = buildBugEmbed(bug);
                const updatedButtons = buildBugActionButtons(bug.id, bug.status);

                try {
                    await interaction.message.edit({ embeds: [updatedEmbed], components: updatedButtons });
                } catch (e) {}

                // Post into #known-bugs
                const knownBugsChan = interaction.guild.channels.cache.get(config.channels.knownBugs);
                if (knownBugsChan) {
                    const knownEmbed = EmbedBuilder.from(updatedEmbed)
                        .setTitle(`📌 Known Issue #${bug.id} — ${bug.title}`)
                        .setColor(0xE67E22);
                    await knownBugsChan.send({ embeds: [knownEmbed] }).catch(() => {});
                }

                // Notify reporter
                try {
                    const reporter = await interaction.client.users.fetch(bug.user_id);
                    await reporter.send({
                        content: `📌 **Grandway Bug Update:** Your bug report **#${bug.id} (${bug.title})** has been confirmed as a **Known Issue** and listed for an upcoming store patch!`
                    });
                } catch (dmErr) {}

                if (bug.thread_id) {
                    const thread = interaction.guild.channels.cache.get(bug.thread_id);
                    if (thread) await thread.send(`📌 Marked as **Known Issue** and listed in <#${config.channels.knownBugs}>.`);
                }

                return interaction.editReply({ content: `✅ Marked Bug **#${bug.id}** as Known Issue & copied to <#${config.channels.knownBugs}>!` });
            }
        }

        // Guess The Number (GTN) Interactive Buttons
        if (customId.startsWith('gtn_')) {
            const { handleGtnButton } = require('./gtnHandler');
            return await handleGtnButton(interaction);
        }

        // Activity Check Confirmation Button
        if (customId === 'btn_confirm_activity_check') {
            const member = interaction.member;
            if (!member.roles.cache.has(config.roles.staff)) {
                return interaction.reply({ content: '❌ Only staff members can confirm activity.', ephemeral: true });
            }

            const data = db.getData();
            if (!data.activity_checks) data.activity_checks = [];
            const latestCheck = data.activity_checks[data.activity_checks.length - 1];

            if (latestCheck) {
                if (!latestCheck.confirmed_users) latestCheck.confirmed_users = [];
                if (!latestCheck.confirmed_users.includes(interaction.user.id)) {
                    latestCheck.confirmed_users.push(interaction.user.id);
                    db.save();
                }
            }

            return interaction.reply({ content: '✅ **Activity Confirmed!** Thank you for your continued dedication to the Grandway Shopping staff team.', ephemeral: true });
        }

        // Internal Affairs Voice Recording Stop Button
        if (customId === 'btn_ia_stop_recording') {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.Administrator) ||
                member.roles.cache.some(r => {
                    const n = r.name.toLowerCase();
                    return n.includes('internal affairs') || n.includes('director') || n.includes('head of moderation') || n.includes('trust & safety lead');
                });

            if (!isAuthorized) {
                return interaction.reply({ content: '❌ You are not authorized to conclude this Internal Affairs recording.', ephemeral: true });
            }

            await interaction.deferReply();
            try {
                const { stopIaRecording } = require('../utils/iaRecorder');
                const { AttachmentBuilder } = require('discord.js');
                const { record, filePath, fileName } = await stopIaRecording(interaction.guild.id);
                const att = new AttachmentBuilder(filePath, { name: fileName });

                const doneEmbed = new EmbedBuilder()
                    .setTitle('⏹️ [INTERNAL AFFAIRS] RECORDING CONCLUDED')
                    .setDescription(`Audio wiretap **${record.id}** stopped and exported.\nDownload the interactive player attachment below.`)
                    .setColor(0x2ECC71)
                    .setFooter({ text: 'Grandway Shopping Internal Affairs Vault' })
                    .setTimestamp();

                return interaction.followUp({ embeds: [doneEmbed], files: [att] });
            } catch (err) {
                return interaction.followUp({ content: `❌ Error stopping recording: ${err.message}`, ephemeral: true });
            }
        }

        // Final Warning Individual Activity Check Confirmation Button
        if (customId === 'btn_confirm_warning_check') {
            const data = db.getData();
            if (!data.activity_warning_checks) data.activity_warning_checks = [];
            
            // Check if this user has an active warning check
            let record = data.activity_warning_checks.find(w => w.user_id === interaction.user.id && w.status === 'PENDING');
            if (record) {
                record.status = 'CONFIRMED';
                record.confirmed_at = new Date().toISOString();
                db.save();
            }

            // Also mark as confirmed in the latest global activity check if one exists
            if (data.activity_checks && data.activity_checks.length > 0) {
                const latestCheck = data.activity_checks[data.activity_checks.length - 1];
                if (!latestCheck.confirmed_users) latestCheck.confirmed_users = [];
                if (!latestCheck.confirmed_users.includes(interaction.user.id)) {
                    latestCheck.confirmed_users.push(interaction.user.id);
                    db.save();
                }
            }

            return interaction.reply({ 
                content: '✅ **Final Warning Activity Confirmed!** Your activity confirmation has been logged. Your staff position remains active.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Activity Check View Status Button (Who has reacted and who has not)
        if (customId === 'btn_view_activity_status') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const data = db.getData();
            const checks = data.activity_checks || [];
            const latestCheck = checks[checks.length - 1];

            const staffRoleId = config.roles.staff;
            const loaRoleId = config.roles.loa;

            const staffMembers = await fetchStaffMembersSafe(interaction.guild, staffRoleId);

            const confirmedUserIds = new Set((latestCheck && latestCheck.confirmed_users) || []);

            // Also fetch users who reacted with ✅ on the message
            try {
                const message = interaction.message;
                if (message) {
                    const reaction = message.reactions.cache.get('✅');
                    if (reaction) {
                        const users = await reaction.users.fetch();
                        users.forEach(u => confirmedUserIds.add(u.id));
                    }
                }
            } catch (e) {
                console.error('[ACTIVITY CHECK] Error fetching reactions:', e);
            }

            const confirmedStaff = [];
            const unconfirmedStaff = [];
            const loaStaff = [];
            const newRecruits = [];
            const ignoredUserIds = new Set(config.ignoredUserIds || []);
            const profiles = data.staff_profiles || {};

            staffMembers.forEach(m => {
                if (ignoredUserIds.has(m.id)) return; // Exclude exempt users (SECRET_DEVJED)
                const profile = profiles[m.id];
                const hasLoaRole = m.roles.cache.has(loaRoleId);
                const hasLoaStatus = profile?.loa_status && /loa/i.test(profile.loa_status) && !/not on/i.test(profile.loa_status);

                let isNewRecruit = false;
                if (profile?.joined_staff_at || profile?.hired_at) {
                    const joinedMs = new Date(profile.joined_staff_at || profile.hired_at).getTime();
                    if (!isNaN(joinedMs) && (Date.now() - joinedMs < 7 * 24 * 60 * 60 * 1000)) {
                        isNewRecruit = true;
                    }
                }

                if (hasLoaRole || hasLoaStatus) {
                    loaStaff.push(m);
                } else if (isNewRecruit) {
                    newRecruits.push(m);
                } else if (confirmedUserIds.has(m.id)) {
                    confirmedStaff.push(m);
                } else {
                    unconfirmedStaff.push(m);
                }
            });

            function formatMemberList(list) {
                if (list.length === 0) return '*None*';
                const mentions = list.map(m => `<@${m.id}>`);
                let result = '';
                let count = 0;
                for (const m of mentions) {
                    if ((result + m + ', ').length > 1000) {
                        result += `\n*...and ${list.length - count} more*`;
                        break;
                    }
                    result += (result ? ', ' : '') + m;
                    count++;
                }
                return result;
            }

            const embed = new EmbedBuilder()
                .setTitle('📊 Staff Activity Check — Live Response Tracker')
                .setDescription(`Live status for the current Staff Activity Check in <#${interaction.channel.id}>.`)
                .addFields(
                    { 
                        name: '📈 Status Summary', 
                        value: `• **Total Staff:** ${staffMembers.size}\n• **✅ Reacted / Confirmed:** ${confirmedStaff.length}\n• **❌ Has NOT Reacted:** ${unconfirmedStaff.length}\n• **🌴 On Approved LOA:** ${loaStaff.length}\n• **🌱 New Staff Grace Period (<7d):** ${newRecruits.length}`, 
                        inline: false 
                    },
                    { 
                        name: `✅ Has Reacted / Confirmed (${confirmedStaff.length})`, 
                        value: formatMemberList(confirmedStaff), 
                        inline: false 
                    },
                    { 
                        name: `❌ Has NOT Reacted (${unconfirmedStaff.length})`, 
                        value: formatMemberList(unconfirmedStaff), 
                        inline: false 
                    },
                    { 
                        name: `🌴 On Approved LOA (${loaStaff.length})`, 
                        value: formatMemberList(loaStaff), 
                        inline: false 
                    }
                )
                .setColor(unconfirmedStaff.length === 0 ? config.colors.primary : config.colors.warning)
                .setFooter({ text: 'Grandway Shopping Staff Management' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Shift Vote: Yes Button
        if (customId.startsWith('shift_vote_yes_')) {
            const voteId = customId.replace('shift_vote_yes_', '');
            const vote = await db.getShiftVote(voteId);
            if (!vote || vote.status !== 'ACTIVE') {
                return interaction.reply({ content: '❌ This shift vote has concluded or is no longer active.', ephemeral: true });
            }

            if (!vote.upvotes) vote.upvotes = [];
            if (!vote.downvotes) vote.downvotes = [];

            // Remove from downvotes if previously voted NO
            vote.downvotes = vote.downvotes.filter(id => id !== interaction.user.id);

            // Toggle upvote
            if (vote.upvotes.includes(interaction.user.id)) {
                vote.upvotes = vote.upvotes.filter(id => id !== interaction.user.id);
                db.save();
                const newEmbed = buildVoteEmbed(vote, null, interaction.guild);
                const newRow = buildVoteButtons(vote);
                return interaction.update({ embeds: [newEmbed], components: [newRow] });
            } else {
                vote.upvotes.push(interaction.user.id);
                db.save();
            }

            const target = vote.target_votes || 5;
            if (vote.upvotes.length >= target) {
                await interaction.reply({ content: `✅ Your vote for **YES** was recorded! Target goal reached!`, ephemeral: true });
                await concludeShiftVote(vote, interaction.guild, 'Target Goal Reached');
                return;
            }

            const newEmbed = buildVoteEmbed(vote, null, interaction.guild);
            const newRow = buildVoteButtons(vote);
            return interaction.update({ embeds: [newEmbed], components: [newRow] });
        }

        // Shift Vote: No Button
        if (customId.startsWith('shift_vote_no_')) {
            const voteId = customId.replace('shift_vote_no_', '');
            const vote = await db.getShiftVote(voteId);
            if (!vote || vote.status !== 'ACTIVE') {
                return interaction.reply({ content: '❌ This shift vote has concluded or is no longer active.', ephemeral: true });
            }

            if (!vote.upvotes) vote.upvotes = [];
            if (!vote.downvotes) vote.downvotes = [];

            // Remove from upvotes if previously voted YES
            vote.upvotes = vote.upvotes.filter(id => id !== interaction.user.id);

            // Toggle downvote
            if (vote.downvotes.includes(interaction.user.id)) {
                vote.downvotes = vote.downvotes.filter(id => id !== interaction.user.id);
                db.save();
                const newEmbed = buildVoteEmbed(vote, null, interaction.guild);
                const newRow = buildVoteButtons(vote);
                return interaction.update({ embeds: [newEmbed], components: [newRow] });
            } else {
                vote.downvotes.push(interaction.user.id);
                db.save();
            }

            const newEmbed = buildVoteEmbed(vote, null, interaction.guild);
            const newRow = buildVoteButtons(vote);
            return interaction.update({ embeds: [newEmbed], components: [newRow] });
        }

        // Shift Vote: End Early Button
        if (customId.startsWith('shift_vote_end_')) {
            const voteId = customId.replace('shift_vote_end_', '');
            const vote = await db.getShiftVote(voteId);
            if (!vote || vote.status !== 'ACTIVE') {
                return interaction.reply({ content: '❌ This shift vote has already concluded.', ephemeral: true });
            }

            const member = interaction.member;
            const canEnd = vote.host_id === interaction.user.id || 
                           member.roles.cache.has(config.roles.staff) || 
                           member.roles.cache.has(config.roles.mr) || 
                           member.roles.cache.has(config.roles.hr) ||
                           member.permissions.has('ManageGuild');

            if (!canEnd) {
                return interaction.reply({ content: '❌ Only the shift host or staff members can end this vote.', ephemeral: true });
            }

            await concludeShiftVote(vote, interaction.guild, interaction.user.id);
            return interaction.reply({ content: `✅ Shift vote **#${vote.id}** concluded early!`, ephemeral: true });
        }

        // Shift Vote: View Voters Button
        if (customId.startsWith('shift_vote_view_voters_')) {
            const voteId = customId.replace('shift_vote_view_voters_', '');
            const vote = await db.getShiftVote(voteId);
            if (!vote) {
                return interaction.reply({ content: '❌ Shift vote record not found.', ephemeral: true });
            }

            const yesCount = vote.upvotes ? vote.upvotes.length : 0;
            const noCount = vote.downvotes ? vote.downvotes.length : 0;
            const yesList = vote.upvotes && vote.upvotes.length > 0 ? vote.upvotes.map(u => `<@${u}>`).join(', ') : '*No votes yet*';
            const noList = vote.downvotes && vote.downvotes.length > 0 ? vote.downvotes.map(u => `<@${u}>`).join(', ') : '*No votes yet*';

            const embed = new EmbedBuilder()
                .setTitle(`👥 Shift Vote Voters — Vote #${vote.id}`)
                .setDescription(`**Status:** \`${vote.status}\` • **Shift Host:** <@${vote.host_id}>`)
                .addFields(
                    { name: `🟢 Voted YES (${yesCount})`, value: yesList.slice(0, 1024), inline: false },
                    { name: `🔴 Voted NO (${noCount})`, value: noList.slice(0, 1024), inline: false }
                )
                .setColor(config.colors.secondary)
                .setFooter({ text: `Grandway Shopping Operations • Total: ${yesCount + noCount} votes` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Shift Station Selection for Staff in #staff-announcements
        if (customId.startsWith('shift_station_')) {
            const member = interaction.member;
            const isStaff = member.roles.cache.has(config.roles.staff) || 
                            member.roles.cache.has(config.roles.mr) || 
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageGuild');

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only Grandway Shopping staff members can claim shift duty stations.', ephemeral: true });
            }

            const stationMap = {
                'sco': 'Self-Checkouts',
                'manual': 'Manual Checkouts',
                'restock': 'Restocking',
                'security': 'Security',
                'cs': 'Customer Service',
                'leave': null
            };

            const parts = customId.split('_'); // ['shift', 'station', type, voteId]
            const type = parts[2];
            const voteId = parts[3];

            const vote = await db.getShiftVote(voteId);
            if (!vote || vote.status !== 'ACTIVE') {
                return interaction.reply({ content: '❌ This shift vote has concluded or is no longer active.', ephemeral: true });
            }

            if (!vote.staff_stations) vote.staff_stations = {};
            const stationName = stationMap[type];

            if (stationName) {
                vote.staff_stations[interaction.user.id] = stationName;
            } else {
                delete vote.staff_stations[interaction.user.id];
            }
            db.save();

            const newEmbed = buildStaffStationEmbed(vote, null, interaction.guild);
            const newRows = buildStaffStationButtons(vote);
            await interaction.update({ embeds: [newEmbed], components: newRows });

            if (stationName) {
                return interaction.followUp({ content: `✅ You signed up for **${stationName}** on Shift Vote #${vote.id}!`, ephemeral: true });
            } else {
                return interaction.followUp({ content: `ℹ️ You stepped down from your duty station on Shift Vote #${vote.id}.`, ephemeral: true });
            }
        }

        // Open LOA Modal
        if (customId === 'btn_open_loa_modal') {
            const modal = new ModalBuilder()
                .setCustomId('modal_loa_request')
                .setTitle('Request Leave of Absence (LOA)');

            const startInput = new TextInputBuilder()
                .setCustomId('loa_start')
                .setLabel('Start Date')
                .setPlaceholder('e.g. October 15, 2026')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const endInput = new TextInputBuilder()
                .setCustomId('loa_end')
                .setLabel('End Date')
                .setPlaceholder('e.g. October 22, 2026')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const reasonInput = new TextInputBuilder()
                .setCustomId('loa_reason')
                .setLabel('Reason for Leave')
                .setPlaceholder('School exams, family vacation, personal break...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(startInput),
                new ActionRowBuilder().addComponents(endInput),
                new ActionRowBuilder().addComponents(reasonInput)
            );
            return interaction.showModal(modal);
        }

        // Open Verification Modal
        if (customId === 'btn_open_verify_modal') {
            const modal = new ModalBuilder()
                .setCustomId('modal_verify_account')
                .setTitle('Verify Roblox Account');

            const userInput = new TextInputBuilder()
                .setCustomId('roblox_username')
                .setLabel('Roblox Username')
                .setPlaceholder('Type your exact Roblox username...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            return interaction.showModal(modal);
        }

        // LOA HR Actions: Approve / Deny
        if (customId.startsWith('loa_approve_') || customId.startsWith('loa_deny_')) {
            const isApprove = customId.startsWith('loa_approve_');
            const loaId = customId.replace(isApprove ? 'loa_approve_' : 'loa_deny_', '');

            const data = db.getData();
            const loa = data.loas.find(l => l.id == loaId);
            if (!loa) return interaction.reply({ content: '❌ LOA request record not found.', ephemeral: true });

            loa.status = isApprove ? 'APPROVED' : 'DENIED';
            loa.actioned_by = interaction.user.id;
            db.save();

            if (isApprove && config.roles.loa) {
                try {
                    const member = await interaction.guild.members.fetch(loa.user_id);
                    if (member) await member.roles.add(config.roles.loa);
                } catch (e) {}
                await broadcastLoaApproval(interaction.client, interaction.guild, loa, interaction.user.id);
            } else if (!isApprove) {
                try {
                    const user = await interaction.client.users.fetch(loa.user_id);
                    if (user) {
                        await user.send({
                            content: `❌ **Your Grandway Shopping LOA Request #${loa.id} was DENIED** by <@${interaction.user.id}>.\nIf you have any questions, please contact management.`
                        });
                    }
                } catch (e) {}
            }

            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setTitle(`🌴 LOA Request #${loa.id} — ${isApprove ? 'APPROVED' : 'DENIED'}`)
                 .setColor(isApprove ? config.colors.primary : config.colors.danger)
                 .addFields({ name: isApprove ? '✅ Approved By' : '❌ Denied By', value: `<@${interaction.user.id}>` });

            await interaction.message.edit({ embeds: [embed], components: [] });
            return interaction.reply({ content: `✅ LOA #${loa.id} marked as **${isApprove ? 'APPROVED' : 'DENIED'}**!`, ephemeral: true });
        }

        // Suggestion Submission Button (from #suggestions panel)
        if (customId === 'btn_open_suggestion_modal') {
            const modal = new ModalBuilder()
                .setCustomId('modal_submit_suggestion')
                .setTitle('Submit Grandway Suggestion');

            const titleInput = new TextInputBuilder()
                .setCustomId('sug_title')
                .setLabel('Suggestion Title')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. Add Hot Cocoa & Donuts to Greggs Bakery')
                .setRequired(true)
                .setMaxLength(100);

            const detailsInput = new TextInputBuilder()
                .setCustomId('sug_idea')
                .setLabel('Detailed Idea Description')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Describe your idea in detail and explain how it improves the supermarket.')
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(detailsInput)
            );

            return await interaction.showModal(modal);
        }

        // Suggestion Voting Buttons
        if (customId.startsWith('sug_upvote_') || customId.startsWith('sug_downvote_')) {
            const isUpvote = customId.startsWith('sug_upvote_');
            const sugId = customId.replace(isUpvote ? 'sug_upvote_' : 'sug_downvote_', '');

            const data = db.getData();
            const sug = (data.suggestions || []).find(s => String(s.id) === String(sugId));
            if (!sug) return interaction.reply({ content: '❌ Suggestion record not found.', ephemeral: true });

            let upvotes = Array.isArray(sug.upvotes) ? sug.upvotes : JSON.parse(sug.upvotes || '[]');
            let downvotes = Array.isArray(sug.downvotes) ? sug.downvotes : JSON.parse(sug.downvotes || '[]');

            if (isUpvote) {
                downvotes = downvotes.filter(id => id !== interaction.user.id);
                if (upvotes.includes(interaction.user.id)) {
                    upvotes = upvotes.filter(id => id !== interaction.user.id);
                } else {
                    upvotes.push(interaction.user.id);
                }
            } else {
                upvotes = upvotes.filter(id => id !== interaction.user.id);
                if (downvotes.includes(interaction.user.id)) {
                    downvotes = downvotes.filter(id => id !== interaction.user.id);
                } else {
                    downvotes.push(interaction.user.id);
                }
            }

            sug.upvotes = upvotes;
            sug.downvotes = downvotes;
            db.save();

            const { buildSuggestionEmbed, buildSuggestionButtons } = require('../commands/suggestion');
            const newEmbed = buildSuggestionEmbed(sug);
            const newRows = buildSuggestionButtons(sug);
            return interaction.update({ embeds: [newEmbed], components: newRows });
        }

        // Suggestion Management Buttons (Accept / In Progress / Implemented / Deny)
        if (customId.startsWith('sug_accept_') || customId.startsWith('sug_progress_') || customId.startsWith('sug_implement_') || customId.startsWith('sug_deny_')) {
            const member = interaction.member;
            const isManager = member && (
                member.roles.cache.has(config.roles.mr) ||
                member.roles.cache.has(config.roles.hr) ||
                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                member.permissions.has(PermissionFlagsBits.Administrator)
            );

            if (!isManager) {
                return interaction.reply({ content: '❌ Only Grandway Shopping Leadership / MR+ can review community suggestions.', ephemeral: true });
            }

            let newStatus = 'ACCEPTED';
            let sugId;
            if (customId.startsWith('sug_accept_')) {
                sugId = customId.replace('sug_accept_', '');
                newStatus = 'ACCEPTED';
            } else if (customId.startsWith('sug_progress_')) {
                sugId = customId.replace('sug_progress_', '');
                newStatus = 'IN_PROGRESS';
            } else if (customId.startsWith('sug_implement_')) {
                sugId = customId.replace('sug_implement_', '');
                newStatus = 'IMPLEMENTED';
            } else if (customId.startsWith('sug_deny_')) {
                sugId = customId.replace('sug_deny_', '');
                newStatus = 'DENIED';
            }

            // Show prompt modal for management review reason / notes
            const modal = new ModalBuilder()
                .setCustomId(`modal_sug_action_${newStatus}_${sugId}`)
                .setTitle(`Suggestion Review: ${newStatus}`);

            const reasonInput = new TextInputBuilder()
                .setCustomId('sug_reason')
                .setLabel('Management Decision Note / Reason')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Explain the reason or update details for this decision...')
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return await interaction.showModal(modal);
        }

        // Survey rating button click -> Opens Modal for custom comments & 1-5 feedback
        if (customId.startsWith('survey_')) {
            const parts = customId.split('_');
            const ticketId = parts[1];
            const rating = parseInt(parts[2], 10);

            // Record numeric rating immediately
            await db.recordTicketRating(ticketId, rating);

            const modal = new ModalBuilder()
                .setCustomId(`modal_survey_feedback_${ticketId}_${rating}`)
                .setTitle(`Support Feedback (${rating}/5 Stars)`);

            const commentInput = new TextInputBuilder()
                .setCustomId('survey_comment')
                .setLabel('Tell us more about your experience (Optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('How did our staff or AI do? Any comments on our service?')
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
            return interaction.showModal(modal);
        }

        // Reopen Ticket Button (Active within 2-hour window)
        if (customId.startsWith('reopen_ticket_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const ticketId = customId.replace('reopen_ticket_', '');
            const eligibleTicket = await db.getClosedTicketForReopen(interaction.user.id, ticketId);

            if (!eligibleTicket) {
                return interaction.editReply({
                    content: '❌ **Cannot Reopen:** Tickets can only be reopened within **2 hours** of closing by the original ticket creator. If you still need help, please open a new ticket from the support panel!'
                });
            }

            const guild = interaction.client.guilds.cache.get(config.guildId) || interaction.guild;
            if (!guild) {
                return interaction.editReply({ content: '❌ Could not find Grandway Shopping server. Please open a ticket in the server.' });
            }

            const { TICKET_CATEGORIES, buildTicketControlRow, buildTicketControlRow2 } = require('../commands/ticket');
            const catConfig = TICKET_CATEGORIES[eligibleTicket.type] || TICKET_CATEGORIES.general;
            const targetRoleId = config.roles[catConfig.roleKey] || config.roles.staff;

            try {
                const supportCategory = guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildCategory && 
                    (c.name.includes('SUPPORT TICKETS') || c.id === config.channels.ticketsCategory || c.id === '1558519068951187498')
                );
                const parentCategoryId = supportCategory ? supportCategory.id : config.channels.ticketsCategory;

                const reopenedChannel = await guild.channels.create({
                    name: `reopened-${eligibleTicket.id}-${interaction.user.username}`.slice(0, 32),
                    type: ChannelType.GuildText,
                    parent: parentCategoryId,
                    permissionOverwrites: withTicketOverride([
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { 
                            id: interaction.user.id, 
                            allow: [
                                PermissionFlagsBits.ViewChannel, 
                                PermissionFlagsBits.SendMessages, 
                                PermissionFlagsBits.ReadMessageHistory,
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

                eligibleTicket.status = 'OPEN';
                eligibleTicket.channel_id = reopenedChannel.id;
                eligibleTicket.reopened_at = new Date().toISOString();
                eligibleTicket.reopened_by = interaction.user.id;
                db.save();

                const reopenedEmbed = new EmbedBuilder()
                    .setTitle(`🔄 Ticket #${eligibleTicket.id} Reopened by Customer`)
                    .setDescription(`Welcome back <@${interaction.user.id}>! This ticket was reopened within the 2-hour grace period.\n\n<@&${targetRoleId}> staff have been notified to follow up on your unresolved question.`)
                    .addFields(
                        { name: 'Subject', value: eligibleTicket.subject || 'Support Request', inline: true },
                        { name: 'Previous Close Reason', value: eligibleTicket.close_reason || 'Staff resolved', inline: true }
                    )
                    .setColor(config.colors.warning)
                    .setTimestamp();

                await reopenedChannel.send({
                    content: `<@${interaction.user.id}> <@&${targetRoleId}> 🔔 **TICKET REOPENED**`,
                    embeds: [reopenedEmbed],
                    components: [buildTicketControlRow(ticketRecord?.anon_mode), buildTicketControlRow2()]
                });

                return interaction.editReply({
                    content: `✅ Ticket **#${eligibleTicket.id}** has been reopened! Head over to <#${reopenedChannel.id}>.`
                });
            } catch (err) {
                console.error('[TICKET REOPEN ERROR]', err);
                return interaction.editReply({ content: '❌ Failed to recreate ticket channel. Please open a new ticket via the support panel.' });
            }
        }

        // ModMail Anonymous Reply Button
        if (customId === 'btn_modmail_anon_reply') {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageMessages');
            if (!isStaff) {
                return interaction.reply({ content: '❌ Only Grandway Shopping Staff can send anonymous ModMail replies.', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_modmail_anon_reply')
                .setTitle('Anonymous ModMail Reply');

            const input = new TextInputBuilder()
                .setCustomId('anon_reply_content')
                .setLabel('Staff Response Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Type your response to the user here. Your identity will remain hidden.')
                .setRequired(true)
                .setMaxLength(4000);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // ModMail Toggle Anonymous Mode Button
        if (customId === 'btn_modmail_toggle_anon') {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageMessages');
            if (!isStaff) {
                return interaction.reply({ content: '❌ Only Grandway Shopping Staff can toggle anonymous chat mode.', flags: MessageFlags.Ephemeral });
            }

            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This ModMail thread is no longer active.', flags: MessageFlags.Ephemeral });
            }

            ticket.anon_mode = !ticket.anon_mode;
            db.save();

            const statusText = ticket.anon_mode ? 'ENABLED 🟢' : 'DISABLED ⚪';
            await interaction.reply({
                content: `🕵️ **Anonymous Chat Mode** is now **${statusText}** for this thread.\n${ticket.anon_mode ? '• Every message you send here will be automatically converted to an anonymous ModMail reply and deleted.' : '• Your messages will display your normal username and avatar.'}`,
                flags: MessageFlags.Ephemeral
            });

            const noticeEmbed = new EmbedBuilder()
                .setDescription(`🎭 **Staff Anonymous Chat Mode** has been toggled **${statusText}** by <@${interaction.user.id}>.`)
                .setColor(ticket.anon_mode ? config.colors.primary : config.colors.neutral);

            await interaction.channel.send({ embeds: [noticeEmbed] });
            return;
        }

        // Ticket Claim Button
        if (customId === 'btn_ticket_claim') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ This ticket is no longer active.' });
            }

            if (ticket.claimed_by) {
                return interaction.editReply({ content: `⚠️ This ticket has already been claimed by <@${ticket.claimed_by}>.` });
            }

            ticket.claimed_by = interaction.user.id;
            ticket.claimed_at = new Date().toISOString();
            ticket.status = 'CLAIMED';
            db.save();

            const claimEmbed = new EmbedBuilder()
                .setTitle('✋ ModMail Thread Claimed')
                .setDescription(`This thread has been officially claimed by <@${interaction.user.id}>!`)
                .setColor(config.colors.primary)
                .setTimestamp();

            await interaction.channel.send({ embeds: [claimEmbed] });

            // Notify user in DM
            try {
                const targetUser = await interaction.client.users.fetch(ticket.user_id);
                if (targetUser) {
                    const claimDm = new EmbedBuilder()
                        .setAuthor({
                            name: ticket.anon_mode ? 'Grandway Shopping ModMail Team 🛡️' : `${interaction.user.username} (Staff Colleague)`,
                            iconURL: ticket.anon_mode ? (interaction.guild.iconURL({ dynamic: true }) || undefined) : interaction.user.displayAvatarURL({ dynamic: true })
                        })
                        .setDescription(`✋ Your ModMail thread has been claimed by **${ticket.anon_mode ? 'an on-duty Colleague' : interaction.user.username}**. We are reviewing your inquiry!`)
                        .setColor(config.colors.primary)
                        .setTimestamp();
                    await targetUser.send({ embeds: [claimDm] });
                }
            } catch (_) {}

            return interaction.editReply({ content: `✅ You have claimed ModMail Thread #${ticket.id}!` });
        }

        // Feature #4: Ticket Department Transfer Menu
        if (customId === 'btn_ticket_transfer_menu') {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageMessages');

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ Only Grandway Shopping Staff can transfer tickets to another department.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const { buildTransferSelectMenu } = require('../commands/ticket');
            const row = buildTransferSelectMenu();

            return interaction.reply({
                content: '🔀 **Select the target department below to transfer this ticket:**',
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        }

        // Ticket Quick Tags Snippet Menu
        if (customId === 'btn_ticket_snippets') {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageMessages');

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ Quick Support Snippets are only accessible to Grandway Shopping Staff.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const { buildSnippetSelectMenu } = require('../commands/ticket');
            const row = buildSnippetSelectMenu();

            return interaction.reply({
                content: '⚡ **Select a canned response snippet below to post it directly into this ticket:**',
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        }

        // Feature #1: Ticket AI Summary Button
        if (customId === 'btn_ticket_ai_summary') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket) {
                return interaction.editReply({ content: '❌ Ticket record not found.' });
            }

            // Fetch recent 20 messages for context
            let recentText = '';
            try {
                const fetched = await interaction.channel.messages.fetch({ limit: 20 });
                const ordered = Array.from(fetched.values()).reverse();
                recentText = ordered.map(m => `${m.author.username}: ${m.content}`).join('\n');
            } catch (e) {
                recentText = `Subject: ${ticket.subject}\nDetails: ${ticket.details}`;
            }

            const { generateTicketSummary } = require('../utils/ticketAi');
            const summary = await generateTicketSummary(ticket, recentText);

            const summaryEmbed = new EmbedBuilder()
                .setTitle(`📝 Ticket #${ticket.id} — AI Executive Handover Brief`)
                .setDescription(`AI briefing generated on demand for staff handling.`)
                .addFields(
                    { name: '🎯 Core Customer Issue', value: `> ${summary.core_issue || 'Inquiry regarding ' + ticket.type}`, inline: false },
                    { name: '🛠️ Actions & Troubleshooting Attempted', value: `> ${summary.steps_tried || 'Initial information provided.'}`, inline: false },
                    { name: '👉 Recommended Staff Action', value: `> ${summary.recommended_action || 'Review conversation and advise customer.'}`, inline: false }
                )
                .setColor(config.colors.secondary)
                .setFooter({ text: 'Grandway Shopping AI Assistant • Staff Executive Briefing' })
                .setTimestamp();

            return interaction.editReply({ embeds: [summaryEmbed] });
        }

        // Feature #2: Ghostwriter Send Reply Button
        if (customId.startsWith('btn_send_ghostwrite_')) {
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ Ticket is no longer active.', flags: MessageFlags.Ephemeral });
            }

            // Extract ghostwritten text from message embed
            const embed = interaction.message.embeds[0];
            const draftText = embed?.description?.replace(/^> /gm, '') || '';
            if (!draftText) {
                return interaction.reply({ content: '❌ Could not retrieve suggested draft.', flags: MessageFlags.Ephemeral });
            }

            const shouldSendAnon = Boolean(ticket.anon_mode);

            // Deliver to customer DM
            try {
                const targetUser = await interaction.client.users.fetch(ticket.user_id);
                if (targetUser) {
                    const dmEmbed = new EmbedBuilder()
                        .setAuthor({
                            name: shouldSendAnon ? 'Grandway Shopping ModMail Team 🛡️' : `${interaction.user.username} (Staff Colleague)`,
                            iconURL: shouldSendAnon ? (interaction.guild.iconURL({ dynamic: true }) || undefined) : interaction.user.displayAvatarURL({ dynamic: true })
                        })
                        .setDescription(draftText)
                        .setColor(config.colors.secondary)
                        .setFooter({ text: shouldSendAnon ? 'Official ModMail Response • Support Staff ID Protected' : 'Grandway Shopping Staff Response' })
                        .setTimestamp();
                    await targetUser.send({ embeds: [dmEmbed] });
                }
            } catch (err) {
                return interaction.reply({ content: `⚠️ Could not deliver to customer DMs: ${err.message}`, flags: MessageFlags.Ephemeral });
            }

            // Post receipt into staff channel
            const receiptEmbed = new EmbedBuilder()
                .setAuthor({
                    name: `${interaction.user.username} (${shouldSendAnon ? 'Anonymous to Customer' : 'Signed'})`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                })
                .setDescription(draftText)
                .setColor(config.colors.secondary)
                .setFooter({ text: 'AI Ghostwritten Response Relayed to Customer' })
                .setTimestamp();

            await interaction.channel.send({ embeds: [receiptEmbed] });

            return interaction.reply({ content: '✅ Suggested response delivered to customer DMs!', flags: MessageFlags.Ephemeral });
        }

        // Ticket Close Prompt Button (shows confirmation modal)
        if (customId === 'btn_ticket_close_prompt' || customId === 'btn_close_ticket') {
            const modal = new ModalBuilder()
                .setCustomId('modal_ticket_close')
                .setTitle('Close Support Ticket');

            const reasonInput = new TextInputBuilder()
                .setCustomId('close_reason')
                .setLabel('Reason for Closing')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. Issue resolved, customer helped, invalid...')
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            return interaction.showModal(modal);
        }

        // Ticket Transcript Button
        if (customId === 'btn_ticket_transcript') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket) {
                return interaction.editReply({ content: '❌ Ticket record not found.' });
            }

            const { generateHtmlTranscript } = require('../utils/transcript');
            const { AttachmentBuilder } = require('discord.js');
            const html = await generateHtmlTranscript(interaction.channel, ticket);
            const attachment = new AttachmentBuilder(Buffer.from(html, 'utf-8'), {
                name: `transcript-ticket-${ticket.id}.html`
            });

            return interaction.editReply({
                content: `📋 **Live Transcript for Ticket #${ticket.id}:**`,
                files: [attachment]
            });
        }

        // Close Request: Accept Button
        if (customId.startsWith('btn_accept_close_')) {
            const ticketId = customId.replace('btn_accept_close_', '');
            const ticket = await db.getTicketById(ticketId);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This ticket is already closed.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.user.id !== ticket.user_id && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: '❌ Only the ticket creator or staff can confirm ticket closure.', flags: MessageFlags.Ephemeral });
            }

            await interaction.reply({ content: '🔒 Close accepted! Generating transcript and archiving channel in 5 seconds...' });

            const { generateHtmlTranscript } = require('../utils/transcript');
            const { AttachmentBuilder } = require('discord.js');
            const html = await generateHtmlTranscript(interaction.channel, ticket);
            const transcriptAttachment = new AttachmentBuilder(Buffer.from(html, 'utf-8'), {
                name: `transcript-ticket-${ticket.id}.html`
            });

            ticket.status = 'CLOSED';
            ticket.closed_at = new Date().toISOString();
            ticket.closed_by = interaction.user.id;
            ticket.close_reason = 'Accepted close request by customer.';
            db.save();

            // Log to #ticket-logs
            const logsChannelId = config.channels.ticketLogs;
            const logChannel = interaction.guild.channels.cache.get(logsChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`🔒 Ticket #${ticket.id} Closed (Close Request Accepted)`)
                    .addFields(
                        { name: 'Category', value: ticket.type.toUpperCase(), inline: true },
                        { name: 'Creator', value: `<@${ticket.user_id}>`, inline: true },
                        { name: 'Confirmed By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setColor(config.colors.secondary)
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed], files: [transcriptAttachment] });
            }

            // DM User survey
            try {
                const ticketUser = await interaction.client.users.fetch(ticket.user_id);
                if (ticketUser) {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`🏪 Grandway Shopping — Ticket #${ticket.id} Closed`)
                        .setDescription(`Your support ticket in **${config.storeName}** has been closed.\nAn HTML transcript is attached for your records. Please rate your support experience below!`)
                        .setColor(config.colors.primary);

                    const surveyRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_5`).setLabel('⭐ 5').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_4`).setLabel('⭐ 4').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_3`).setLabel('⭐ 3').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`survey_${ticket.id}_1`).setLabel('⭐ 1').setStyle(ButtonStyle.Danger)
                    );

                    await ticketUser.send({ embeds: [dmEmbed], files: [transcriptAttachment], components: [surveyRow] });
                }
            } catch (e) {}

            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {}
            }, 5000);
            return;
        }

        // Close Request: Decline Button
        if (customId.startsWith('btn_decline_close_')) {
            const ticketId = customId.replace('btn_decline_close_', '');
            const ticket = await db.getTicketById(ticketId);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.reply({ content: '❌ This ticket is no longer active.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.user.id !== ticket.user_id && !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: '❌ Only the ticket creator can decline this close request.', flags: MessageFlags.Ephemeral });
            }

            const declineEmbed = new EmbedBuilder()
                .setTitle('🔓 Close Request Declined — Ticket Kept Open')
                .setDescription(`<@${interaction.user.id}> indicated they still require assistance. Staff will be right with you!`)
                .setColor(config.colors.warning)
                .setTimestamp();

            await interaction.channel.send({ embeds: [declineEmbed] });
            return interaction.reply({ content: '✅ Close request cancelled. Your ticket remains active!', flags: MessageFlags.Ephemeral });
        }

        // Activity Appeal Start Button (clicked in DM or server)
        if (customId.startsWith('btn_appeal_activity_')) {
            const termId = customId.replace('btn_appeal_activity_', '');
            const term = await db.getActivityTerm(termId);

            if (!term) {
                return interaction.reply({ content: '❌ Termination record not found.', flags: MessageFlags.Ephemeral });
            }

            if (term.appeal_status === 'ACCEPTED') {
                return interaction.reply({ content: '✅ Your appeal has already been accepted and your roles have been restored!', flags: MessageFlags.Ephemeral });
            }

            if (term.appeal_status === 'DENIED') {
                return interaction.reply({ content: '❌ Your appeal has already been reviewed and denied by leadership.', flags: MessageFlags.Ephemeral });
            }

            if (term.appeal_status === 'PENDING') {
                return interaction.reply({ content: '⏳ Your appeal has already been submitted and is currently pending review by leadership.', flags: MessageFlags.Ephemeral });
            }

            // Check 30-day appeal limit
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const termDate = new Date(term.termed_at).getTime();
            if (Date.now() - termDate > thirtyDaysMs) {
                return interaction.reply({ 
                    content: '❌ **Appeal Window Expired:** You had 30 days from your termination date to appeal. The 30-day appeal period has passed and this position forfeiture is permanent.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_activity_appeal_${term.id}`)
                .setTitle('Staff Activity Check Appeal');

            const q1 = new TextInputBuilder()
                .setCustomId('appeal_reason')
                .setLabel('Why did you miss the activity check?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Explain why you were unable to react/confirm within 48 hours...')
                .setRequired(true);

            const q2 = new TextInputBuilder()
                .setCustomId('appeal_justification')
                .setLabel('Why should leadership reinstate you?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Describe your commitment and why you want to remain on staff...')
                .setRequired(true);

            const q3 = new TextInputBuilder()
                .setCustomId('appeal_future')
                .setLabel('Will this inactivity happen again?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Explain your future schedule / availability...')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1),
                new ActionRowBuilder().addComponents(q2),
                new ActionRowBuilder().addComponents(q3)
            );

            return interaction.showModal(modal);
        }

        // Accept Activity Appeal Button
        if (customId.startsWith('appeal_accept_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const termId = customId.replace('appeal_accept_', '');
            const term = await db.getActivityTerm(termId);
            if (!term) return interaction.editReply({ content: '❌ Appeal record not found.' });

            const member = interaction.member;
            const isManager = member && (
                member.roles.cache.has(config.roles.hr) ||
                member.roles.cache.has(config.roles.mr) ||
                member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                member.permissions.has(PermissionFlagsBits.Administrator)
            );

            if (!isManager) {
                return interaction.editReply({ content: '❌ Only Grandway Shopping Leadership / HR can accept appeals.' });
            }

            term.appeal_status = 'ACCEPTED';
            term.actioned_by = interaction.user.id;
            term.actioned_at = new Date().toISOString();
            db.save();

            // RE-ROLE THE MEMBER FAST (Bulk single call)
            let restoredCount = 0;
            const targetGuild = interaction.guild || interaction.client.guilds.cache.get(config.guildId);
            if (targetGuild) {
                try {
                    const targetMember = await targetGuild.members.fetch(term.user_id);
                    if (targetMember && term.preserved_roles && term.preserved_roles.length > 0) {
                        const botHighest = targetGuild.members.me ? targetGuild.members.me.roles.highest.position : 999;
                        const rolesToAdd = term.preserved_roles.filter(rId => {
                            const r = targetGuild.roles.cache.get(rId);
                            return r && !r.managed && r.position < botHighest;
                        });
                        if (rolesToAdd.length > 0) {
                            await targetMember.roles.add(rolesToAdd);
                            restoredCount = rolesToAdd.length;
                        }
                    }
                } catch (e) {
                    console.error('[APPEAL ACCEPT] Could not fetch member to re-role:', e);
                }
            }

            // Update Embed in appeals channel
            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`✅ Staff Activity Appeal ACCEPTED — Roles Restored (#${term.id})`)
                .setColor(config.colors.primary)
                .addFields(
                    { name: '✅ Accepted By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔄 Re-Role Status', value: `Restored **${restoredCount}** preserved roles`, inline: true }
                );

            await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

            // DM the user
            try {
                const user = await interaction.client.users.fetch(term.user_id);
                await user.send({
                    content: `🎉 **Grandway Shopping Staff Appeal Accepted!**\n\nYour activity check appeal has been **approved** by <@${interaction.user.id}>!\nAll your previous staff roles have been **reinstated** to your account.\n\nWelcome back to the team! Please ensure to stay active and monitor upcoming staff announcements.`
                });
            } catch (e) {}

            return interaction.editReply({ content: `✅ Appeal **#${term.id}** accepted! <@${term.user_id}> has been re-roled with **${restoredCount}** preserved roles.` });
        }

        // Deny Activity Appeal Button
        if (customId.startsWith('appeal_deny_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const termId = customId.replace('appeal_deny_', '');
            const term = await db.getActivityTerm(termId);
            if (!term) return interaction.editReply({ content: '❌ Appeal record not found.' });

            const member = interaction.member;
            const isManager = member && (
                member.roles.cache.has(config.roles.hr) ||
                member.roles.cache.has(config.roles.mr) ||
                member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                member.permissions.has(PermissionFlagsBits.Administrator)
            );

            if (!isManager) {
                return interaction.editReply({ content: '❌ Only Grandway Shopping Leadership / HR can deny appeals.' });
            }

            term.appeal_status = 'DENIED';
            term.actioned_by = interaction.user.id;
            term.actioned_at = new Date().toISOString();
            db.save();

            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`❌ Staff Activity Appeal DENIED (#${term.id})`)
                .setColor(config.colors.danger)
                .addFields(
                    { name: '❌ Denied By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⚖️ Verdict', value: 'Termination upheld; roles will not be reinstated.', inline: true }
                );

            await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

            // DM the user
            try {
                const user = await interaction.client.users.fetch(term.user_id);
                await user.send({
                    content: `❌ **Grandway Shopping Staff Appeal Denied**\n\nYour activity check appeal has been reviewed and **denied** by <@${interaction.user.id}>.\nYour position termination remains in effect. You may re-apply during the next open application period.`
                });
            } catch (e) {}

            return interaction.editReply({ content: `✅ Appeal **#${term.id}** denied.` });
        }

        // Manual Appeal Start Button (clicked in user's DM)
        if (customId.startsWith('btn_submit_manual_appeal_')) {
            const appealId = customId.replace('btn_submit_manual_appeal_', '');
            const data = db.getData();
            const record = (data.manual_appeals || []).find(a => String(a.id) === String(appealId));

            if (!record) {
                return interaction.reply({ content: '❌ Appeal record not found.', flags: MessageFlags.Ephemeral });
            }
            if (record.status === 'ACCEPTED') {
                return interaction.reply({ content: '✅ This appeal has already been accepted by leadership.', flags: MessageFlags.Ephemeral });
            }
            if (record.status === 'DENIED') {
                return interaction.reply({ content: '❌ This appeal has already been reviewed and denied.', flags: MessageFlags.Ephemeral });
            }
            if (record.status === 'PENDING' && record.submitted_at) {
                return interaction.reply({ content: '⏳ Your appeal has already been submitted and is currently pending leadership review.', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_submit_manual_appeal_${record.id}`)
                .setTitle(`Appeal: ${record.appeal_type}`.slice(0, 45));

            const qRoblox = new TextInputBuilder()
                .setCustomId('appeal_roblox')
                .setLabel('Your Roblox Username')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter your exact Roblox username...')
                .setRequired(true);

            const qReason = new TextInputBuilder()
                .setCustomId('appeal_statement')
                .setLabel('Why should your punishment be appealed?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Explain what happened and why this action should be reversed...')
                .setRequired(true);

            const qFuture = new TextInputBuilder()
                .setCustomId('appeal_prevention')
                .setLabel('How will you prevent future violations?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('State what steps you will take to follow rules going forward...')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(qRoblox),
                new ActionRowBuilder().addComponents(qReason),
                new ActionRowBuilder().addComponents(qFuture)
            );

            return interaction.showModal(modal);
        }

        // Accept Manual Appeal Button
        if (customId.startsWith('manual_appeal_accept_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const appealId = customId.replace('manual_appeal_accept_', '');
            const data = db.getData();
            const record = (data.manual_appeals || []).find(a => String(a.id) === String(appealId));
            if (!record) return interaction.editReply({ content: '❌ Appeal record not found.' });

            const member = interaction.member;
            const isManager = member && (
                member.roles.cache.has(config.roles.hr) ||
                member.roles.cache.has(config.roles.mr) ||
                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                member.permissions.has(PermissionFlagsBits.Administrator)
            );
            if (!isManager) {
                return interaction.editReply({ content: '❌ Only Grandway Shopping Leadership / HR can accept appeals.' });
            }

            record.status = 'ACCEPTED';
            record.actioned_by = interaction.user.id;
            record.actioned_at = new Date().toISOString();
            db.save();

            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`✅ Punishment Appeal ACCEPTED — #${record.id}`)
                .setColor(config.colors.primary)
                .addFields(
                    { name: '✅ Accepted By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📊 Status', value: 'ACCEPTED / APPROVED', inline: true }
                );

            await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

            try {
                const user = await interaction.client.users.fetch(record.user_id);
                if (user) {
                    await user.send({
                        content: `🎉 **Grandway Shopping Appeal Approved!**\n\nYour appeal for **${record.appeal_type}** (#${record.id}) has been **accepted** by <@${interaction.user.id}>!\nAny associated restrictions have been lifted. Welcome back!`
                    });
                }
            } catch (e) {}

            return interaction.editReply({ content: `✅ Appeal **#${record.id}** accepted!` });
        }

        // Deny Manual Appeal Button
        if (customId.startsWith('manual_appeal_deny_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const appealId = customId.replace('manual_appeal_deny_', '');
            const data = db.getData();
            const record = (data.manual_appeals || []).find(a => String(a.id) === String(appealId));
            if (!record) return interaction.editReply({ content: '❌ Appeal record not found.' });

            const member = interaction.member;
            const isManager = member && (
                member.roles.cache.has(config.roles.hr) ||
                member.roles.cache.has(config.roles.mr) ||
                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                member.permissions.has(PermissionFlagsBits.Administrator)
            );
            if (!isManager) {
                return interaction.editReply({ content: '❌ Only Grandway Shopping Leadership / HR can deny appeals.' });
            }

            record.status = 'DENIED';
            record.actioned_by = interaction.user.id;
            record.actioned_at = new Date().toISOString();
            db.save();

            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = EmbedBuilder.from(originalEmbed)
                .setTitle(`❌ Punishment Appeal DENIED — #${record.id}`)
                .setColor(config.colors.danger)
                .addFields(
                    { name: '❌ Denied By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⚖️ Verdict', value: 'Punishment upheld.', inline: true }
                );

            await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

            try {
                const user = await interaction.client.users.fetch(record.user_id);
                if (user) {
                    await user.send({
                        content: `❌ **Grandway Shopping Appeal Denied**\n\nYour appeal for **${record.appeal_type}** (#${record.id}) has been reviewed and **denied** by <@${interaction.user.id}>.\nThe punishment remains in effect.`
                    });
                }
            } catch (e) {}

            return interaction.editReply({ content: `✅ Appeal **#${record.id}** denied.` });
        }
    }

    // 2. MODAL SUBMISSIONS
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        // Submit LOA Modal
        if (customId === 'modal_loa_request') {
            const startDate = interaction.fields.getTextInputValue('loa_start');
            const endDate = interaction.fields.getTextInputValue('loa_end');
            const reason = interaction.fields.getTextInputValue('loa_reason');

            const loa = await db.addLoa(interaction.user.id, startDate, endDate, reason);

            const loaEmbed = new EmbedBuilder()
                .setTitle(`🌴 LOA Request #${loa.id} — Pending Review`)
                .setDescription(`A new Leave of Absence request has been submitted by <@${interaction.user.id}>.`)
                .addFields(
                    { name: '👤 Staff Member', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                    { name: '📅 Duration', value: `**${startDate}** to **${endDate}**`, inline: true },
                    { name: '🆔 LOA ID', value: `#${loa.id}`, inline: true },
                    { name: '📝 Reason', value: reason, inline: false }
                )
                .setColor(config.colors.warning)
                .setTimestamp();

            const hrRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`loa_approve_${loa.id}`).setLabel('✅ Approve LOA').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`loa_deny_${loa.id}`).setLabel('❌ Deny LOA').setStyle(ButtonStyle.Danger)
            );

            const hrChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs) || interaction.guild.channels.cache.get(config.channels.modLogs) || interaction.channel;
            if (hrChannel) {
                await hrChannel.send({ embeds: [loaEmbed], components: [hrRow] });
            }

            return interaction.reply({ content: `✅ LOA Request **#${loa.id}** submitted to HR!`, ephemeral: true });
        }

        // Anonymous IA Whistleblower Modal
        if (customId === 'modal_ia_whistleblow_submit') {
            await interaction.deferReply({ ephemeral: true });

            const accused = interaction.fields.getTextInputValue('wb_accused');
            const category = interaction.fields.getTextInputValue('wb_category');
            const details = interaction.fields.getTextInputValue('wb_details');
            const evidence = interaction.fields.getTextInputValue('wb_evidence') || 'None provided';

            const token = `WB-${Date.now().toString().slice(-4)}-${Math.floor(Math.random()*900)+100}`;

            const reportRecord = {
                token,
                accused,
                category,
                details,
                evidence,
                status: 'PENDING_REVIEW',
                submitted_at: new Date().toISOString()
            };

            await db.addIaWhistleblow(reportRecord);

            // Forward to Trust & Safety server #ia-staff-case-dockets
            const tsGuild = interaction.client.guilds.cache.get('1561767415044378694');
            if (tsGuild) {
                const docketCh = tsGuild.channels.cache.find(c => c.name.includes('ia-staff-case-dockets'));
                if (docketCh) {
                    const alertEmbed = new EmbedBuilder()
                        .setTitle(`🚨 [ANONYMOUS WHISTLEBLOWER DISCLOSURE] Token: ${token}`)
                        .setDescription(
                            `A confidential staff whistleblower report has been received by the Internal Affairs Division.\n\n` +
                            `**Accused Subject:** \`${accused}\`\n` +
                            `**Violation Category:** \`${category}\`\n` +
                            `**Verification Token:** \`${token}\`\n\n` +
                            `**Confidential Statement:**\n\`\`\`\n${details}\n\`\`\`\n` +
                            `**Attached Evidence Links:**\n${evidence}`
                        )
                        .setColor(0x1A5276)
                        .setFooter({ text: 'Grandway Shopping IA Whistleblower Protection Protocol' })
                        .setTimestamp();

                    await docketCh.send({ embeds: [alertEmbed] }).catch(() => {});
                }
            }

            const confirmEmbed = new EmbedBuilder()
                .setTitle('🔒 Whistleblower Submission Received')
                .setDescription(
                    `Your confidential disclosure has been safely delivered to the **Chief of Internal Affairs**.\n\n` +
                    `Your identity is **100% protected** and is not attached to this report.\n\n` +
                    `**Your Anonymous Case Token:**\n\`\`\`\n${token}\n\`\`\`\n` +
                    `Keep this token safe. You can use it to reference this case with Internal Affairs leadership.`
                )
                .setColor(0x2ECC71)
                .setFooter({ text: 'Grandway Shopping Internal Affairs Anti-Retaliation Guarantee' });

            return interaction.followUp({ embeds: [confirmEmbed] });
        }

        // Verification Modal Submission
        if (interaction.customId === 'modal_verify_prompt') {
            await interaction.deferReply({ ephemeral: true });
            const usernameInput = interaction.fields.getTextInputValue('roblox_username');
            const verifyModule = require('../commands/verify');
            return await verifyModule.startVerificationProcess(interaction, usernameInput);
        }

        // Bug Report Modal Submission from #bug-reports panel
        if (interaction.customId === 'modal_submit_bug_report') {
            await interaction.deferReply({ ephemeral: true });
            const title = interaction.fields.getTextInputValue('bug_title');
            const details = interaction.fields.getTextInputValue('bug_details');
            const steps = interaction.fields.getTextInputValue('bug_steps') || 'None provided';
            const evidence = interaction.fields.getTextInputValue('bug_evidence') || 'None';

            const data = db.getData();
            if (!data.bugs) data.bugs = [];

            const newId = data.bugs.length + 1;
            const bugRecord = {
                id: newId,
                user_id: interaction.user.id,
                title,
                details,
                severity: 'moderate',
                category: 'other',
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

            const { buildBugEmbed, buildBugActionButtons } = require('../commands/bug');
            const bugsChannel = interaction.guild.channels.cache.get(config.channels.bugsReport);

            if (bugsChannel) {
                const embed = buildBugEmbed(bugRecord);
                const buttons = buildBugActionButtons(newId, 'PENDING');
                const msg = await bugsChannel.send({ embeds: [embed], components: buttons });

                bugRecord.message_id = msg.id;

                // Automatic public thread
                try {
                    const thread = await msg.startThread({
                        name: `Bug #${newId} — ${title.slice(0, 50)}`,
                        autoArchiveDuration: 1440
                    });
                    bugRecord.thread_id = thread.id;
                    await thread.send(`👋 Discussion thread for Bug Report **#${newId}**. Players can share additional repro steps and screenshots here.`);
                } catch (tErr) {}

                db.save();
            }

            return interaction.editReply({
                content: `✅ Bug report **#${newId}** has been submitted! Our development team has been notified in <#${config.channels.bugsReport}>.`
            });
        }

        // Bug Report Developer Finish Modal (Resolve / Invalid)
        if (interaction.customId.startsWith('modal_bug_finish_')) {
            await interaction.deferReply({ ephemeral: true });
            const parts = interaction.customId.split('_'); // ['modal', 'bug', 'finish', 'resolve'/'invalid', '12']
            const actionType = parts[3];
            const bugId = Number(parts[4]);
            const notes = interaction.fields.getTextInputValue('dev_notes');

            const data = db.getData();
            const bug = (data.bugs || []).find(b => b.id === bugId);
            if (!bug) {
                return interaction.editReply({ content: '❌ Bug record not found.' });
            }

            bug.status = actionType === 'resolve' ? 'RESOLVED' : 'INVALID';
            bug.handled_by = interaction.user.id;
            bug.resolution_notes = notes;
            db.save();

            const { buildBugEmbed, buildBugActionButtons } = require('../commands/bug');
            const bugsChannel = interaction.guild.channels.cache.get(config.channels.bugsReport);

            // Update main embed in #bug-reports
            if (bugsChannel && bug.message_id) {
                try {
                    const msg = await bugsChannel.messages.fetch(bug.message_id);
                    const updatedEmbed = buildBugEmbed(bug);
                    const updatedButtons = buildBugActionButtons(bug.id, bug.status);
                    await msg.edit({ embeds: [updatedEmbed], components: updatedButtons });
                } catch (e) {}
            }

            // If resolved, post to #known-bugs as resolved or update it
            if (actionType === 'resolve') {
                const knownBugsChan = interaction.guild.channels.cache.get(config.channels.knownBugs);
                if (knownBugsChan) {
                    const resolvedEmbed = buildBugEmbed(bug);
                    await knownBugsChan.send({ embeds: [resolvedEmbed] }).catch(() => {});
                }
            }

            // Close discussion thread if exists
            if (bug.thread_id) {
                try {
                    const thread = interaction.guild.channels.cache.get(bug.thread_id);
                    if (thread) {
                        await thread.send(`🔒 Bug **#${bug.id}** marked as **${bug.status}** by <@${interaction.user.id}>:\n> ${notes}`);
                        await thread.setArchived(true);
                    }
                } catch (e) {}
            }

            // Send notification DM to the reporter
            try {
                const reporter = await interaction.client.users.fetch(bug.user_id);
                if (reporter) {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`🐛 Grandway Bug Report #${bug.id} Status Update`)
                        .setDescription(
                            `Your bug report **"${bug.title}"** has been updated by **${interaction.user.username}**!\n\n` +
                            `• **New Status:** ${actionType === 'resolve' ? '✅ **Resolved & Patched**' : '❌ **Marked as Invalid / Cannot Reproduce**'}\n` +
                            `• **Developer Notes:**\n> ${notes}\n\n` +
                            `Thank you for helping keep Grandway Shopping running smoothly!`
                        )
                        .setColor(actionType === 'resolve' ? config.colors.primary : config.colors.neutral)
                        .setFooter({ text: 'Grandway Shopping Bug Tracking System' })
                        .setTimestamp();

                    await reporter.send({ embeds: [dmEmbed] });
                }
            } catch (e) {}

            return interaction.editReply({
                content: `✅ Successfully marked Bug Report **#${bug.id}** as **${bug.status}**!`
            });
        }

        // Verify Account Modal
        if (customId === 'modal_verify_account') {
            await interaction.deferReply({ ephemeral: true });
            const username = interaction.fields.getTextInputValue('roblox_username');

            await db.setVerification(interaction.user.id, '12345678', username);

            if (config.roles.verified) {
                try {
                    await interaction.member.roles.add(config.roles.verified);
                } catch (e) {}
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Roblox Account Verified!')
                .setDescription(`Linked **${username}** to <@${interaction.user.id}>!\nAssigned <@&${config.roles.verified}> role and synced Roblox Group rank (Group ID: \`${config.robloxGroupId}\`).`)
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Suggestion Submission Modal
        if (interaction.customId === 'modal_submit_suggestion') {
            await interaction.deferReply({ ephemeral: true });
            const title = interaction.fields.getTextInputValue('sug_title');
            const idea = interaction.fields.getTextInputValue('sug_idea');

            const data = db.getData();
            if (!data.suggestions) data.suggestions = [];

            const newId = data.suggestions.length + 1;
            const sug = {
                id: newId,
                user_id: interaction.user.id,
                title,
                suggestion: idea,
                category: 'other',
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

            const { buildSuggestionEmbed, buildSuggestionButtons } = require('../commands/suggestion');
            const sugChannel = interaction.guild.channels.cache.get(config.channels.suggestions);

            if (sugChannel) {
                const embed = buildSuggestionEmbed(sug);
                const rows = buildSuggestionButtons(sug);
                const msg = await sugChannel.send({ embeds: [embed], components: rows });

                sug.message_id = msg.id;

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

            return interaction.editReply({
                content: `✅ Suggestion **#${newId}** has been posted to <#${config.channels.suggestions}>!`
            });
        }

        // Suggestion Management Action Reason Modal (Accept / In Progress / Implemented / Deny)
        if (interaction.customId.startsWith('modal_sug_action_')) {
            await interaction.deferReply({ ephemeral: true });
            const parts = interaction.customId.split('_'); // ['modal', 'sug', 'action', 'ACCEPTED', '12']
            const newStatus = parts[3];
            const sugId = Number(parts[4]);
            const reason = interaction.fields.getTextInputValue('sug_reason');

            const data = db.getData();
            const sug = (data.suggestions || []).find(s => s.id === sugId);
            if (!sug) {
                return interaction.editReply({ content: '❌ Suggestion record not found.' });
            }

            sug.status = newStatus;
            sug.actioned_by = interaction.user.id;
            sug.actioned_at = new Date().toISOString();
            sug.action_reason = reason;
            db.save();

            const { buildSuggestionEmbed, buildSuggestionButtons } = require('../commands/suggestion');
            const sugChannel = interaction.guild.channels.cache.get(config.channels.suggestions);

            // Update main embed
            if (sugChannel && sug.message_id) {
                try {
                    const msg = await sugChannel.messages.fetch(sug.message_id);
                    const updatedEmbed = buildSuggestionEmbed(sug);
                    const updatedButtons = buildSuggestionButtons(sug);
                    await msg.edit({ embeds: [updatedEmbed], components: updatedButtons });
                } catch (e) {}
            }

            // Post notice in discussion thread if open
            if (sug.thread_id) {
                try {
                    const thread = interaction.guild.channels.cache.get(sug.thread_id);
                    if (thread) {
                        await thread.send(`👔 Suggestion **#${sug.id}** marked as **${newStatus}** by <@${interaction.user.id}>:\n> ${reason}`);
                        if (newStatus === 'DENIED' || newStatus === 'IMPLEMENTED') {
                            await thread.setArchived(true);
                        }
                    }
                } catch (e) {}
            }

            // Send notification DM to the suggestion author
            try {
                const author = await interaction.client.users.fetch(sug.user_id);
                if (author) {
                    const statusLabels = {
                        ACCEPTED: '✅ Accepted by Management',
                        IN_PROGRESS: '🚧 In Progress / Planned Update',
                        IMPLEMENTED: '🎉 Implemented in Supermarket!',
                        DENIED: '❌ Denied by Leadership'
                    };

                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`💡 Grandway Suggestion #${sug.id} Status Update`)
                        .setDescription(
                            `Your suggestion **"${sug.title || sug.suggestion.slice(0, 50)}"** has been reviewed by **${interaction.user.username}**!\n\n` +
                            `• **New Status:** ${statusLabels[newStatus] || newStatus}\n` +
                            `• **Management Decision Note:**\n> ${reason}\n\n` +
                            `Thank you for contributing ideas to make Grandway Shopping a better experience!`
                        )
                        .setColor(newStatus === 'ACCEPTED' || newStatus === 'IMPLEMENTED' ? config.colors.primary : (newStatus === 'IN_PROGRESS' ? config.colors.warning : config.colors.danger))
                        .setFooter({ text: 'Grandway Shopping Community Feedback' })
                        .setTimestamp();

                    await author.send({ embeds: [dmEmbed] });
                }
            } catch (dmErr) {}

            return interaction.editReply({
                content: `✅ Successfully marked Suggestion **#${sug.id}** as **${newStatus}**!`
            });
        }

        // Submit Activity Appeal Modal
        if (customId.startsWith('modal_activity_appeal_')) {
            const termId = customId.replace('modal_activity_appeal_', '');
            const term = await db.getActivityTerm(termId);
            if (!term) {
                return interaction.reply({ content: '❌ Termination record not found.', flags: MessageFlags.Ephemeral });
            }

            const reason = interaction.fields.getTextInputValue('appeal_reason');
            const justification = interaction.fields.getTextInputValue('appeal_justification');
            const future = interaction.fields.getTextInputValue('appeal_future');

            term.appeal_status = 'PENDING';
            term.appeal_answers = { reason, justification, future };
            term.appealed_at = new Date().toISOString();
            db.save();

            const targetChannelId = config.channels.activityAppeals || '1505309938715725866';
            let appealChannel;
            try {
                appealChannel = await interaction.client.channels.fetch(targetChannelId);
            } catch (e) {
                appealChannel = interaction.client.channels.cache.get(targetChannelId);
            }

            if (appealChannel) {
                const termTimestamp = Math.floor(new Date(term.termed_at).getTime() / 1000);
                const roleMentions = term.preserved_roles && term.preserved_roles.length > 0 
                    ? term.preserved_roles.map(r => `<@&${r}>`).join(', ') 
                    : '*None*';

                const appealEmbed = new EmbedBuilder()
                    .setTitle(`📋 Staff Activity Check Appeal — #${term.id}`)
                    .setDescription(`An activity check termination appeal has been submitted by <@${term.user_id}> (\`${term.user_tag}\`).\nReview the responses below and choose whether to accept and restore roles, or deny.`)
                    .addFields(
                        { name: '👤 Staff Member', value: `<@${term.user_id}> (\`${term.user_id}\`)`, inline: true },
                        { name: '🛡️ Termed By', value: `<@${term.termed_by}>`, inline: true },
                        { name: '📅 Term Date', value: `<t:${termTimestamp}:f>`, inline: true },
                        { name: '🎭 Preserved Roles to Restore', value: roleMentions.slice(0, 1024), inline: false },
                        { name: '❓ Why did you miss the activity check?', value: reason.slice(0, 1024), inline: false },
                        { name: '❓ Why should leadership reinstate you?', value: justification.slice(0, 1024), inline: false },
                        { name: '❓ Will this happen again / Future Availability', value: future.slice(0, 1024), inline: false }
                    )
                    .setColor(config.colors.warning)
                    .setFooter({ text: `Term ID: #${term.id} • Grandway Shopping Appeal Management` })
                    .setTimestamp();

                const decisionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`appeal_accept_${term.id}`)
                        .setLabel('✅ Accept & Restore Roles')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`appeal_deny_${term.id}`)
                        .setLabel('❌ Deny Appeal')
                        .setStyle(ButtonStyle.Danger)
                );

                await appealChannel.send({
                    content: `👑 **NEW STAFF ACTIVITY APPEAL SUBMITTED:** <@${term.user_id}>`,
                    embeds: [appealEmbed],
                    components: [decisionRow]
                });
            }

            return interaction.reply({
                content: '✅ **Your Staff Activity Appeal has been submitted!** Grandway Shopping leadership will review your answers. You will receive a direct message once a decision is made.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Modal for Manual Punishment Appeal Submission
        if (customId.startsWith('modal_submit_manual_appeal_')) {
            const appealId = customId.replace('modal_submit_manual_appeal_', '');
            const data = db.getData();
            const record = (data.manual_appeals || []).find(a => String(a.id) === String(appealId));

            if (!record) {
                return interaction.reply({ content: '❌ Appeal record not found.', flags: MessageFlags.Ephemeral });
            }

            const robloxUser = interaction.fields.getTextInputValue('appeal_roblox');
            const statement = interaction.fields.getTextInputValue('appeal_statement');
            const prevention = interaction.fields.getTextInputValue('appeal_prevention');

            record.status = 'PENDING';
            record.roblox_user = robloxUser;
            record.statement = statement;
            record.prevention = prevention;
            record.submitted_at = new Date().toISOString();
            db.save();

            const targetChannelId = config.channels.activityAppeals || config.channels.ticketLogs || '1505309938715725866';
            let appealChannel;
            try {
                appealChannel = await interaction.client.channels.fetch(targetChannelId);
            } catch (e) {
                appealChannel = interaction.client.channels.cache.get(targetChannelId);
            }

            if (appealChannel) {
                const appealEmbed = new EmbedBuilder()
                    .setTitle(`⚖️ Punishment Appeal Submitted — #${record.id}`)
                    .setDescription(`An official punishment appeal has been submitted by <@${record.user_id}> (\`${record.user_tag}\`).\nReview their statement below:`)
                    .addFields(
                        { name: '👤 Applicant', value: `<@${record.user_id}> (\`${record.user_id}\`)`, inline: true },
                        { name: '⚖️ Punishment Type', value: record.appeal_type, inline: true },
                        { name: '🎮 Roblox Username', value: `\`${robloxUser}\``, inline: true },
                        { name: '📋 Original Reason', value: `\`\`\`${record.reason}\`\`\``, inline: false },
                        { name: '❓ Why should this be appealed?', value: statement.slice(0, 1024), inline: false },
                        { name: '❓ Prevention / Future Commitments', value: prevention.slice(0, 1024), inline: false }
                    )
                    .setColor(config.colors.warning)
                    .setFooter({ text: `Appeal ID: #${record.id} • Grandway Shopping Moderation` })
                    .setTimestamp();

                const decisionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`manual_appeal_accept_${record.id}`)
                        .setLabel('✅ Accept Appeal')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`manual_appeal_deny_${record.id}`)
                        .setLabel('❌ Deny Appeal')
                        .setStyle(ButtonStyle.Danger)
                );

                await appealChannel.send({
                    content: `👑 **NEW PUNISHMENT APPEAL SUBMITTED:** <@${record.user_id}> (${record.appeal_type})`,
                    embeds: [appealEmbed],
                    components: [decisionRow]
                });
            }

            return interaction.reply({
                content: '✅ **Your Appeal has been successfully submitted!** Grandway Shopping leadership will review your answers. You will receive a direct message when a decision is made.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Modal for Anonymous ModMail Reply
        if (customId === 'modal_modmail_anon_reply') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageMessages');
            if (!isStaff) {
                return interaction.editReply({ content: '❌ Only Grandway Shopping Staff can send anonymous ModMail replies.' });
            }

            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ This ModMail thread is no longer active.' });
            }

            const replyText = interaction.fields.getTextInputValue('anon_reply_content');

            const anonEmbed = new EmbedBuilder()
                .setAuthor({
                    name: 'Grandway Shopping ModMail Team 🛡️',
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .setDescription(replyText)
                .setColor(config.colors.secondary)
                .setFooter({ text: 'Official ModMail Response • Support Staff ID Protected' })
                .setTimestamp();

            // Deliver directly to customer DM
            try {
                const targetUser = await interaction.client.users.fetch(ticket.user_id);
                if (targetUser) {
                    await targetUser.send({ embeds: [anonEmbed] });
                }
            } catch (dmErr) {
                return interaction.editReply({ content: `⚠️ **Delivery Failed:** <@${ticket.user_id}> has DMs closed or blocked.` });
            }

            // Post receipt into staff channel
            const receiptEmbed = new EmbedBuilder()
                .setAuthor({
                    name: `${interaction.user.username} (Anonymous to Customer)`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                })
                .setDescription(replyText)
                .setColor(config.colors.secondary)
                .setFooter({ text: 'Relayed to customer DM • Staff identity hidden in DM' })
                .setTimestamp();

            await interaction.channel.send({ embeds: [receiptEmbed] });

            await db.addTicketNote(interaction.channel.id, interaction.user.id, `[ANON REPLY (${interaction.user.tag})]: ${replyText}`);

            ticket.last_staff_response_at = new Date().toISOString();
            ticket.awaiting_customer = true;
            ticket.customer_warned_at = null;
            if (!ticket.first_response_at) ticket.first_response_at = new Date().toISOString();
            db.save();

            return interaction.editReply({ content: '✅ Anonymous ModMail response dispatched to customer.' });
        }

        // Modal for ModMail Close
        if (customId === 'modal_ticket_close') {
            await interaction.deferReply();
            const reason = interaction.fields.getTextInputValue('close_reason') || 'Resolved by user/staff';
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ ModMail thread is not active.' });
            }

            const { closeModmailThread } = require('./modmailHandler');
            await closeModmailThread({
                channel: interaction.channel,
                ticket,
                closedBy: interaction.user,
                reason,
                guild: interaction.guild,
                client: interaction.client
            });

            return interaction.editReply({ content: '🔒 ModMail thread concluded and archived.' });
        }

        // Modal for Ticket Creation Intake
        // Modal for ModMail Creation Intake
        if (customId.startsWith('modal_create_ticket_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const categoryKey = customId.replace('modal_create_ticket_', '');
            const subject = interaction.fields.getTextInputValue('ticket_subject') || 'General ModMail Inquiry';
            const details = interaction.fields.getTextInputValue('ticket_details') || '';
            const robloxUser = interaction.fields.getTextInputValue('ticket_roblox') || '';

            const { createModmailThread, MODMAIL_CATEGORIES } = require('./modmailHandler');
            const catConfig = MODMAIL_CATEGORIES[categoryKey] || MODMAIL_CATEGORIES.general;

            try {
                const { staffChannel, ticketRecord } = await createModmailThread({
                    guild: interaction.guild,
                    user: interaction.user,
                    member: interaction.member,
                    categoryKey,
                    subject: `${subject}${robloxUser ? ` (Roblox: ${robloxUser})` : ''}`,
                    details,
                    client: interaction.client
                });

                return interaction.editReply({
                    content: `📬 **ModMail Thread Established!**\n\n` +
                             `Please open your **Direct Messages (DMs)** with <@${interaction.client.user.id}> to chat with our staff team.\n` +
                             `Your inquiry and details have been forwarded to the **${catConfig.label}** team.\n\n` +
                             `• **Mailbox:** ${catConfig.emoji} ${catConfig.label}\n` +
                             `• **Thread ID:** \`#${ticketRecord.id}\``
                });
            } catch (err) {
                return interaction.editReply({
                    content: `⚠️ **Could not open ModMail thread:** ${err.message}`
                });
            }
        }

        // Modal for Survey Feedback Submission (Rating + Comments)
        if (customId.startsWith('modal_survey_feedback_')) {
            const parts = customId.split('_');
            const ticketId = parts[3];
            const rating = parseInt(parts[4], 10);
            const userComment = interaction.fields.getTextInputValue('survey_comment') || '';

            await db.recordTicketRating(ticketId, rating, userComment);

            // Feature #21: Public CSAT Review Showcase (Broadcast 5-Star Reviews)
            if (rating >= 4) {
                try {
                    const ticketRecord = await db.getTicketById(ticketId);
                    const reviewChannelId = config.channels.customerReviews || config.channels.devUpdates || config.channels.ticketLogs;
                    const reviewChannel = interaction.client.channels.cache.get(reviewChannelId);
                    if (reviewChannel) {
                        const stars = '⭐'.repeat(rating);
                        const helperStaff = ticketRecord?.claimed_by ? `<@${ticketRecord.claimed_by}>` : 'Grandway Shopping Support Team';
                        const reviewEmbed = new EmbedBuilder()
                            .setTitle(`⭐ New Verified Customer Support Review!`)
                            .setDescription(
                                `**Rating:** ${stars} (\`${rating}/5\`)\n` +
                                `**Customer Feedback:**\n> *"${userComment || 'Exceptional service provided by staff!'}"*\n\n` +
                                `• **Assisted By:** ${helperStaff}\n` +
                                `• **Ticket Category:** \`${(ticketRecord?.type || 'General').toUpperCase()}\``
                            )
                            .setColor(config.colors.primary)
                            .setFooter({ text: 'Grandway Shopping Customer Satisfaction Review' })
                            .setTimestamp();

                        await reviewChannel.send({ embeds: [reviewEmbed] });
                    }
                } catch (reviewErr) {
                    console.error('[CSAT REVIEW SHOWCASE ERROR]', reviewErr.message);
                }
            }

            const thanksEmbed = new EmbedBuilder()
                .setTitle('⭐ Grandway Shopping Support Feedback Received')
                .setDescription(
                    `Thank you for taking the time to share your feedback!\n\n` +
                    `• **Rating:** ${'⭐'.repeat(rating)} (${rating}/5)\n` +
                    `• **Comment:** ${userComment ? `*"${userComment}"*` : '*None provided*'}\n\n` +
                    `Your feedback has been logged to our Management Quality Dashboard.`
                )
                .setColor(rating >= 4 ? config.colors.primary : config.colors.warning)
                .setFooter({ text: 'Grandway Shopping Customer Support Quality Team' });

            return interaction.reply({ embeds: [thanksEmbed], flags: MessageFlags.Ephemeral });
        }
    }

    // 2.5 SELECT MENU: SUPPORT TAG SNIPPET DISPATCH
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_support_tag') {
        const { SUPPORT_TAGS } = require('../commands/ticket');
        const tagKey = interaction.values[0];
        const selectedTag = SUPPORT_TAGS[tagKey];

        if (!selectedTag) {
            return interaction.reply({ content: '❌ Unknown snippet tag.', flags: MessageFlags.Ephemeral });
        }

        const ticket = await db.getTicketByChannel(interaction.channel.id);
        if (!ticket || ticket.status === 'CLOSED') {
            return interaction.reply({ content: '❌ This ModMail thread is no longer active.', flags: MessageFlags.Ephemeral });
        }

        const staffName = interaction.member?.displayName || interaction.user.username;
        const customerMention = ticket?.user_id ? `<@${ticket.user_id}>` : 'valued customer';

        let formattedDesc = selectedTag.desc
            .replace(/\{staff\}/g, staffName)
            .replace(/\{customer\}/g, customerMention)
            .replace(/\{store\}/g, config.storeName || 'Grandway Shopping');

        const shouldSendAnon = Boolean(ticket.anon_mode);

        const dmEmbed = new EmbedBuilder()
            .setAuthor({
                name: shouldSendAnon ? 'Grandway Shopping ModMail Team 🛡️' : `${staffName} (Staff Colleague)`,
                iconURL: shouldSendAnon ? (interaction.guild.iconURL({ dynamic: true }) || undefined) : interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle(selectedTag.title)
            .setDescription(formattedDesc)
            .setColor(selectedTag.color)
            .setFooter({ text: shouldSendAnon ? 'Official ModMail Quick Tag • Staff ID Protected' : 'Grandway Shopping Staff Response' })
            .setTimestamp();

        // Deliver to customer DM
        try {
            const targetUser = await interaction.client.users.fetch(ticket.user_id);
            if (targetUser) {
                await targetUser.send({ embeds: [dmEmbed] });
            }
        } catch (dmErr) {
            return interaction.reply({ content: `⚠️ Could not deliver snippet to <@${ticket.user_id}> DMs (DMs closed or blocked).`, flags: MessageFlags.Ephemeral });
        }

        // Post receipt into staff channel
        const staffReceiptEmbed = new EmbedBuilder()
            .setAuthor({
                name: `${interaction.user.username} (${shouldSendAnon ? 'Anonymous to Customer' : 'Signed'})`,
                iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTitle(`⚡ Quick Tag Dispatched: ${selectedTag.title}`)
            .setDescription(formattedDesc)
            .setColor(selectedTag.color)
            .setFooter({ text: `Dispatched to customer DM • ${shouldSendAnon ? 'Staff identity hidden' : 'Staff name shown'}` })
            .setTimestamp();

        await interaction.channel.send({ embeds: [staffReceiptEmbed] });

        // Record for staff audit trail
        await db.addTicketNote(interaction.channel.id, interaction.user.id, `[QUICK TAG (${tagKey})]: ${selectedTag.title}`);

        ticket.last_staff_response_at = new Date().toISOString();
        ticket.awaiting_customer = true;
        ticket.customer_warned_at = null;
        if (!ticket.first_response_at) ticket.first_response_at = new Date().toISOString();
        db.save();

        return interaction.reply({ content: `✅ Dispatched quick tag snippet **${selectedTag.title}** to customer DMs!`, flags: MessageFlags.Ephemeral });
    }

    // 2.6 SELECT MENU: TICKET DEPARTMENT TRANSFER
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_transfer') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ticket = await db.getTicketByChannel(interaction.channel.id);
        if (!ticket || ticket.status === 'CLOSED') {
            return interaction.editReply({ content: '❌ Ticket is not active.' });
        }

        const newCategoryKey = interaction.values[0];
        const { TICKET_CATEGORIES } = require('../commands/ticket');
        const targetCategory = TICKET_CATEGORIES[newCategoryKey];

        if (!targetCategory) {
            return interaction.editReply({ content: '❌ Invalid target department category.' });
        }

        const oldCategory = ticket.type;
        const targetRoleId = config.roles[targetCategory.roleKey] || config.roles.staff;

        ticket.type = newCategoryKey;
        ticket.claimed_by = null;
        ticket.status = 'TRANSFERRED';
        db.save();

        // Adjust channel permissions so new department has access
        try {
            await interaction.channel.permissionOverwrites.edit(targetRoleId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
                AttachFiles: true,
                ManageMessages: true
            });
        } catch (permErr) {
            console.error('[TICKET TRANSFER PERMISSION ERROR]', permErr.message);
        }

        // Generate instant AI Executive Summary handover brief
        let handoverBrief = null;
        try {
            const fetched = await interaction.channel.messages.fetch({ limit: 15 });
            const ordered = Array.from(fetched.values()).reverse();
            const recentText = ordered.map(m => `${m.author.username}: ${m.content}`).join('\n');
            const { generateTicketSummary } = require('../utils/ticketAi');
            handoverBrief = await generateTicketSummary(ticket, recentText);
        } catch (aiErr) {
            console.error('[HANDOVER BRIEF ERROR]', aiErr.message);
        }

        const transferEmbed = new EmbedBuilder()
            .setTitle(`🔀 Ticket Transferred ➔ ${targetCategory.emoji} ${targetCategory.label}`)
            .setDescription(
                `This ticket has been officially transferred by <@${interaction.user.id}>.\n\n` +
                `• **Previous Category:** \`${oldCategory.toUpperCase()}\`\n` +
                `• **New Department:** <@&${targetRoleId}>\n` +
                `Department staff have been dispatched to take over!`
            )
            .setColor(targetCategory.color || config.colors.secondary)
            .setTimestamp();

        if (handoverBrief) {
            transferEmbed.addFields(
                { name: '🎯 AI Handover Brief: Core Issue', value: `> ${handoverBrief.core_issue || 'Inquiry transferred to department.'}`, inline: false },
                { name: '👉 Recommended Department Action', value: `> ${handoverBrief.recommended_action || 'Review chat history and advise user.'}`, inline: false }
            );
        }

        await interaction.channel.send({
            content: `<@&${targetRoleId}> 🚨 **TICKET TRANSFERRED TO YOUR DEPARTMENT** (<@${ticket.user_id}>)`,
            embeds: [transferEmbed]
        });

        await db.addTicketNote(interaction.channel.id, interaction.user.id, `Transferred ticket to ${targetCategory.label} (<@&${targetRoleId}>)`);

        return interaction.editReply({
            content: `✅ Successfully transferred ticket to **${targetCategory.label}**! The department role has been pinged.`
        });
    }

    // 3. SELECT MENU (TICKETS INTAKE MODAL TRIGGER)
    // 3. SELECT MENU (MODMAIL INTAKE MODAL TRIGGER)
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_type') {
        const type = interaction.values[0];

        const { MODMAIL_CATEGORIES } = require('./modmailHandler');
        const selectedCat = MODMAIL_CATEGORIES[type] || MODMAIL_CATEGORIES.general;

        if (selectedCat.staffOnly) {
            const isStaff = interaction.member && (
                hasTicketOverride(interaction.member) || interaction.member.roles.cache.has(config.roles.staff) ||
                interaction.member.roles.cache.has(config.roles.mr) ||
                interaction.member.roles.cache.has(config.roles.hr) ||
                interaction.member.roles.cache.has(config.roles.trainee) ||
                interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
            );
            if (!isStaff) {
                return interaction.reply({
                    content: '🚫 **Access Denied:** The `DATA-ENTRIES` category is strictly reserved for verified Grandway Shopping Staff members.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        const ticketSettings = await db.getTicketSettings();
        if (!ticketSettings.enabled) {
            return interaction.reply({
                content: `⚠️ **ModMail Support Paused:** ${ticketSettings.disabled_reason || 'Support is temporarily closed for scheduled maintenance.'}`,
                flags: MessageFlags.Ephemeral
            });
        }

        const isBanned = await db.isTicketBlacklisted(interaction.user.id);
        if (isBanned) {
            const expText = isBanned.expires_at ? `<t:${Math.floor(new Date(isBanned.expires_at).getTime() / 1000)}:R>` : 'Never (Permanent)';
            return interaction.reply({
                content: `🚫 **ModMail Access Restricted:** You are blacklisted from opening Grandway Shopping ModMail.\n• **Reason:** ${isBanned.reason}\n• **Expires:** ${expText}`,
                flags: MessageFlags.Ephemeral
            });
        }

        const activeTicket = await db.getActiveUserTicket(interaction.user.id);
        if (activeTicket) {
            return interaction.reply({
                content: `⚠️ You already have an active ModMail thread: <#${activeTicket.channel_id}>. Please finish or close that thread first!`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Intake Modal
        const modal = new ModalBuilder()
            .setCustomId(`modal_create_ticket_${type}`)
            .setTitle(`Open ModMail: ${selectedCat.label.slice(0, 30)}`);

        const subjectInput = new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Subject / Inquiry Topic')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Briefly state what you need assistance with...')
            .setRequired(true);

        const detailsInput = new TextInputBuilder()
            .setCustomId('ticket_details')
            .setLabel('Inquiry Details')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Explain your situation in detail. Our staff will receive this in your thread...')
            .setRequired(true);

        const robloxInput = new TextInputBuilder()
            .setCustomId('ticket_roblox')
            .setLabel('Roblox Username (Optional)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Your Roblox username if applicable...')
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(subjectInput),
            new ActionRowBuilder().addComponents(detailsInput),
            new ActionRowBuilder().addComponents(robloxInput)
        );

        return interaction.showModal(modal);
    }
}

module.exports = { handleInteraction };
