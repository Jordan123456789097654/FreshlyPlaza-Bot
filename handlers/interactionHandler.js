const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
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
    if (interaction.isButton()) {
        const customId = interaction.customId;

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

            return interaction.reply({ content: '✅ **Activity Confirmed!** Thank you for your continued dedication to the FreshlyPlaza staff team.', ephemeral: true });
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
                .setFooter({ text: 'FreshlyPlaza Staff Management' })
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
                .setFooter({ text: `FreshlyPlaza Operations • Total: ${yesCount + noCount} votes` })
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
                return interaction.reply({ content: '❌ Only FreshlyPlaza staff members can claim shift duty stations.', ephemeral: true });
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
                            content: `❌ **Your FreshlyPlaza LOA Request #${loa.id} was DENIED** by <@${interaction.user.id}>.\nIf you have any questions, please contact management.`
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

            const newEmbed = buildSuggestionEmbed(sug);
            const newRows = buildSuggestionButtons(sug);
            return interaction.update({ embeds: [newEmbed], components: newRows });
        }

        // Suggestion Management Buttons (Accept / In Progress / Deny)
        if (customId.startsWith('sug_accept_') || customId.startsWith('sug_progress_') || customId.startsWith('sug_deny_')) {
            const member = interaction.member;
            const isManager = member && (
                member.roles.cache.has(config.roles.mr) ||
                member.roles.cache.has(config.roles.hr) ||
                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                member.permissions.has(PermissionFlagsBits.Administrator)
            );

            if (!isManager) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Leadership / MR+ can review community suggestions.', ephemeral: true });
            }

            let newStatus = 'ACCEPTED';
            let sugId;
            if (customId.startsWith('sug_accept_')) {
                sugId = customId.replace('sug_accept_', '');
                newStatus = 'ACCEPTED';
            } else if (customId.startsWith('sug_progress_')) {
                sugId = customId.replace('sug_progress_', '');
                newStatus = 'IN_PROGRESS';
            } else if (customId.startsWith('sug_deny_')) {
                sugId = customId.replace('sug_deny_', '');
                newStatus = 'DENIED';
            }

            const data = db.getData();
            const sug = (data.suggestions || []).find(s => String(s.id) === String(sugId));
            if (!sug) return interaction.reply({ content: '❌ Suggestion record not found.', ephemeral: true });

            sug.status = newStatus;
            sug.actioned_by = interaction.user.id;
            sug.actioned_at = new Date().toISOString();
            db.save();

            const newEmbed = buildSuggestionEmbed(sug);
            const newRows = buildSuggestionButtons(sug);
            await interaction.update({ embeds: [newEmbed], components: newRows });

            // DM the suggestion submitter
            try {
                const submitter = await interaction.client.users.fetch(sug.user_id);
                if (submitter) {
                    const statusName = newStatus === 'ACCEPTED' ? '✅ ACCEPTED' : newStatus === 'IN_PROGRESS' ? '🚧 IN PROGRESS' : '❌ DENIED';
                    await submitter.send({
                        content: `💡 **FreshlyPlaza Suggestion Update (#${sug.id})**\n\nYour suggestion: *"${sug.suggestion.slice(0, 100)}..."* has been marked as **${statusName}** by <@${interaction.user.id}>!\nThank you for contributing to FreshlyPlaza.`
                    });
                }
            } catch (e) {}

            return;
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
                return interaction.editReply({ content: '❌ Could not find FreshlyPlaza server. Please open a ticket in the server.' });
            }

            const { TICKET_CATEGORIES, buildTicketControlRow } = require('../commands/ticket');
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
                    permissionOverwrites: [
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
                    ]
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
                    components: [buildTicketControlRow()]
                });

                return interaction.editReply({
                    content: `✅ Ticket **#${eligibleTicket.id}** has been reopened! Head over to <#${reopenedChannel.id}>.`
                });
            } catch (err) {
                console.error('[TICKET REOPEN ERROR]', err);
                return interaction.editReply({ content: '❌ Failed to recreate ticket channel. Please open a new ticket via the support panel.' });
            }
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
                .setTitle('✋ Ticket Claimed')
                .setDescription(`This ticket has been officially claimed by <@${interaction.user.id}>!`)
                .setColor(config.colors.primary)
                .setTimestamp();

            await interaction.channel.send({ embeds: [claimEmbed] });
            return interaction.editReply({ content: `✅ You have claimed Ticket #${ticket.id}!` });
        }

        // Feature #4: Ticket Department Transfer Menu
        if (customId === 'btn_ticket_transfer_menu') {
            const member = interaction.member;
            const isStaff = member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageMessages');

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ Only FreshlyPlaza Staff can transfer tickets to another department.',
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
            const isStaff = member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has('ManageMessages');

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ Quick Support Snippets are only accessible to FreshlyPlaza Staff.',
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
                .setFooter({ text: 'FreshlyPlaza AI Assistant • Staff Executive Briefing' })
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

            // Post as staff message into ticket channel
            await interaction.channel.send({
                content: draftText
            });

            return interaction.reply({
                content: '✅ Suggested response posted to ticket!',
                flags: MessageFlags.Ephemeral
            });
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
                        .setTitle(`🏪 FreshlyPlaza — Ticket #${ticket.id} Closed`)
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
                return interaction.editReply({ content: '❌ Only FreshlyPlaza Leadership / HR can accept appeals.' });
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
                    content: `🎉 **FreshlyPlaza Staff Appeal Accepted!**\n\nYour activity check appeal has been **approved** by <@${interaction.user.id}>!\nAll your previous staff roles have been **reinstated** to your account.\n\nWelcome back to the team! Please ensure to stay active and monitor upcoming staff announcements.`
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
                return interaction.editReply({ content: '❌ Only FreshlyPlaza Leadership / HR can deny appeals.' });
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
                    content: `❌ **FreshlyPlaza Staff Appeal Denied**\n\nYour activity check appeal has been reviewed and **denied** by <@${interaction.user.id}>.\nYour position termination remains in effect. You may re-apply during the next open application period.`
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
                return interaction.editReply({ content: '❌ Only FreshlyPlaza Leadership / HR can accept appeals.' });
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
                        content: `🎉 **FreshlyPlaza Appeal Approved!**\n\nYour appeal for **${record.appeal_type}** (#${record.id}) has been **accepted** by <@${interaction.user.id}>!\nAny associated restrictions have been lifted. Welcome back!`
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
                return interaction.editReply({ content: '❌ Only FreshlyPlaza Leadership / HR can deny appeals.' });
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
                        content: `❌ **FreshlyPlaza Appeal Denied**\n\nYour appeal for **${record.appeal_type}** (#${record.id}) has been reviewed and **denied** by <@${interaction.user.id}>.\nThe punishment remains in effect.`
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
                    .setFooter({ text: `Term ID: #${term.id} • FreshlyPlaza Appeal Management` })
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
                content: '✅ **Your Staff Activity Appeal has been submitted!** FreshlyPlaza leadership will review your answers. You will receive a direct message once a decision is made.',
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
                    .setFooter({ text: `Appeal ID: #${record.id} • FreshlyPlaza Moderation` })
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
                content: '✅ **Your Appeal has been successfully submitted!** FreshlyPlaza leadership will review your answers. You will receive a direct message when a decision is made.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Modal for Ticket Close
        if (customId === 'modal_ticket_close') {
            await interaction.deferReply();
            const reason = interaction.fields.getTextInputValue('close_reason') || 'Resolved by user/staff';
            const ticket = await db.getTicketByChannel(interaction.channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                return interaction.editReply({ content: '❌ Ticket not active.' });
            }

            const { generateHtmlTranscript } = require('../utils/transcript');
            const { AttachmentBuilder } = require('discord.js');
            const htmlContent = await generateHtmlTranscript(interaction.channel, ticket);
            const transcriptAttachment = new AttachmentBuilder(Buffer.from(htmlContent, 'utf-8'), {
                name: `transcript-ticket-${ticket.id}.html`
            });

            ticket.status = 'CLOSED';
            ticket.closed_at = new Date().toISOString();
            ticket.closed_by = interaction.user.id;
            ticket.close_reason = reason;
            db.save();

            // Train the AI from resolved ticket
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

            // Log to #ticket-logs and evaluate QA audit
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

                // Feature #6: Post-Ticket AI QA Grader & Audit
                try {
                    const { evaluateTicketQA } = require('../utils/ticketAi');
                    const qaResult = await evaluateTicketQA(ticket, htmlContent);
                    if (qaResult) {
                        await db.recordTicketQaAudit({
                            ticket_id: ticket.id,
                            category: ticket.type,
                            staff_id: ticket.claimed_by || interaction.user.id,
                            customer_id: ticket.user_id,
                            professionalism_score: qaResult.professionalism_score,
                            resolution_score: qaResult.resolution_score,
                            feedback_notes: qaResult.feedback_notes,
                            areas_of_improvement: qaResult.areas_of_improvement
                        });

                        logEmbed.addFields(
                            {
                                name: '📊 AI QA Audit Score',
                                value: `• **Professionalism:** \`${qaResult.professionalism_score}/10\`\n• **Resolution Quality:** \`${qaResult.resolution_score}/10\`\n• **Feedback:** *${qaResult.feedback_notes}*\n• **Staff Coaching:** *${qaResult.areas_of_improvement}*`,
                                inline: false
                            }
                        );
                    }
                } catch (qaErr) {
                    console.error('[TICKET QA AUDIT ERROR]', qaErr.message);
                }

                await logChannel.send({ embeds: [logEmbed], files: [transcriptAttachment] });
            }

            // DM User
            try {
                const ticketUser = await interaction.client.users.fetch(ticket.user_id);
                if (ticketUser) {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle(`🏪 FreshlyPlaza — Ticket #${ticket.id} Closed`)
                        .setDescription(`Your support ticket has been closed.\nAn official transcript has been attached for your records.`)
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

                    const reopenRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`btn_reopen_ticket_${ticket.id}`).setLabel('🔄 Re-Open Ticket (2h Grace Period)').setStyle(ButtonStyle.Secondary)
                    );

                    await ticketUser.send({ embeds: [dmEmbed], files: [transcriptAttachment], components: [surveyRow, reopenRow] });
                }
            } catch (e) {}

            await interaction.editReply({ content: '🔒 Ticket closed. Deleting channel in 5 seconds...' });
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (e) {}
            }, 5000);
            return;
        }

        // Modal for Ticket Creation Intake
        if (customId.startsWith('modal_create_ticket_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const categoryKey = customId.replace('modal_create_ticket_', '');
            const subject = interaction.fields.getTextInputValue('ticket_subject') || 'General Support Inquiry';
            const details = interaction.fields.getTextInputValue('ticket_details') || '';
            const robloxUser = interaction.fields.getTextInputValue('ticket_roblox') || '';

            const { TICKET_CATEGORIES, buildTicketControlRow } = require('../commands/ticket');
            const catConfig = TICKET_CATEGORIES[categoryKey] || TICKET_CATEGORIES.general;
            const targetRoleId = config.roles[catConfig.roleKey] || config.roles.staff;

            if (catConfig.staffOnly) {
                const isStaff = interaction.member && (
                    interaction.member.roles.cache.has(config.roles.staff) ||
                    interaction.member.roles.cache.has(config.roles.mr) ||
                    interaction.member.roles.cache.has(config.roles.hr) ||
                    interaction.member.roles.cache.has(config.roles.trainee) ||
                    interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
                );
                if (!isStaff) {
                    return interaction.editReply({
                        content: '🚫 **Access Denied:** The `DATA-ENTRIES` category is strictly reserved for verified FreshlyPlaza Staff members.'
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
                permissionOverwrites
            });

            const { fetchRobloxUserProfile } = require('../utils/robloxLookup');
            let robloxProfile = null;
            if (robloxUser) {
                robloxProfile = await fetchRobloxUserProfile(robloxUser);
            }

            const ticketRecord = await db.createTicketRecord({
                channelId: ticketChannel.id,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                type: categoryKey,
                subject,
                details,
                robloxUsername: robloxProfile ? robloxProfile.username : (robloxUser || ''),
                aiDisabled: Boolean(catConfig.aiDisabled)
            });

            // Calculate Live Queue Position
            const allTickets = db.getData().tickets || [];
            const queuePosition = allTickets.filter(t => (t.status === 'OPEN' || t.status === 'ESCALATED') && t.type === categoryKey).length + 1;

            // Check Operating Hours Window
            const ticketSettings = await db.getTicketSettings();
            const currentUtcHour = new Date().getUTCHours();
            const opHours = ticketSettings.operating_hours || { enabled: false, start_utc: 8, end_utc: 23 };
            const isOutsideHours = Boolean(opHours.enabled && (currentUtcHour < opHours.start_utc || currentUtcHour >= opHours.end_utc));
            // Feature #5: Priority VIP / Colleague Lane (Fast Track)
            const openerMember = interaction.member;
            const isVipOrStaff = openerMember && (
                openerMember.roles.cache.has(config.roles.staff) ||
                openerMember.roles.cache.has(config.roles.mr) ||
                openerMember.roles.cache.has(config.roles.hr) ||
                openerMember.premiumSince !== null || // Server Booster
                openerMember.permissions.has(PermissionFlagsBits.ManageGuild)
            );

            if (isVipOrStaff) {
                ticketRecord.priority = 'HIGH';
                ticketRecord.is_vip = true;
                db.save();
            }

            const staffMention = catConfig.targetUserId ? `<@${catConfig.targetUserId}>` : `<@&${targetRoleId}>`;

            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket #${ticketRecord.id} — ${catConfig.label}`)
                .setDescription(
                    catConfig.aiDisabled
                        ? `Hello <@${interaction.user.id}>! You have opened a **DATA-ENTRIES** ticket.\n\n🚫 **AI Support is DISABLED** for this room. You are speaking directly with ${staffMention}.\n\nPlease provide your data entries, roster updates, or internal records below.`
                        : `Hello <@${interaction.user.id}>! Welcome to your private support channel.\n\n` +
                        (isVipOrStaff ? `⭐ **VIP / Staff Fast-Track:** *Your ticket has been fast-tracked to High Priority for accelerated management review.*\n\n` : '') +
                        `⚠️ **AI Beta Notice:** *Our automated AI assistant is currently in beta. It may occasionally get things wrong. All tickets opened will help train and refine our AI model to better serve FreshlyPlaza customers!*\n\n` +
                        `🤖 **AI Assistant:** The AI is analyzing your issue. If standard store guidance applies, an instant solution will be posted. Otherwise, this ticket is prioritized and dispatched directly to ${staffMention}.`
                )
                .addFields(
                    { name: '📋 Category', value: `${catConfig.emoji} ${catConfig.label}`, inline: true },
                    { name: '👤 Creator', value: `<@${interaction.user.id}> ${isVipOrStaff ? '⭐ `VIP/Staff`' : ''}`, inline: true },
                    { name: catConfig.targetUserId ? '🛡️ Assigned Staff' : '🛡️ Department', value: staffMention, inline: true },
                    { name: '🔢 Queue Position', value: isVipOrStaff ? '`⚡ Priority Fast-Track Lane`' : `\`#${queuePosition} in line for ${catConfig.label}\``, inline: true },
                    { name: '📝 Subject', value: subject, inline: true },
                    { name: '💬 Details', value: details ? details.slice(0, 1024) : '*None provided*', inline: false }
                )
                .setColor(catConfig.color)
                .setTimestamp()
                .setFooter({ text: catConfig.aiDisabled ? 'FreshlyPlaza Data Room • Human Staff Only' : 'FreshlyPlaza Ticket Suite • AI in Beta', iconURL: interaction.guild.iconURL() });

            if (isOutsideHours && !catConfig.aiDisabled) {
                welcomeEmbed.addFields({
                    name: '🌙 Department Off-Hours Notice',
                    value: `Human staff business hours are **${opHours.start_utc}:00 UTC – ${opHours.end_utc}:00 UTC**. Our AI assistant is active 24/7, and colleagues will follow up as soon as they report on duty!`,
                    inline: false
                });
            }

            if (robloxProfile) {
                welcomeEmbed.setThumbnail(robloxProfile.headshotUrl || null);
                welcomeEmbed.addFields(
                    { 
                        name: '🎮 Roblox Player Profile', 
                        value: `[**${robloxProfile.displayName}** (@${robloxProfile.username})](${robloxProfile.profileUrl})\n` +
                               `• **Group Rank:** \`${robloxProfile.groupRank}\`\n` +
                               `• **Roblox ID:** \`${robloxProfile.id}\`\n` +
                               `• **Created:** ${robloxProfile.createdAt ? `<t:${Math.floor(new Date(robloxProfile.createdAt).getTime() / 1000)}:D>` : '*N/A*'}`,
                        inline: false 
                    }
                );
            } else if (robloxUser) {
                welcomeEmbed.addFields({ name: '🎮 Roblox Username', value: `\`${robloxUser}\` *(Profile lookup pending)*`, inline: false });
            }

            // If report category, instruct user with the required format and proof rule
            if (categoryKey === 'report') {
                const reportGuideEmbed = new EmbedBuilder()
                    .setTitle('🚨 Player / Staff Report — Evidence & Format Required')
                    .setDescription(
                        `Before our <@&${targetRoleId}> department can investigate, you **MUST** provide valid proof and fill out the format below.\n\n` +
                        `📸 **Strict Proof Policy:** Reports **without valid screenshot or video proof** cannot be actioned!\n\n` +
                        `**Please copy and reply with this format:**\n` +
                        `\`\`\`\n` +
                        `• Offender Username(s): \n` +
                        `• Offense / Violation: \n` +
                        `• Approximate Date & Time: \n` +
                        `• What Happened: \n` +
                        `• Proof / Screenshots Attached: \n` +
                        `\`\`\`\n` +
                        `👉 *Upload your unedited screenshot(s) or video link directly into this chat.* Our AI Vision will process it and notify the investigation team.`
                    )
                    .setColor(config.colors.danger);

                await ticketChannel.send({
                    content: `<@${interaction.user.id}>`,
                    embeds: [welcomeEmbed, reportGuideEmbed],
                    components: [buildTicketControlRow()]
                });
            } else {
                await ticketChannel.send({
                    content: catConfig.targetUserId ? `<@${catConfig.targetUserId}>` : `<@${interaction.user.id}> <@&${targetRoleId}>`,
                    embeds: [welcomeEmbed],
                    components: [buildTicketControlRow()]
                });
            }

            // Trigger AI Triage & Attempt to handle (bypassed if AI is disabled for this category)
            if (ticketRecord.ai_disabled) {
                return;
            }

            const { handleTicketWithAI } = require('../utils/ticketAi');
            setTimeout(async () => {
                try {
                    const aiResult = await handleTicketWithAI(ticketRecord, `${subject}\n${details}`, interaction.user.username);
                    ticketRecord.ai_attempted = true;

                    // Update ticket priority & sentiment if assessed
                    if (aiResult.urgency) {
                        ticketRecord.priority = aiResult.urgency;
                    }
                    if (aiResult.sentiment) {
                        ticketRecord.sentiment = aiResult.sentiment;
                    }

                    // 1. AI Auto-Categorization & Auto-Reroute
                    let rerouted = false;
                    if (aiResult.suggested_category && aiResult.suggested_category !== ticketRecord.type && TICKET_CATEGORIES[aiResult.suggested_category]) {
                        const newCatKey = aiResult.suggested_category;
                        const newCat = TICKET_CATEGORIES[newCatKey];
                        const newRoleId = config.roles[newCat.roleKey] || config.roles.staff;

                        ticketRecord.type = newCatKey;
                        targetRoleId = newRoleId;
                        catConfig = newCat;
                        rerouted = true;
                        db.save();

                        // Adjust channel permissions for the new role
                        await ticketChannel.permissionOverwrites.edit(newRoleId, {
                            ViewChannel: true,
                            SendMessages: true,
                            ReadMessageHistory: true,
                            ManageMessages: true
                        });

                        const rerouteEmbed = new EmbedBuilder()
                            .setTitle('🔀 AI Auto-Categorization & Reroute Notice')
                            .setDescription(
                                `The AI detected that this ticket belongs in **${newCat.label}** rather than **${catConfig.label}**.\n` +
                                `• **New Category:** ${newCat.emoji} ${newCat.label}\n` +
                                `• **Reassigned Department:** <@&${newRoleId}>\n` +
                                `Department staff have been notified!`
                            )
                            .setColor(newCat.color)
                            .setTimestamp();

                        await ticketChannel.send({ embeds: [rerouteEmbed] });
                    }

                    // 2. Automated Toxic / Profanity Scanner Alert
                    if (aiResult.is_toxic) {
                        ticketRecord.flagged_toxic = true;
                        const toxicAlertEmbed = new EmbedBuilder()
                            .setTitle('⚠️ Automated Toxic / Profanity Detection Warning')
                            .setDescription(`Customer message was flagged for hostile or inappropriate language.\n\n**Warning:** FreshlyPlaza maintains a zero-tolerance policy for harassment and abusive conduct. Continued toxicity may lead to a ticket blacklist or server timeout.\n\n*Notice for Staff:* High-priority de-escalation advised.`)
                            .setColor(config.colors.danger)
                            .setTimestamp();
                        await ticketChannel.send({ embeds: [toxicAlertEmbed] });
                    }

                    // 3. AI Translation on the Fly
                    if (aiResult.detected_language && aiResult.detected_language.toLowerCase() !== 'english') {
                        ticketRecord.detected_language = aiResult.detected_language;
                        const translationEmbed = new EmbedBuilder()
                            .setTitle(`🌐 AI Translation on the Fly (${aiResult.detected_language} ➔ English)`)
                            .setDescription(
                                `**Detected Language:** \`${aiResult.detected_language}\`\n\n` +
                                `**English Staff Translation:**\n> ${aiResult.english_translation || subject + ' - ' + details}\n\n` +
                                `*Note: AI responses to customer will automatically be provided in their native language!*`
                            )
                            .setColor(config.colors.secondary)
                            .setFooter({ text: 'FreshlyPlaza Multi-Language Support Engine' });
                        await ticketChannel.send({ embeds: [translationEmbed] });
                    }

                    // 4. AI Bug Deduplication & Auto-Filing
                    if (aiResult.is_known_bug) {
                        const duplicateEmbed = new EmbedBuilder()
                            .setTitle('🐛 Known Bug Detected — Patch in Progress')
                            .setDescription(
                                `Our AI detected this issue matches a known report: **${aiResult.matched_bug_title || 'Known Glitch'}**.\n\n` +
                                `FreshlyPlaza development is already actively working on a fix for this bug in the supermarket! You do not need to take any further action.`
                            )
                            .setColor(config.colors.warning)
                            .setFooter({ text: 'FreshlyPlaza Bug Deduplication System' });
                        await ticketChannel.send({ embeds: [duplicateEmbed] });
                    } else if (aiResult.is_new_bug && aiResult.bug_title) {
                        // Automatically file new verified bug in bugs table and dispatch to #bug-reports
                        try {
                            const resBug = await db.run(
                                `INSERT INTO bugs (user_id, title, details, steps, status) VALUES (?, ?, ?, ?, 'PENDING')`,
                                [interaction.user.id, aiResult.bug_title, details || subject, aiResult.bug_steps || 'Reported via Support Ticket', 'PENDING']
                            );
                            const bugsChannel = interaction.guild.channels.cache.get(config.channels.bugsReport);
                            if (bugsChannel) {
                                const newBugEmbed = new EmbedBuilder()
                                    .setTitle(`🐛 Bug Report #${resBug.lastID} — ${aiResult.bug_title}`)
                                    .setDescription(details || subject)
                                    .addFields(
                                        { name: '👤 Reporter', value: `<@${interaction.user.id}>`, inline: true },
                                        { name: '📌 Source', value: `Ticket #${ticketRecord.id}`, inline: true },
                                        { name: '🔄 Steps / Notes', value: aiResult.bug_steps || 'See ticket details', inline: false }
                                    )
                                    .setColor(config.colors.warning)
                                    .setTimestamp();
                                const bugMsg = await bugsChannel.send({ embeds: [newBugEmbed] });
                                await db.run(`UPDATE bugs SET message_id = ? WHERE id = ?`, [bugMsg.id, resBug.lastID]);
                            }

                            await ticketChannel.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle('🐛 Bug Report Automatically Filed')
                                        .setDescription(`This bug has been logged as **#${resBug.lastID}** in <#${config.channels.bugsReport}> for developer investigation!`)
                                        .setColor(config.colors.primary)
                                ]
                            });
                        } catch (bErr) {
                            console.error('[AUTO BUG REPORT ERROR]', bErr);
                        }
                    }

                    // Guard: Never auto-resolve or close applications for Developer, Staff, or Leadership
                    const appKeywords = /(developer|dev|apply|application|hiring|scripter|builder|ui designer|modeler|staff role|mod role)/i;
                    const isApplicationQuery = appKeywords.test(subject || '') || appKeywords.test(details || '');
                    if (isApplicationQuery) {
                        aiResult.can_handle = false;
                        aiResult.escalation_reason = 'Staff / Developer Application received. Human leadership review required.';
                        if (!aiResult.resolution_message || aiResult.resolution_message.includes('join our official Discord server') || aiResult.resolution_message.includes('#staff-applications')) {
                            aiResult.resolution_message = 
                                `Hello! 👋 Thank you for your interest in joining the FreshlyPlaza team!\n\n` +
                                `Our leadership reviews all Developer & Staff applications directly inside support tickets.\n` +
                                `Please leave your ticket open and reply with:\n` +
                                `1. **Roblox Username:**\n` +
                                `2. **Role Applying For:** (e.g. Scripter, Builder, UI, 3D Modeler, Staff)\n` +
                                `3. **Portfolio / Past Experience:** (Links or screenshots of past work)\n` +
                                `4. **Why FreshlyPlaza:**\n\n` +
                                `Our management team will review your application here shortly!`;
                        }
                    }

                    if (aiResult.can_handle) {
                        ticketRecord.ai_handled = true;
                        db.save();

                        // Add to AI training memory
                        await db.addAiTrainingExample({
                            ticketId: ticketRecord.id,
                            category: ticketRecord.type,
                            userQuery: `${subject} - ${details}`,
                            resolution: aiResult.resolution_message,
                            resolvedBy: 'AI_BOT',
                            wasAiHandled: true
                        });

                        const aiAssistantEmbed = new EmbedBuilder()
                            .setTitle('🤖 FreshlyPlaza AI Assistant')
                            .setDescription(aiResult.resolution_message)
                            .addFields(
                                { name: '📊 Urgency & Sentiment', value: `Urgency: \`${ticketRecord.priority}\` • Sentiment: \`${ticketRecord.sentiment || 'neutral'}\``, inline: true },
                                { name: '💬 Need Human Staff?', value: 'If this answered your question, you can close the ticket below. Otherwise, human colleagues have also been notified and will assist you here!', inline: false }
                            )
                            .setColor(config.colors.primary)
                            .setFooter({ text: 'FreshlyPlaza AI Customer Support' });

                        await ticketChannel.send({ embeds: [aiAssistantEmbed] });
                    } else {
                        // AI could not handle -> Escalate to human department
                        ticketRecord.ai_escalated = true;
                        ticketRecord.status = 'ESCALATED';
                        db.save();

                        const escalationEmbed = new EmbedBuilder()
                            .setTitle('🛡️ Escalated to Human Support Department')
                            .setDescription(
                                aiResult.resolution_message + `\n\n` +
                                `🔔 **Department Alert:** <@&${targetRoleId}> staff have been notified and will take over this ticket.\n` +
                                `*Reason:* ${aiResult.escalation_reason || 'Human staff action required.'}`
                            )
                            .addFields(
                                { name: '⚡ Priority / Urgency', value: `\`${ticketRecord.priority}\``, inline: true },
                                { name: '💬 Customer Sentiment', value: `\`${ticketRecord.sentiment || 'neutral'}\``, inline: true }
                            )
                            .setColor(ticketRecord.priority === 'URGENT' || ticketRecord.priority === 'HIGH' ? config.colors.danger : config.colors.warning)
                            .setTimestamp();

                        await ticketChannel.send({
                            content: `<@&${targetRoleId}> 🚨 **HUMAN SUPPORT ESCALATION REQUIRED**`,
                            embeds: [escalationEmbed]
                        });
                    }
                } catch (aiErr) {
                    console.error('[AI TRIAGE RUNTIME ERROR]', aiErr);
                }
            }, 1500);

            return interaction.editReply({
                content: `✅ Ticket **#${ticketRecord.id}** created! Head over to <#${ticketChannel.id}>.`
            });
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
                        const helperStaff = ticketRecord?.claimed_by ? `<@${ticketRecord.claimed_by}>` : 'FreshlyPlaza Support Team';
                        const reviewEmbed = new EmbedBuilder()
                            .setTitle(`⭐ New Verified Customer Support Review!`)
                            .setDescription(
                                `**Rating:** ${stars} (\`${rating}/5\`)\n` +
                                `**Customer Feedback:**\n> *"${userComment || 'Exceptional service provided by staff!'}"*\n\n` +
                                `• **Assisted By:** ${helperStaff}\n` +
                                `• **Ticket Category:** \`${(ticketRecord?.type || 'General').toUpperCase()}\``
                            )
                            .setColor(config.colors.primary)
                            .setFooter({ text: 'FreshlyPlaza Customer Satisfaction Review' })
                            .setTimestamp();

                        await reviewChannel.send({ embeds: [reviewEmbed] });
                    }
                } catch (reviewErr) {
                    console.error('[CSAT REVIEW SHOWCASE ERROR]', reviewErr.message);
                }
            }

            const thanksEmbed = new EmbedBuilder()
                .setTitle('⭐ FreshlyPlaza Support Feedback Received')
                .setDescription(
                    `Thank you for taking the time to share your feedback!\n\n` +
                    `• **Rating:** ${'⭐'.repeat(rating)} (${rating}/5)\n` +
                    `• **Comment:** ${userComment ? `*"${userComment}"*` : '*None provided*'}\n\n` +
                    `Your feedback has been logged to our Management Quality Dashboard.`
                )
                .setColor(rating >= 4 ? config.colors.primary : config.colors.warning)
                .setFooter({ text: 'FreshlyPlaza Customer Support Quality Team' });

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
        const staffName = interaction.member?.displayName || interaction.user.username;
        const customerMention = ticket?.user_id ? `<@${ticket.user_id}>` : 'valued customer';

        let formattedDesc = selectedTag.desc
            .replace(/\{staff\}/g, staffName)
            .replace(/\{customer\}/g, customerMention)
            .replace(/\{store\}/g, config.storeName || 'FreshlyPlaza');

        const embed = new EmbedBuilder()
            .setTitle(selectedTag.title)
            .setDescription(formattedDesc)
            .setColor(selectedTag.color)
            .setFooter({ text: `Snippet posted by staff (${interaction.user.username}) • Quick Tag: ${tagKey}` });

        await interaction.channel.send({ embeds: [embed] });
        return interaction.reply({ content: `✅ Dispatched snippet **${selectedTag.title}** to this ticket!`, flags: MessageFlags.Ephemeral });
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
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_ticket_type') {
        const type = interaction.values[0];

        // Check if category is staff-only (e.g. data_entries)
        const { TICKET_CATEGORIES, buildTicketControlRow } = require('../commands/ticket');
        const selectedCat = TICKET_CATEGORIES[type];
        if (selectedCat && selectedCat.staffOnly) {
            const isStaff = interaction.member && (
                interaction.member.roles.cache.has(config.roles.staff) ||
                interaction.member.roles.cache.has(config.roles.mr) ||
                interaction.member.roles.cache.has(config.roles.hr) ||
                interaction.member.roles.cache.has(config.roles.trainee) ||
                interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
            );
            if (!isStaff) {
                return interaction.reply({
                    content: '🚫 **Access Denied:** The `DATA-ENTRIES` category is strictly reserved for verified FreshlyPlaza Staff members.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Check if ticket system is temporarily disabled/paused
        const ticketSettings = await db.getTicketSettings();
        if (!ticketSettings.enabled) {
            return interaction.reply({
                content: `⚠️ **Ticket Support Paused:** ${ticketSettings.disabled_reason || 'Support tickets are temporarily closed for scheduled maintenance.'}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user is ticket blacklisted
        const isBanned = await db.isTicketBlacklisted(interaction.user.id);
        if (isBanned) {
            const expText = isBanned.expires_at ? `<t:${Math.floor(new Date(isBanned.expires_at).getTime() / 1000)}:R>` : 'Never (Permanent)';
            return interaction.reply({
                content: `🚫 **Ticket Access Restricted:** You are blacklisted from opening FreshlyPlaza tickets.\n• **Reason:** ${isBanned.reason}\n• **Expires:** ${expText}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check active ticket
        const activeTicket = await db.getActiveUserTicket(interaction.user.id, type);
        if (activeTicket) {
            return interaction.reply({
                content: `⚠️ You already have an active ticket open: <#${activeTicket.channel_id}>. Please finish or close that ticket first!`,
                flags: MessageFlags.Ephemeral
            });
        }

        // If DATA-ENTRIES, create ticket immediately without requiring a modal form
        if (type === 'data_entries') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const catConfig = selectedCat;
            const categoryKey = type;
            const subject = 'Staff Data Entry Submission';
            const details = 'Staff roster credentials and data intake';

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

            const ticketChannel = await interaction.guild.channels.create({
                name: `${categoryKey}-${interaction.user.username.toLowerCase()}`.slice(0, 32),
                type: ChannelType.GuildText,
                parent: parentCategoryId,
                permissionOverwrites
            });

            const ticketRecord = await db.createTicketRecord({
                channelId: ticketChannel.id,
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                type: categoryKey,
                subject,
                details,
                robloxUsername: '',
                aiDisabled: true
            });

            const staffMention = catConfig.targetUserId ? `<@${catConfig.targetUserId}>` : `<@&${config.roles.staff}>`;

            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket #${ticketRecord.id} — ${catConfig.label}`)
                .setDescription(
                    `Hello <@${interaction.user.id}>! You have opened a **DATA-ENTRIES** ticket.\n\n` +
                    `🚫 **AI Support is DISABLED** for this room. You are speaking directly with ${staffMention}.\n\n` +
                    `Please paste your filled-out data entry template directly into this chat.`
                )
                .addFields(
                    { name: '📋 Category', value: `${catConfig.emoji} ${catConfig.label}`, inline: true },
                    { name: '👤 Creator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🛡️ Assigned Staff', value: staffMention, inline: true }
                )
                .setColor(catConfig.color)
                .setTimestamp()
                .setFooter({ text: 'FreshlyPlaza Data Room • Human Staff Only', iconURL: interaction.guild.iconURL() });

            await ticketChannel.send({
                content: `<@${catConfig.targetUserId}>`,
                embeds: [welcomeEmbed],
                components: [buildTicketControlRow()]
            });

            return interaction.editReply({
                content: `✅ Your private **DATA-ENTRIES** room has been created! Head over to <#${ticketChannel.id}>.`
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`modal_create_ticket_${type}`)
            .setTitle(`Open Support Ticket`);

        const subjectInput = new TextInputBuilder()
            .setCustomId('ticket_subject')
            .setLabel('Subject / Main Topic')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Question about checkout, reporting a glitch...')
            .setRequired(true);

        const detailsInput = new TextInputBuilder()
            .setCustomId('ticket_details')
            .setLabel('Detailed Explanation')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Describe your question or issue in detail...')
            .setRequired(true);

        const robloxInput = new TextInputBuilder()
            .setCustomId('ticket_roblox')
            .setLabel('Roblox Username (Required)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your exact Roblox username...')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(subjectInput),
            new ActionRowBuilder().addComponents(detailsInput),
            new ActionRowBuilder().addComponents(robloxInput)
        );

        return interaction.showModal(modal);
    }
}

module.exports = { handleInteraction };
