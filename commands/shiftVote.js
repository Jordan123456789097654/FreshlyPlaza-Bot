const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

function buildVoteEmbed(vote, hostUser, guild) {
    const expiresTimestamp = Math.floor(new Date(vote.expires_at).getTime() / 1000);
    const yesCount = vote.upvotes ? vote.upvotes.length : 0;
    const noCount = vote.downvotes ? vote.downvotes.length : 0;
    const target = vote.target_votes || 5;

    const embed = new EmbedBuilder()
        .setTitle('🛒 FreshlyPlaza — Store Shift Community Vote!')
        .setDescription(`Should we host an official **FreshlyPlaza Store Shift** right now?\n\nCast your vote below! If we hit **${target} YES votes** or majority when the timer finishes, store doors will open for shifts!`)
        .addFields(
            { name: '👤 Host Candidate', value: hostUser ? `<@${hostUser.id}>` : `<@${vote.host_id}>`, inline: true },
            { name: '🎯 Vote Target', value: `**${target}** YES votes`, inline: true },
            { name: '⏳ Ends In', value: `<t:${expiresTimestamp}:R>`, inline: true },
            { name: '📊 Live Vote Tally', value: `🟢 **YES:** \`${yesCount}\`\n🔴 **NO:** \`${noCount}\``, inline: false }
        )
        .setColor(config.colors.secondary)
        .setFooter({ text: `Vote ID: #${vote.id} • FreshlyPlaza Operations`, iconURL: guild ? guild.iconURL() : null })
        .setTimestamp();

    return embed;
}

function buildVoteButtons(vote) {
    const yesCount = vote.upvotes ? vote.upvotes.length : 0;
    const noCount = vote.downvotes ? vote.downvotes.length : 0;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shift_vote_yes_${vote.id}`)
            .setLabel(`🟢 Yes, Host Shift! (${yesCount})`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`shift_vote_no_${vote.id}`)
            .setLabel(`🔴 No / Not Now (${noCount})`)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`shift_vote_view_voters_${vote.id}`)
            .setLabel('👥 View Voters')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`shift_vote_end_${vote.id}`)
            .setLabel('🛑 End Vote')
            .setStyle(ButtonStyle.Secondary)
    );
}

function formatStaffRoster(staffStations) {
    if (!staffStations || Object.keys(staffStations).length === 0) {
        return '*No staff have claimed stations yet. Click a button below!*';
    }
    const stations = {
        'Self-Checkouts': '💳 Self-Checkouts',
        'Manual Checkouts': '🛒 Manual Checkouts',
        'Restocking': '📦 Restocking',
        'Security': '🛡️ Security',
        'Customer Service': '🏪 Customer Service'
    };
    const lines = [];
    for (const [stKey, stLabel] of Object.entries(stations)) {
        const users = Object.entries(staffStations)
            .filter(([_, s]) => s === stKey)
            .map(([uid, _]) => `<@${uid}>`);
        if (users.length > 0) {
            lines.push(`• **${stLabel}** (${users.length}): ${users.join(', ')}`);
        }
    }
    return lines.join('\n') || '*No staff have claimed stations yet.*';
}

function buildStaffStationEmbed(vote, hostUser, guild) {
    const rosterText = formatStaffRoster(vote.staff_stations);
    const totalStaff = vote.staff_stations ? Object.keys(vote.staff_stations).length : 0;

    const embed = new EmbedBuilder()
        .setTitle('🧑‍💼 FreshlyPlaza — Shift Staffing & Station Roster')
        .setDescription(`A store shift community vote (**Vote #${vote.id}**) has been initiated by ${hostUser ? `<@${hostUser.id}>` : `<@${vote.host_id}>`}!\n\n**Can you join this upcoming shift?**\nSelect your station below so management can ensure complete store coverage:`)
        .addFields(
            { name: '👤 Shift Host', value: hostUser ? `<@${hostUser.id}>` : `<@${vote.host_id}>`, inline: true },
            { name: '📍 Community Vote', value: `<#${vote.channel_id}>`, inline: true },
            { name: '👥 Staff Attending', value: `**${totalStaff}** staff signed up`, inline: true },
            { name: '📋 Department Stations', value: '• **💳 Self-Checkouts (SCO)**: Monitoring automated registers\n• **🛒 Manual Checkouts**: Operating register belts & bagging\n• **📦 Restocking**: Refilling grocery aisles & bakery items\n• **🛡️ Security**: Store entrance, aisle patrols & anti-trolling\n• **🏪 Customer Service**: Customer returns & help desk', inline: false },
            { name: '📋 Current Station Roster', value: rosterText.slice(0, 1024), inline: false }
        )
        .setColor(config.colors.secondary)
        .setFooter({ text: `Vote ID: #${vote.id} • FreshlyPlaza Staff Operations`, iconURL: guild ? guild.iconURL() : null })
        .setTimestamp();

    return embed;
}

function buildStaffStationButtons(vote) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shift_station_sco_${vote.id}`).setLabel('💳 Self-Checkouts').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`shift_station_manual_${vote.id}`).setLabel('🛒 Manual Checkouts').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`shift_station_restock_${vote.id}`).setLabel('📦 Restocking').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`shift_station_security_${vote.id}`).setLabel('🛡️ Security').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`shift_station_cs_${vote.id}`).setLabel('🏪 Customer Service').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`shift_station_leave_${vote.id}`).setLabel('❌ Step Down').setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

async function concludeShiftVote(vote, guild, concludedBy = null) {
    if (!vote || vote.status !== 'ACTIVE') return;

    const db = getDb();
    const yesCount = vote.upvotes ? vote.upvotes.length : 0;
    const noCount = vote.downvotes ? vote.downvotes.length : 0;
    const target = vote.target_votes || 5;

    const passed = yesCount >= target || (yesCount > noCount && yesCount > 0);
    vote.status = passed ? 'PASSED' : 'FAILED';
    vote.concluded_at = new Date().toISOString();
    vote.concluded_by = concludedBy;
    db.save();

    const channel = guild.channels.cache.get(vote.channel_id);
    if (!channel) return;

    let message;
    if (vote.message_id) {
        try {
            message = await channel.messages.fetch(vote.message_id);
        } catch (e) {}
    }

    if (passed) {
        const passEmbed = new EmbedBuilder()
            .setTitle('🎉 FreshlyPlaza — Shift Vote PASSED!')
            .setDescription(`The community has voted **YES** to hosting a store shift!\n\n**Final Tally:** 🟢 **${yesCount} YES** vs 🔴 **${noCount} NO**\n**Shift Host:** <@${vote.host_id}>\n\nThe store will be opening shortly! Prepare your aprons and head on down!`)
            .setColor(config.colors.primary)
            .setFooter({ text: `Vote ID: #${vote.id} • FreshlyPlaza Operations`, iconURL: guild.iconURL() })
            .setTimestamp();

        const joinRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('🛒 Join FreshlyPlaza Store')
                .setStyle(ButtonStyle.Link)
                .setURL(config.robloxGameLink)
        );

        if (message) {
            try {
                await message.edit({ embeds: [passEmbed], components: [joinRow] });
            } catch (e) {}
        }

        // Send public announcement
        await channel.send({
            content: `<@&${config.roles.shiftPing}> 🎉 **THE SHIFT VOTE HAS PASSED!**\nWith **${yesCount} YES votes**, <@${vote.host_id}> will be hosting a store shift shortly!\n👉 [Click here to join FreshlyPlaza](${config.robloxGameLink})`
        });
    } else {
        const failEmbed = new EmbedBuilder()
            .setTitle('❌ FreshlyPlaza — Shift Vote Concluded (Not Passed)')
            .setDescription(`The shift vote has ended and did not receive enough support to host a store shift at this time.\n\n**Final Tally:** 🟢 **${yesCount} YES** vs 🔴 **${noCount} NO**\nThank you to everyone who voted! A shift may be scheduled later.`)
            .setColor(config.colors.danger)
            .setFooter({ text: `Vote ID: #${vote.id} • FreshlyPlaza Operations`, iconURL: guild.iconURL() })
            .setTimestamp();

        if (message) {
            try {
                await message.edit({ embeds: [failEmbed], components: [] });
            } catch (e) {}
        }
    }

    // Update Staff Announcement Message in #staff-announcements if present
    const staffAnnounceChannel = guild.channels.cache.get(config.channels.staffAnnouncements);
    if (staffAnnounceChannel && vote.staff_message_id) {
        try {
            const staffMsg = await staffAnnounceChannel.messages.fetch(vote.staff_message_id);
            if (staffMsg) {
                const rosterText = formatStaffRoster(vote.staff_stations);
                const totalStaff = vote.staff_stations ? Object.keys(vote.staff_stations).length : 0;
                const concludeStaffEmbed = new EmbedBuilder()
                    .setTitle(passed ? '🎉 FreshlyPlaza — Shift Vote PASSED (Staff Assigned)' : '❌ FreshlyPlaza — Shift Vote Ended')
                    .setDescription(passed 
                        ? `The community shift vote **PASSED**! Thank you to the **${totalStaff}** staff members who signed up. Please prepare to join the store!` 
                        : 'The shift vote did not pass. Staff stations for this session are dismissed.')
                    .addFields(
                        { name: '👤 Shift Host', value: `<@${vote.host_id}>`, inline: true },
                        { name: '👥 Station Staff Roster', value: rosterText.slice(0, 1024), inline: false }
                    )
                    .setColor(passed ? config.colors.primary : config.colors.danger)
                    .setTimestamp();
                await staffMsg.edit({ embeds: [concludeStaffEmbed], components: [] });
            }
        } catch (e) {}
    }
}

const commands = [
    {
        data: new SlashCommandBuilder()
            .setName('shift-vote')
            .setDescription('Start a community vote to decide if a store shift should be hosted')
            .addIntegerOption(opt => 
                opt.setName('duration')
                    .setDescription('Duration in minutes for the vote (default: 15, max: 120)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(120)
            )
            .addIntegerOption(opt => 
                opt.setName('target')
                    .setDescription('Target YES votes needed to pass early (default: 5)')
                    .setRequired(false)
                    .setMinValue(1)
            )
            .addBooleanOption(opt => 
                opt.setName('ping')
                    .setDescription('Whether to ping the Shift Ping role (default: True)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = member.roles.cache.has(config.roles.staff) || 
                            member.roles.cache.has(config.roles.mr) || 
                            member.roles.cache.has(config.roles.hr) || 
                            member.permissions.has('ManageGuild');

            if (!isStaff) {
                return interaction.reply({ content: '❌ You must be a FreshlyPlaza staff member to initiate a store shift vote.', ephemeral: true });
            }

            const db = getDb();
            const activeVote = await db.getActiveShiftVote();
            if (activeVote) {
                return interaction.reply({ 
                    content: `❌ There is already an active shift vote in progress (**Vote #${activeVote.id}**) in <#${activeVote.channel_id}>!\nPlease wait for it to finish or conclude it with \`/shift-vote-end\`.`, 
                    ephemeral: true 
                });
            }

            const duration = interaction.options.getInteger('duration') || 15;
            const target = interaction.options.getInteger('target') || 5;
            const ping = interaction.options.getBoolean('ping') ?? true;

            const shiftsChannel = interaction.guild.channels.cache.get(config.channels.shifts) || interaction.channel;

            const vote = await db.addShiftVote(interaction.user.id, shiftsChannel.id, duration, target);

            const embed = buildVoteEmbed(vote, interaction.user, interaction.guild);
            const row = buildVoteButtons(vote);

            const content = ping && config.roles.shiftPing 
                ? `<@&${config.roles.shiftPing}> 📢 **COMMUNITY STORE SHIFT VOTE STARTED!**` 
                : null;

            const msg = await shiftsChannel.send({
                content: content,
                embeds: [embed],
                components: [row]
            });

            vote.message_id = msg.id;
            db.save();

            // Send Staffing & Station Roster request to #staff-announcements
            const staffAnnounceChannel = interaction.guild.channels.cache.get(config.channels.staffAnnouncements);
            if (staffAnnounceChannel) {
                try {
                    const staffEmbed = buildStaffStationEmbed(vote, interaction.user, interaction.guild);
                    const staffRows = buildStaffStationButtons(vote);
                    const staffPing = config.roles.staff ? `<@&${config.roles.staff}>` : '';
                    const staffMsg = await staffAnnounceChannel.send({
                        content: `${staffPing} 📢 **UPCOMING STORE SHIFT: STAFFING & STATION CHECK!**`,
                        embeds: [staffEmbed],
                        components: staffRows
                    });
                    vote.staff_message_id = staffMsg.id;
                    db.save();
                } catch (e) {
                    console.error('[SHIFT VOTE] Error sending staff station request:', e);
                }
            }

            // Set auto-conclude timer
            setTimeout(async () => {
                const currentVote = await db.getShiftVote(vote.id);
                if (currentVote && currentVote.status === 'ACTIVE') {
                    await concludeShiftVote(currentVote, interaction.guild, 'Automated Timer');
                }
            }, duration * 60 * 1000);

            return interaction.reply({ 
                content: `✅ Shift Vote **#${vote.id}** initiated in <#${shiftsChannel.id}> for **${duration} minutes** (Target: **${target} YES votes**)!`, 
                ephemeral: true 
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('shift-vote-end')
            .setDescription('Conclude the active store shift vote early and tally the results'),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = member.roles.cache.has(config.roles.staff) || 
                            member.roles.cache.has(config.roles.mr) || 
                            member.roles.cache.has(config.roles.hr) || 
                            member.permissions.has('ManageGuild');

            if (!isStaff) {
                return interaction.reply({ content: '❌ You must be a staff member to conclude a shift vote.', ephemeral: true });
            }

            const db = getDb();
            const activeVote = await db.getActiveShiftVote();
            if (!activeVote) {
                return interaction.reply({ content: '❌ There is no active shift vote to conclude.', ephemeral: true });
            }

            await concludeShiftVote(activeVote, interaction.guild, interaction.user.id);
            return interaction.reply({ content: `✅ Shift Vote **#${activeVote.id}** has been concluded early and tallied!`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('shift-vote-status')
            .setDescription('View live progress and tally of the active store shift vote'),
        async execute(interaction) {
            const db = getDb();
            const activeVote = await db.getActiveShiftVote();
            if (!activeVote) {
                return interaction.reply({ content: 'ℹ️ There is currently no active store shift vote.', ephemeral: true });
            }

            const yesCount = activeVote.upvotes ? activeVote.upvotes.length : 0;
            const noCount = activeVote.downvotes ? activeVote.downvotes.length : 0;
            const target = activeVote.target_votes || 5;
            const expiresTimestamp = Math.floor(new Date(activeVote.expires_at).getTime() / 1000);

            const yesList = activeVote.upvotes && activeVote.upvotes.length > 0 ? activeVote.upvotes.map(u => `<@${u}>`).join(', ') : '*None*';
            const noList = activeVote.downvotes && activeVote.downvotes.length > 0 ? activeVote.downvotes.map(u => `<@${u}>`).join(', ') : '*None*';

            const embed = new EmbedBuilder()
                .setTitle(`📊 Live Shift Vote Status — #${activeVote.id}`)
                .setDescription(`A vote is actively underway in <#${activeVote.channel_id}>!`)
                .addFields(
                    { name: '👤 Host Candidate', value: `<@${activeVote.host_id}>`, inline: true },
                    { name: '🎯 Target', value: `${yesCount}/${target} YES votes`, inline: true },
                    { name: '⏳ Ends', value: `<t:${expiresTimestamp}:R>`, inline: true },
                    { name: `🟢 YES Votes (${yesCount})`, value: yesList.slice(0, 1024), inline: false },
                    { name: `🔴 NO Votes (${noCount})`, value: noList.slice(0, 1024), inline: false }
                )
                .setColor(config.colors.secondary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('shift-vote-voters')
            .setDescription('View the users who voted YES and NO for a store shift')
            .addIntegerOption(opt => 
                opt.setName('id')
                    .setDescription('Shift Vote ID (Optional, defaults to active or latest vote)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const db = getDb();
            const idOption = interaction.options.getInteger('id');
            const vote = idOption ? await db.getShiftVote(idOption) : (await db.getActiveShiftVote() || await db.getLatestShiftVote());
            
            if (!vote) {
                return interaction.reply({ content: '❌ No shift vote record found.', ephemeral: true });
            }

            const yesCount = vote.upvotes ? vote.upvotes.length : 0;
            const noCount = vote.downvotes ? vote.downvotes.length : 0;
            const yesList = vote.upvotes && vote.upvotes.length > 0 ? vote.upvotes.map(u => `<@${u}>`).join(', ') : '*No votes recorded*';
            const noList = vote.downvotes && vote.downvotes.length > 0 ? vote.downvotes.map(u => `<@${u}>`).join(', ') : '*No votes recorded*';

            const embed = new EmbedBuilder()
                .setTitle(`👥 Shift Vote Voters — Vote #${vote.id}`)
                .setDescription(`**Status:** \`${vote.status}\` • **Shift Host:** <@${vote.host_id}>\n**Channel:** <#${vote.channel_id}>`)
                .addFields(
                    { name: `🟢 Voted YES (${yesCount})`, value: yesList.slice(0, 1024), inline: false },
                    { name: `🔴 Voted NO (${noCount})`, value: noList.slice(0, 1024), inline: false }
                )
                .setColor(vote.status === 'PASSED' ? config.colors.primary : config.colors.secondary)
                .setFooter({ text: `FreshlyPlaza Operations • Total: ${yesCount + noCount} votes` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
];

module.exports = commands;
module.exports.buildVoteEmbed = buildVoteEmbed;
module.exports.buildVoteButtons = buildVoteButtons;
module.exports.concludeShiftVote = concludeShiftVote;
module.exports.buildStaffStationEmbed = buildStaffStationEmbed;
module.exports.buildStaffStationButtons = buildStaffStationButtons;
module.exports.formatStaffRoster = formatStaffRoster;
