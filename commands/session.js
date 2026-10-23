const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

const { formatWorldTime } = require('../utils/timeFormat');

function formatStations(stations) {
    if (!stations || Object.keys(stations).length === 0) {
        return '*No stations assigned yet.*';
    }
    const lines = [];
    for (const [st, users] of Object.entries(stations)) {
        if (users && users.length > 0) {
            lines.push(`• **${st}**: ${users.map(u => `<@${u}>`).join(', ')}`);
        }
    }
    return lines.length > 0 ? lines.join('\n') : '*No stations assigned yet.*';
}

function buildShiftAnnouncementEmbed(session, guild) {
    const startedTimestamp = Math.floor(new Date(session.started_at).getTime() / 1000);
    const storeLink = session.store_link || config.robloxGameLink;
    const worldTime = formatWorldTime(session.started_at);

    const embed = new EmbedBuilder()
        .setTitle('🏪 Grandway Shopping — Store Shift Commenced!')
        .setDescription(
            `An official store shift is now **OPEN & LIVE** at **Grandway Shopping**!\n` +
            `Come down to shop our fresh bakery, grocery aisles, or join the colleague team on duty!`
        )
        .addFields(
            { 
                name: '🟢 Store Status', 
                value: '`OPERATIONAL & OPEN`', 
                inline: true 
            },
            { 
                name: '👤 Shift Host', 
                value: `<@${session.host_id}>`, 
                inline: true 
            },
            { 
                name: '👥 Shift Co-Host', 
                value: session.cohost_id ? `<@${session.cohost_id}>` : '*None*', 
                inline: true 
            },
            { 
                name: '⏰ Commenced (Your Time)', 
                value: `<t:${startedTimestamp}:t> (<t:${startedTimestamp}:R>)`, 
                inline: true 
            },
            { 
                name: '🆔 Session ID', 
                value: `#${session.id}`, 
                inline: true 
            },
            { 
                name: '🛒 In-Game Store Link', 
                value: `[**Join Grandway Shopping V2 Server**](${storeLink})`, 
                inline: true 
            }
        );

    if (worldTime && worldTime.worldTimesList) {
        embed.addFields({
            name: '🌐 Global Timezones',
            value: worldTime.worldTimesList,
            inline: false
        });
    }

    embed.setColor(config.colors.primary)
        .setImage('https://media.discordapp.net/attachments/1509272778711367860/1294333671750697000/grandway shopping_banner.png')
        .setFooter({ text: `Shift #${session.id} • Grandway Shopping Store Operations`, iconURL: guild ? guild.iconURL() : null })
        .setTimestamp();

    return embed;
}

function buildShiftActionRow(session) {
    const storeLink = session.store_link || config.robloxGameLink;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('🛒 Join Store Game')
            .setStyle(ButtonStyle.Link)
            .setURL(storeLink)
    );
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('session-start')
            .setDescription('Start a new store shift session')
            .addUserOption(opt => opt.setName('cohost').setDescription('Shift Co-Host (Optional)').setRequired(false))
            .addStringOption(opt => opt.setName('link').setDescription('Roblox Game/Server Link (Default: GrandwayPlazza-V2)').setRequired(false)),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const cohost = interaction.options.getUser('cohost');
            const storeLink = interaction.options.getString('link') || config.robloxGameLink;

            const session = await db.addSession(interaction.user.id, cohost ? cohost.id : null, storeLink);

            const shiftEmbed = buildShiftAnnouncementEmbed(session, interaction.guild);
            const joinRow = buildShiftActionRow(session);

            const shiftsChannelId = config.channels.shifts; // 1505309843219546223
            let shiftsChannel = interaction.guild.channels.cache.get(shiftsChannelId);
            if (!shiftsChannel) {
                try {
                    shiftsChannel = await interaction.guild.channels.fetch(shiftsChannelId);
                } catch (e) {
                    shiftsChannel = interaction.channel;
                }
            }

            if (shiftsChannel) {
                // Post Clean Dedicated Store Shift Banner
                const mainMsg = await shiftsChannel.send({
                    content: `<@&${config.roles.shiftPing}> 📢 **GRANDWAY SHOPPING STORE SHIFT IS NOW OPEN!**`,
                    embeds: [shiftEmbed],
                    components: [joinRow]
                });
                await db.run(`UPDATE sessions SET message_id = ? WHERE id = ?`, [mainMsg.id, session.id]);

                // Feature #2: Post clean separate Voter Attendance Notice if community vote passed
                const latestVote = await db.getLatestPassedShiftVote();
                if (latestVote && !latestVote.voters_notified && latestVote.upvotes && latestVote.upvotes.length > 0) {
                    const voterPings = latestVote.upvotes.map(uid => `<@${uid}>`).join(' ');
                    
                    const voterNoticeEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Mandatory Attendance Notice — Shift Community Voters')
                        .setDescription(
                            `The following members voted **YES** to host this store shift and are **strictly required to attend**:\n\n` +
                            `${voterPings}\n\n` +
                            `🚨 **Policy:** You voted YES — failure to join the game server during this shift will result in staff moderation.`
                        )
                        .setColor(config.colors.warning)
                        .setFooter({ text: 'Grandway Shopping Operations • Attendance Enforcement' });

                    await shiftsChannel.send({
                        content: voterPings,
                        embeds: [voterNoticeEmbed]
                    });

                    latestVote.voters_notified = true;
                    latestVote.linked_session_id = session.id;
                    db.save();
                }
            }

            return interaction.editReply({ 
                content: `✅ Store shift **#${session.id}** announced cleanly in <#${shiftsChannel ? shiftsChannel.id : config.channels.shifts}>!` 
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('session-schedule')
            .setDescription('Schedule a shift up to 1 day (24 hours) ahead with automated 5m & start alerts')
            .addIntegerOption(opt => 
                opt.setName('hours')
                    .setDescription('Hours from now (0 - 24 hours)')
                    .setRequired(false)
                    .setMinValue(0)
                    .setMaxValue(24)
            )
            .addIntegerOption(opt => 
                opt.setName('minutes')
                    .setDescription('Additional minutes from now (e.g. 15, 30, 45)')
                    .setRequired(false)
                    .setMinValue(0)
                    .setMaxValue(59)
            )
            .addStringOption(opt => 
                opt.setName('time_string')
                    .setDescription('Or scheduled time text (e.g. "6:30 PM", "in 2 hours", "tomorrow at 3pm")')
                    .setRequired(false)
            )
            .addStringOption(opt => 
                opt.setName('note')
                    .setDescription('Special shift focus or note (e.g. Grand Re-opening, Restocking Rush)')
                    .setRequired(false)
            )
            .addStringOption(opt => 
                opt.setName('link')
                    .setDescription('Roblox Store Link (Default: GrandwayPlazza-V2)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const hours = interaction.options.getInteger('hours') || 0;
            const minutes = interaction.options.getInteger('minutes') || 0;
            const timeString = interaction.options.getString('time_string');
            const note = interaction.options.getString('note') || '';
            const storeLink = interaction.options.getString('link') || config.robloxGameLink;

            let targetMinutes = 0;

            if (hours > 0 || minutes > 0) {
                targetMinutes = (hours * 60) + minutes;
            } else if (timeString) {
                // Try parsing relative strings like "in 2h", "in 90m", "in 1 hour 30 mins", etc.
                const lower = timeString.toLowerCase().trim();
                const hrMatch = lower.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)/);
                const minMatch = lower.match(/(\d+)\s*(?:m|min|mins|minute|minutes)/);
                if (hrMatch || minMatch) {
                    const parsedHrs = hrMatch ? parseInt(hrMatch[1], 10) : 0;
                    const parsedMins = minMatch ? parseInt(minMatch[1], 10) : 0;
                    targetMinutes = (parsedHrs * 60) + parsedMins;
                } else {
                    // Try parsing clock time e.g. "5:30 PM", "18:00"
                    const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i;
                    const match = lower.match(timeRegex);
                    if (match) {
                        let parsedH = parseInt(match[1], 10);
                        const parsedM = match[2] ? parseInt(match[2], 10) : 0;
                        const meridiem = match[3] ? match[3].toLowerCase() : null;

                        if (meridiem === 'pm' && parsedH < 12) parsedH += 12;
                        if (meridiem === 'am' && parsedH === 12) parsedH = 0;

                        const now = new Date();
                        const schedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsedH, parsedM, 0, 0);
                        if (schedDate.getTime() <= now.getTime()) {
                            // If time is earlier today, assume next day (within 24 hours)
                            schedDate.setDate(schedDate.getDate() + 1);
                        }
                        targetMinutes = Math.round((schedDate.getTime() - now.getTime()) / (60 * 1000));
                    }
                }
            }

            // Fallback default: if user specified nothing, require at least 5 minutes
            if (targetMinutes <= 0) {
                return interaction.editReply({
                    content: '❌ **Please specify when to schedule the shift!**\nUse `hours` (e.g. `2`), `minutes` (e.g. `30`), or `time_string` (e.g. `"in 3 hours"` or `"7:00 PM"`). Shifts can be scheduled up to 1 day (24 hours / 1440 minutes) ahead.'
                });
            }

            const maxMinutesInDay = 24 * 60; // 1440 minutes (1 day)
            if (targetMinutes > maxMinutesInDay) {
                return interaction.editReply({
                    content: `❌ **Cannot schedule more than 1 day (24 hours) ahead!**\nYou requested ${Math.floor(targetMinutes / 60)}h ${targetMinutes % 60}m. Please pick a time within the next 24 hours.`
                });
            }

            const startTime = new Date(Date.now() + targetMinutes * 60 * 1000);
            const startTimestamp = Math.floor(startTime.getTime() / 1000);

            const hoursDisplay = Math.floor(targetMinutes / 60);
            const minsDisplay = targetMinutes % 60;
            let durationString = '';
            if (hoursDisplay > 0 && minsDisplay > 0) {
                durationString = `${hoursDisplay} hour${hoursDisplay > 1 ? 's' : ''} and ${minsDisplay} minute${minsDisplay > 1 ? 's' : ''}`;
            } else if (hoursDisplay > 0) {
                durationString = `${hoursDisplay} hour${hoursDisplay > 1 ? 's' : ''}`;
            } else {
                durationString = `${minsDisplay} minute${minsDisplay > 1 ? 's' : ''}`;
            }

            const worldTime = formatWorldTime(startTime);

            const schedEmbed = new EmbedBuilder()
                .setTitle('⏰ Grandway Shopping — Store Shift Scheduled!')
                .setDescription(
                    `A store shift has been officially scheduled for **<t:${startTimestamp}:F>** (<t:${startTimestamp}:R>)!\n` +
                    `Get ready to shop and work at Grandway Shopping V2.`
                )
                .addFields(
                    { name: '👤 Shift Host', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Scheduled Start (Your Time)', value: `<t:${startTimestamp}:t> (<t:${startTimestamp}:R>)`, inline: true },
                    { name: '⏳ Opens In', value: `\`${durationString}\``, inline: true }
                );

            if (worldTime && worldTime.worldTimesList) {
                schedEmbed.addFields({
                    name: '🌐 Global Timezones',
                    value: worldTime.worldTimesList,
                    inline: false
                });
            }

            schedEmbed.setColor(config.colors.secondary)
                .setTimestamp()
                .setFooter({ text: 'Grandway Shopping Shift Scheduling • 24h Advance Notice', iconURL: interaction.guild.iconURL() });

            if (note) {
                schedEmbed.addFields({ name: '📝 Shift Notes / Focus', value: note, inline: false });
            }

            schedEmbed.addFields({ name: '🔗 Store Link', value: `[Join Grandway Shopping Game](${storeLink})`, inline: false });

            const shiftsChannelId = config.channels.shifts;
            let shiftsChannel = interaction.guild.channels.cache.get(shiftsChannelId);
            if (!shiftsChannel) {
                try {
                    shiftsChannel = await interaction.guild.channels.fetch(shiftsChannelId);
                } catch (e) {
                    shiftsChannel = interaction.channel;
                }
            }

            let announcementMsg = null;
            if (shiftsChannel) {
                announcementMsg = await shiftsChannel.send({
                    content: `<@&${config.roles.shiftPing}> ⏰ **UPCOMING STORE SHIFT ANNOUNCEMENT!** (Scheduled for <t:${startTimestamp}:F>)`,
                    embeds: [schedEmbed]
                });

                // Clean separate notification if voters exist
                const db = getDb();
                const latestVote = await db.getLatestPassedShiftVote();
                if (latestVote && !latestVote.voters_notified && latestVote.upvotes && latestVote.upvotes.length > 0) {
                    const voterPings = latestVote.upvotes.map(uid => `<@${uid}>`).join(' ');
                    const voterNoticeEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Scheduled Shift — Attendance Required for Voters')
                        .setDescription(`The following members voted **YES** on the community shift poll:\n\n${voterPings}\n\nBe prepared to join at <t:${startTimestamp}:t> (<t:${startTimestamp}:R>).`)
                        .setColor(config.colors.warning);

                    await shiftsChannel.send({
                        content: voterPings,
                        embeds: [voterNoticeEmbed]
                    });

                    latestVote.voters_notified = true;
                    db.save();
                }
            }

            // Save scheduled shift to persistent database
            const db = getDb();
            const schedRecord = await db.addScheduledShift(
                interaction.user.id,
                startTime.toISOString(),
                storeLink,
                announcementMsg ? announcementMsg.id : null,
                note
            );

            // In-memory automated 5-minute reminder fallback (for shifts within current process lifetime)
            if (targetMinutes > 5) {
                const delayMs = (targetMinutes - 5) * 60 * 1000;
                setTimeout(async () => {
                    const updatedDb = getDb();
                    const currentSched = (updatedDb.getData().shift_schedules || []).find(s => s.id === schedRecord.id);
                    if (currentSched && currentSched.status === 'SCHEDULED') {
                        currentSched.status = 'REMINDED_5M';
                        updatedDb.save();
                        if (shiftsChannel) {
                            await shiftsChannel.send({
                                content: `<@&${config.roles.shiftPing}> ⚠️ **5-MINUTE REMINDER:** Store shift hosted by <@${interaction.user.id}> opens in **5 minutes**!\n👉 [Join Grandway Shopping Now](${storeLink})`
                            });
                        }
                    }
                }, delayMs);
            }

            return interaction.editReply({ 
                content: `✅ Store shift scheduled for **<t:${startTimestamp}:F>** (<t:${startTimestamp}:R>)! (Up to 1 day ahead supported)\n• **Schedule ID:** \`#${schedRecord.id}\`\n• **Announced in:** <#${shiftsChannel ? shiftsChannel.id : config.channels.shifts}>` 
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('session-schedule-cancel')
            .setDescription('Cancel a scheduled shift before it begins')
            .addIntegerOption(opt => 
                opt.setName('id')
                    .setDescription('Schedule ID to cancel (Run without ID to cancel your latest upcoming shift)')
                    .setRequired(false)
            )
            .addStringOption(opt => 
                opt.setName('reason')
                    .setDescription('Reason for cancelling the scheduled shift')
                    .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const schedId = interaction.options.getInteger('id');
            const reason = interaction.options.getString('reason') || 'Shift host rescheduled or cancelled';

            const data = db.getData();
            let sched = null;
            if (schedId) {
                sched = (data.shift_schedules || []).find(s => s.id === schedId);
            } else {
                sched = (data.shift_schedules || [])
                    .filter(s => (s.status === 'SCHEDULED' || s.status === 'REMINDED_5M') && s.host_id === interaction.user.id)
                    .pop();
            }

            if (!sched || (sched.status !== 'SCHEDULED' && sched.status !== 'REMINDED_5M')) {
                return interaction.editReply({ content: '❌ No active scheduled shift found to cancel.' });
            }

            const member = interaction.member;
            const isAuthorized = sched.host_id === interaction.user.id || 
                                 member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                 member.roles.cache.has(config.roles.hr);

            if (!isAuthorized) {
                return interaction.editReply({ content: '❌ Only the shift host or leadership can cancel this scheduled shift.' });
            }

            sched.status = 'CANCELLED';
            sched.cancelled_at = new Date().toISOString();
            sched.cancel_reason = reason;
            db.save();

            const shiftsChannel = interaction.guild.channels.cache.get(config.channels.shifts);
            if (shiftsChannel) {
                if (sched.announcement_message_id) {
                    try {
                        const msg = await shiftsChannel.messages.fetch(sched.announcement_message_id);
                        await msg.edit({
                            content: `❌ **SCHEDULED STORE SHIFT CANCELLED**`,
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle('❌ Grandway Shopping — Scheduled Shift Cancelled')
                                    .setDescription(`The store shift scheduled by <@${sched.host_id}> has been cancelled.\n**Reason:** ${reason}`)
                                    .setColor(config.colors.danger)
                                    .setTimestamp()
                            ]
                        });
                    } catch (e) {}
                }

                await shiftsChannel.send({
                    content: `📢 **NOTICE:** The store shift scheduled by <@${sched.host_id}> for <t:${Math.floor(new Date(sched.scheduled_for).getTime() / 1000)}:F> has been **cancelled**.\nReason: *${reason}*`
                });
            }

            return interaction.editReply({
                content: `✅ Scheduled shift **#${sched.id}** has been cancelled.`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('session-conclude')
            .setDescription('Conclude the active store shift session and log employee attendance')
            .addStringOption(opt => 
                opt.setName('attendees')
                    .setDescription('Pings or User IDs of colleagues who attended (e.g. @User1 @User2)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const activeSession = await db.get(`SELECT * FROM sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1`);
            if (!activeSession) {
                return interaction.editReply({ content: '❌ There are currently no active store shift sessions.' });
            }

            const rawAttendees = interaction.options.getString('attendees') || '';
            const matches = rawAttendees.match(/<@!?(\d+)>|(\d{17,20})/g) || [];
            const attendeeIds = [...new Set(matches.map(m => m.replace(/[<@!>]/g, '')))];

            // Record attendance in database
            if (attendeeIds.length > 0) {
                await db.recordShiftAttendance(activeSession.id, attendeeIds);
            }

            await db.run(`UPDATE sessions SET status = 'CONCLUDED', concluded_at = CURRENT_TIMESTAMP WHERE id = ?`, [activeSession.id]);

            const startTime = new Date(activeSession.started_at);
            const durationMinutes = Math.round((Date.now() - startTime.getTime()) / (60 * 1000)) || 1;

            // Feature #4: Live Edit the original announcement message to CLOSED & disabled buttons
            const concludeEmbed = new EmbedBuilder()
                .setTitle('🛑 Grandway Shopping — Shift Concluded (Store Closed)')
                .setDescription(
                    `Store Shift **#${activeSession.id}** hosted by <@${activeSession.host_id}> has officially **concluded**.\n\n` +
                    `Thank you to all employees and customers who visited Grandway Shopping today!`
                )
                .addFields(
                    { name: '🔴 Store Status', value: '`CLOSED`', inline: true },
                    { name: '👤 Host', value: `<@${activeSession.host_id}>`, inline: true },
                    { name: '⏱️ Duration', value: `**${durationMinutes}** minutes`, inline: true },
                    { name: `👥 Attendance Credited (${attendeeIds.length})`, value: attendeeIds.length > 0 ? attendeeIds.map(u => `<@${u}>`).join(', ') : '*None recorded*', inline: false }
                )
                .setColor(config.colors.danger)
                .setFooter({ text: 'Grandway Shopping Operations • Shift Concluded', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            const shiftsChannel = interaction.guild.channels.cache.get(config.channels.shifts);
            if (shiftsChannel && activeSession.message_id) {
                try {
                    const originalMsg = await shiftsChannel.messages.fetch(activeSession.message_id);
                    await originalMsg.edit({ 
                        content: `🛑 **STORE SHIFT #${activeSession.id} HAS CONCLUDED**`,
                        embeds: [concludeEmbed], 
                        components: [] // Removes the join button so players don't join stale servers
                    });
                } catch (e) {}
            }

            const shiftLogsChannel = interaction.guild.channels.cache.get(config.channels.shiftLogs);
            if (shiftLogsChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`📊 Shift Audit & Attendance Log — #${activeSession.id}`)
                    .addFields(
                        { name: 'Session ID', value: `#${activeSession.id}`, inline: true },
                        { name: 'Host', value: `<@${activeSession.host_id}>`, inline: true },
                        { name: 'Concluded By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Duration', value: `${durationMinutes} mins`, inline: true },
                        { name: `👥 Attendance Credited (${attendeeIds.length})`, value: attendeeIds.length > 0 ? attendeeIds.map(u => `<@${u}> (+1 credit)`).join(', ') : '*None logged*', inline: false }
                    )
                    .setColor(config.colors.secondary)
                    .setTimestamp();
                await shiftLogsChannel.send({ embeds: [logEmbed] });
            }

            return interaction.editReply({ 
                content: `✅ Shift **#${activeSession.id}** concluded and original announcement updated!\n• **Duration:** ${durationMinutes} minutes\n• **Attendance Credited:** ${attendeeIds.length} colleagues earned +1 shift credit.` 
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('session-cancel')
            .setDescription('Cancel an active store shift session')
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for cancellation').setRequired(true)),
        async execute(interaction) {
            const db = getDb();
            const reason = interaction.options.getString('reason');
            const activeSession = await db.get(`SELECT * FROM sessions WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1`);
            if (!activeSession) {
                return interaction.reply({ content: '❌ There are no active store shifts to cancel.', ephemeral: true });
            }

            await db.run(`UPDATE sessions SET status = 'CANCELLED', concluded_at = CURRENT_TIMESTAMP WHERE id = ?`, [activeSession.id]);

            const cancelEmbed = new EmbedBuilder()
                .setTitle('❌ Grandway Shopping — Shift Cancelled')
                .setDescription(`Store Shift **#${activeSession.id}** has been cancelled.\n**Reason:** ${reason}`)
                .setColor(config.colors.danger)
                .setTimestamp();

            const shiftsChannel = interaction.guild.channels.cache.get(config.channels.shifts);
            if (shiftsChannel && activeSession.message_id) {
                try {
                    const msg = await shiftsChannel.messages.fetch(activeSession.message_id);
                    await msg.edit({ 
                        content: `❌ **STORE SHIFT #${activeSession.id} CANCELLED**`,
                        embeds: [cancelEmbed], 
                        components: [] 
                    });
                } catch (e) {}
            }

            return interaction.reply({ content: `✅ Shift **#${activeSession.id}** cancelled.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('session-handoff')
            .setDescription('Transfer active store shift host controls to a co-host')
            .addUserOption(opt => 
                opt.setName('new-host')
                    .setDescription('Colleague to transfer shift host controls to')
                    .setRequired(true)
            )
            .addStringOption(opt => 
                opt.setName('reason')
                    .setDescription('Reason for handoff (e.g. Host logging off)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const data = db.getData();
            const activeSession = (data.sessions || []).find(s => s.status === 'ACTIVE');

            if (!activeSession) {
                return interaction.editReply({ content: '❌ There are currently no active store shift sessions.' });
            }

            const member = interaction.member;
            const isAuthorized = activeSession.host_id === interaction.user.id || 
                                 activeSession.cohost_id === interaction.user.id || 
                                 member.permissions.has(PermissionFlagsBits.ManageGuild);

            if (!isAuthorized) {
                return interaction.editReply({ content: '❌ Only the current shift host, co-host, or management can handoff this shift.' });
            }

            const newHost = interaction.options.getUser('new-host');
            const reason = interaction.options.getString('reason') || 'Shift leadership handoff';

            if (newHost.id === activeSession.host_id) {
                return interaction.editReply({ content: '❌ That user is already the active host.' });
            }

            const previousHostId = activeSession.host_id;
            activeSession.host_id = newHost.id;
            if (!activeSession.handoff_history) activeSession.handoff_history = [];
            activeSession.handoff_history.push({
                from: previousHostId,
                to: newHost.id,
                reason,
                timestamp: new Date().toISOString()
            });
            db.save();

            // Feature #4: Also edit the original session embed to reflect the new host!
            const shiftsChannel = interaction.guild.channels.cache.get(config.channels.shifts);
            if (shiftsChannel && activeSession.message_id) {
                try {
                    const originalMsg = await shiftsChannel.messages.fetch(activeSession.message_id);
                    const updatedEmbed = buildShiftAnnouncementEmbed(activeSession, interaction.guild);
                    await originalMsg.edit({ embeds: [updatedEmbed] });
                } catch (e) {}
            }

            if (shiftsChannel) {
                const handoffEmbed = new EmbedBuilder()
                    .setTitle('🔄 Grandway Shopping — Shift Host Handoff')
                    .setDescription(`Store Shift **#${activeSession.id}** controls have been officially transferred!`)
                    .addFields(
                        { name: '👑 New Shift Host', value: `<@${newHost.id}>`, inline: true },
                        { name: '👤 Previous Host', value: `<@${previousHostId}>`, inline: true },
                        { name: '📋 Reason', value: reason, inline: false },
                        { name: '🔗 Store Link', value: `[Join Store](${activeSession.store_link})`, inline: false }
                    )
                    .setColor(config.colors.secondary)
                    .setTimestamp();

                await shiftsChannel.send({
                    content: `📢 **SHIFT HOST UPDATE:** <@${newHost.id}> is now hosting Store Shift #${activeSession.id}!`,
                    embeds: [handoffEmbed]
                });
            }

            return interaction.editReply({
                content: `✅ Shift **#${activeSession.id}** host successfully transferred to <@${newHost.id}>!`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('session-roster')
            .setDescription('View or manage active shift checkout till and station coverage')
            .addStringOption(opt => 
                opt.setName('action')
                    .setDescription('Action to perform')
                    .setRequired(true)
                    .addChoices(
                        { name: 'View Current Station Roster', value: 'view' },
                        { name: 'Assign Colleague to Station', value: 'assign' },
                        { name: 'Clear Station Roster', value: 'clear' }
                    )
            )
            .addStringOption(opt => 
                opt.setName('station')
                    .setDescription('Station to assign (e.g. Till 1, Self-Checkouts, Security)')
                    .setRequired(false)
                    .addChoices(
                        { name: '💳 Self-Checkouts (SCO)', value: 'Self-Checkouts' },
                        { name: '🛒 Till 1 (Manual Register)', value: 'Till 1' },
                        { name: '🛒 Till 2 (Manual Register)', value: 'Till 2' },
                        { name: '📦 Aisle Restocking', value: 'Restocking' },
                        { name: '🛡️ Store Security', value: 'Security' },
                        { name: '🏪 Customer Service Desk', value: 'Customer Service' }
                    )
            )
            .addUserOption(opt => 
                opt.setName('staff')
                    .setDescription('Staff colleague to assign')
                    .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply();
            const db = getDb();
            const data = db.getData();
            const activeSession = (data.sessions || []).find(s => s.status === 'ACTIVE');

            if (!activeSession) {
                return interaction.editReply({ content: '❌ There is no active store shift session running.' });
            }

            if (!activeSession.stations) activeSession.stations = {};

            const action = interaction.options.getString('action');

            if (action === 'clear') {
                const member = interaction.member;
                if (activeSession.host_id !== interaction.user.id && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.editReply({ content: '❌ Only the shift host can clear the roster.' });
                }
                activeSession.stations = {};
                db.save();
                return interaction.editReply({ content: `✅ Station roster for Shift **#${activeSession.id}** has been cleared.` });
            }

            if (action === 'assign') {
                const station = interaction.options.getString('station');
                const staff = interaction.options.getUser('staff');

                if (!station || !staff) {
                    return interaction.editReply({ content: '❌ Both `station` and `staff` options are required when assigning a colleague.' });
                }

                // Remove staff from other stations if already assigned
                for (const st of Object.keys(activeSession.stations)) {
                    activeSession.stations[st] = (activeSession.stations[st] || []).filter(id => id !== staff.id);
                }

                if (!activeSession.stations[station]) activeSession.stations[station] = [];
                activeSession.stations[station].push(staff.id);
                db.save();

                return interaction.editReply({ 
                    content: `✅ Assigned <@${staff.id}> to **${station}** for Shift **#${activeSession.id}**!` 
                });
            }

            // View action
            const embed = new EmbedBuilder()
                .setTitle(`🧑‍💼 Shift #${activeSession.id} — Live Station & Till Coverage`)
                .setDescription(`Current department and register coverage for Store Shift **#${activeSession.id}** (Host: <@${activeSession.host_id}>):`)
                .addFields(
                    { name: '📋 Department Roster', value: formatStations(activeSession.stations), inline: false },
                    { name: '🔗 Store Link', value: `[Join Shift Store](${activeSession.store_link})`, inline: false }
                )
                .setColor(config.colors.secondary)
                .setFooter({ text: 'Grandway Shopping Shift Operations' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
];
