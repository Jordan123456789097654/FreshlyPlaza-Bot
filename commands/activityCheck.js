const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

async function runActivityAudit(guild, checkRecord) {
    const staffRoleId = config.roles.staff;
    const loaRoleId = config.roles.loa;

    try {
        await guild.members.fetch();
    } catch (e) {
        console.warn('[GATEWAY RATE LIMIT] Using cached members for audit:', e.message);
    }
    const staffMembers = guild.members.cache.filter(m => m.roles.cache.has(staffRoleId));

    const confirmedUserIds = new Set(checkRecord.confirmed_users || []);

    // Try fetching reactions if message still exists
    try {
        const targetChannel = guild.channels.cache.get(checkRecord.channel_id);
        if (targetChannel && checkRecord.message_id) {
            const msg = await targetChannel.messages.fetch(checkRecord.message_id);
            const reaction = msg.reactions.cache.get('✅');
            if (reaction) {
                const users = await reaction.users.fetch();
                users.forEach(u => confirmedUserIds.add(u.id));
            }
        }
    } catch (e) {}

    const db = getDb();
    const data = db.getData();
    const profiles = data.staff_profiles || {};

    const inactiveStaff = [];
    const loaStaff = [];
    const newRecruitStaff = [];

    const ignoredUserIds = new Set(config.ignoredUserIds || []);

    staffMembers.forEach(m => {
        if (m.user.bot) return;
        if (ignoredUserIds.has(m.id)) return; // Exclude exempt users (SECRET_DEVJED)

        const profile = profiles[m.id];
        const hasLoaRole = m.roles.cache.has(loaRoleId);
        const hasLoaStatus = profile?.loa_status && /loa/i.test(profile.loa_status) && !/not on/i.test(profile.loa_status);

        // Check if joined in the last 7 days (New recruit grace period)
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
            newRecruitStaff.push(m);
        } else if (!confirmedUserIds.has(m.user.id)) {
            inactiveStaff.push(m);
        }
    });

    const reportEmbed = new EmbedBuilder()
        .setTitle('🚨 Staff Activity Check Audit — Foundership Alert')
        .setDescription(`The **48-Hour Staff Activity Check** has concluded.\nBelow is the audit report of staff members who failed to confirm activity.`)
        .addFields(
            { name: '💼 Total Staff Count', value: `**${staffMembers.size}** Members`, inline: true },
            { name: '✅ Confirmed Active', value: `**${confirmedUserIds.size}** Members`, inline: true },
            { name: '🌴 On Approved LOA', value: `**${loaStaff.length}** Members`, inline: true },
            { name: '🌱 New Staff Grace Period', value: `**${newRecruitStaff.length}** Members`, inline: true }
        )
        .setColor(config.colors.danger)
        .setTimestamp()
        .setFooter({ text: 'FreshlyPlaza Foundership Audit Log', iconURL: guild.iconURL() });

    if (inactiveStaff.length === 0) {
        reportEmbed.addFields({ name: '❌ Inactive Staff (Role Removal Required)', value: '*All staff members confirmed activity!*', inline: false });
    } else {
        // Chunk inactive staff into chunks of <= 1000 characters to prevent Discord 1024 char overflow errors
        const chunks = [];
        let currentChunk = '';
        for (const m of inactiveStaff) {
            const line = `• <@${m.id}> (\`${m.user.tag}\` | ID: \`${m.id}\`)\n`;
            if ((currentChunk + line).length > 950) {
                chunks.push(currentChunk);
                currentChunk = line;
            } else {
                currentChunk += line;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        chunks.forEach((chunk, index) => {
            const fieldTitle = index === 0 
                ? `❌ Inactive Staff (${inactiveStaff.length} Total)` 
                : `❌ Inactive Staff (Continued ${index + 1})`;
            reportEmbed.addFields({ name: fieldTitle, value: chunk, inline: false });
        });
    }

    const hqChannel = guild.channels.cache.get(config.channels.staffHeadquarters) || guild.channels.cache.get(config.channels.modLogs);
    if (hqChannel) {
        await hqChannel.send({
            content: `👑 **FOUNDERSHIP ALERT:** Staff Activity Check Audit Complete!`,
            embeds: [reportEmbed]
        });
    }
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('activity-check')
            .setDescription('Staff Activity Check Suite')
            .addSubcommand(sub =>
                sub.setName('start')
                   .setDescription('Start a mandatory 48-hour Staff Activity Check in #staff-announcements'))
            .addSubcommand(sub =>
                sub.setName('audit')
                   .setDescription('Run instant audit and report inactive staff to Foundership HQ'))
            .addSubcommand(sub =>
                sub.setName('warn-unconfirmed')
                   .setDescription('Post Final Warning in announcements mass pinging all staff who have not responded')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const db = getDb();
        const data = db.getData();

        if (subcommand === 'start') {
            const announcementChannelId = config.channels.staffAnnouncements;
            const targetChannel = interaction.guild.channels.cache.get(announcementChannelId) || interaction.channel;

            const checkMsgContent = `<@&${config.roles.staff}>\n\n**Staff Activity Check**\n\nTo ensure our staff team remains active and engaged, we are conducting a mandatory activity check.\n\nPlease react to this message within **48 hours** to confirm that you wish to remain on the staff team. Failure to react within the allotted time will be considered a voluntary forfeiture of your position, and your staff role may be removed.\n\nIf your role is removed, you will have the ability to submit an appeal to have your position reviewed.\n\nIf you are currently on an approved leave of absence or have notified leadership regarding your inactivity, please contact management.\n\nThank you for your cooperation and commitment to the team.\n\n**— Management Team**`;

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_confirm_activity_check')
                    .setLabel('✅ Confirm Staff Activity')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('btn_view_activity_status')
                    .setLabel('📊 View Reacted & Inactive')
                    .setStyle(ButtonStyle.Secondary)
            );

            const msg = await targetChannel.send({
                content: checkMsgContent,
                components: [confirmRow]
            });

            try {
                await msg.react('✅');
            } catch (e) {}

            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
            const checkRecord = {
                id: (data.activity_checks ? data.activity_checks.length : 0) + 1,
                message_id: msg.id,
                channel_id: targetChannel.id,
                created_at: new Date().toISOString(),
                expires_at: expiresAt,
                confirmed_users: []
            };

            if (!data.activity_checks) data.activity_checks = [];
            data.activity_checks.push(checkRecord);
            db.save();

            // Schedule 48h automatic audit
            setTimeout(() => {
                runActivityAudit(interaction.guild, checkRecord);
            }, 48 * 60 * 60 * 1000);

            return interaction.reply({
                content: `✅ Mandatory **Staff Activity Check** posted in <#${targetChannel.id}>! Automatic audit & Foundership alert scheduled for 48 hours from now.`,
                ephemeral: true
            });
        }

        if (subcommand === 'audit') {
            await interaction.deferReply({ ephemeral: true });

            const checks = data.activity_checks || [];
            const latestCheck = checks[checks.length - 1] || {
                channel_id: config.channels.staffAnnouncements,
                confirmed_users: []
            };

            await runActivityAudit(interaction.guild, latestCheck);
            return interaction.editReply({ content: `✅ Audit report generated and sent to <#${config.channels.staffHeadquarters}>!` });
        }

        if (subcommand === 'warn-unconfirmed') {
            await interaction.deferReply({ ephemeral: true });

            const staffRoleId = config.roles.staff;
            const loaRoleId = config.roles.loa;
            const ignoredUserIds = new Set(config.ignoredUserIds || []);

            try {
                await interaction.guild.members.fetch();
            } catch (e) {
                console.warn('[GATEWAY RATE LIMIT] Using cached members for warning check:', e.message);
            }

            const staffMembers = interaction.guild.members.cache.filter(m => m.roles.cache.has(staffRoleId) && !m.user.bot);

            const checks = data.activity_checks || [];
            const latestCheck = checks[checks.length - 1];
            const confirmedUserIds = new Set((latestCheck && latestCheck.confirmed_users) || []);

            // Check if there's reaction confirmation
            if (latestCheck && latestCheck.channel_id && latestCheck.message_id) {
                try {
                    const ch = interaction.guild.channels.cache.get(latestCheck.channel_id);
                    if (ch) {
                        const msg = await ch.messages.fetch(latestCheck.message_id);
                        const reaction = msg.reactions.cache.get('✅');
                        if (reaction) {
                            const users = await reaction.users.fetch();
                            users.forEach(u => confirmedUserIds.add(u.id));
                        }
                    }
                } catch (e) {}
            }

            const unconfirmedStaff = [];
            staffMembers.forEach(m => {
                if (ignoredUserIds.has(m.id)) return; // Exclude exempt users (SECRET_DEVJED)
                if (m.roles.cache.has(loaRoleId)) return; // Exclude LOA
                if (!confirmedUserIds.has(m.id)) {
                    unconfirmedStaff.push(m);
                }
            });

            if (unconfirmedStaff.length === 0) {
                return interaction.editReply({ content: '🎉 All eligible staff members have confirmed their activity! No warning needed.' });
            }

            const staffAnnounceChannelId = config.channels.staffAnnouncements; // 1509272778711367860
            let targetChannel = interaction.guild.channels.cache.get(staffAnnounceChannelId);
            if (!targetChannel) {
                try {
                    targetChannel = await interaction.guild.channels.fetch(staffAnnounceChannelId);
                } catch (e) {
                    targetChannel = interaction.channel;
                }
            }

            const mentions = unconfirmedStaff.map(m => `<@${m.id}>`).join(' ');

            const warnEmbed = new EmbedBuilder()
                .setTitle('🚨 FINAL WARNING — Staff Activity Check Notice')
                .setDescription(
                    `The following staff members have **NOT** confirmed their activity on the mandatory activity check.\n\n` +
                    `⚠️ **THIS IS YOUR FINAL WARNING.**\n\n` +
                    `Failure to click the confirmation button below or react with ✅ will be treated as voluntary resignation, and **your staff roles will be removed** without further warning.`
                )
                .addFields(
                    {
                        name: `❌ Pending Staff Members (${unconfirmedStaff.length})`,
                        value: unconfirmedStaff.map(m => `• <@${m.id}> (\`${m.user.tag}\`)`).join('\n').slice(0, 1024)
                    },
                    {
                        name: '📌 Action Required',
                        value: 'Click the **✅ Confirm Activity (Final Warning)** button below immediately.'
                    }
                )
                .setColor(config.colors.danger)
                .setFooter({ text: 'FreshlyPlaza Management & Foundership Team', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_confirm_activity_check')
                    .setLabel('✅ Confirm Staff Activity (Final Warning)')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('btn_view_activity_status')
                    .setLabel('📊 View Live Status')
                    .setStyle(ButtonStyle.Secondary)
            );

            const sentMsg = await targetChannel.send({
                content: `⚠️ **FINAL ACTIVITY WARNING — ATTENTION REQUIRED:**\n${mentions}`,
                embeds: [warnEmbed],
                components: [actionRow]
            });

            try {
                await sentMsg.react('✅');
            } catch (e) {}

            return interaction.editReply({
                content: `✅ Final Warning message dispatched to <#${targetChannel.id}> mass pinging **${unconfirmedStaff.length}** pending staff members!\nExempt users like \`SECRET_DEVJED\` and members on LOA were safely skipped.`
            });
        }
    }
}];
