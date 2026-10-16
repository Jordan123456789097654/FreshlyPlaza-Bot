const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('activity-term')
            .setDescription('Terminate a staff member for inactivity in an activity check, send DM with appeal, & preserve roles')
            .addUserOption(opt => 
                opt.setName('user')
                    .setDescription('Staff member to terminate')
                    .setRequired(true)
            )
            .addStringOption(opt => 
                opt.setName('reason')
                    .setDescription('Reason for termination (Optional)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) || 
                              member.roles.cache.has(config.roles.mr) || 
                              member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                              member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isManager) {
                return interaction.reply({ 
                    content: '❌ Only FreshlyPlaza Leadership / HR can terminate staff members.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Failure to confirm participation in mandatory 48-Hour Staff Activity Check';

            if ((config.ignoredUserIds || []).includes(targetUser.id)) {
                return interaction.editReply({ 
                    content: `🛡️ **Exempt User:** <@${targetUser.id}> is protected from activity terminations by leadership exemption policy.` 
                });
            }

            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (e) {
                return interaction.editReply({ content: `❌ Member <@${targetUser.id}> not found in this server.` });
            }

            if (!targetMember) {
                return interaction.editReply({ content: `❌ Member <@${targetUser.id}> not found.` });
            }

            // 1. PRESERVE ROLES (all non-@everyone, non-managed role IDs)
            const preservedRoleIds = targetMember.roles.cache
                .filter(r => r.id !== interaction.guild.id && !r.managed)
                .map(r => r.id);

            // 2. RECORD IN DATABASE
            const db = getDb();
            const term = await db.addActivityTerm(targetUser.id, targetUser.tag, interaction.user.id, reason, preservedRoleIds);

            // 3. REMOVE ALL ROLES AT OR ABOVE STAFF MEMBER POSITION
            const staffRole = interaction.guild.roles.cache.get(config.roles.staff);
            const staffPos = staffRole ? staffRole.position : 0;
            const botHighestPos = interaction.guild.members.me ? interaction.guild.members.me.roles.highest.position : 999;

            const rolesToRemove = targetMember.roles.cache.filter(r => 
                r.id !== interaction.guild.id &&
                !r.managed &&
                r.position >= staffPos &&
                r.position < botHighestPos
            );

            if (rolesToRemove.size > 0) {
                try {
                    await targetMember.roles.remove(rolesToRemove);
                    console.log(`[ACTIVITY TERM] Removed ${rolesToRemove.size} roles at or above Staff Member:`, rolesToRemove.map(r => r.name).join(', '));
                } catch (e) {
                    console.error('[ACTIVITY TERM] Failed to remove roles:', e);
                }
            }

            // 4. SEND DM TO TERMED USER WITH APPEAL BUTTON
            const expiresTimestamp = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);
            const dmEmbed = new EmbedBuilder()
                .setTitle('⚠️ FreshlyPlaza — Notice of Staff Termination')
                .setDescription(`Hello <@${targetUser.id}>,\n\nThis is an official notice that your staff position at **FreshlyPlaza** has been **terminated** due to inactivity during our mandatory Staff Activity Check.\n\nYour staff roles have been removed from the server.`)
                .addFields(
                    { name: '📋 Termination Reason', value: reason, inline: false },
                    { name: '🛡️ Actioned By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🆔 Term Record ID', value: `#${term.id}`, inline: true },
                    { name: '⏳ Appeal Deadline (30 Days)', value: `You have **30 days** to submit an appeal (<t:${expiresTimestamp}:R> | <t:${expiresTimestamp}:D>). After 30 days, forfeiture becomes permanent.`, inline: false },
                    { name: '⚖️ Appeal Policy', value: 'If your appeal is approved by leadership, your staff position and former server roles will be automatically reinstated.', inline: false }
                )
                .setColor(config.colors.danger)
                .setFooter({ text: 'FreshlyPlaza Management Team', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            const appealRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`btn_appeal_activity_${term.id}`)
                    .setLabel('📝 Submit Activity Appeal')
                    .setStyle(ButtonStyle.Primary)
            );

            let dmSent = true;
            try {
                await targetUser.send({ embeds: [dmEmbed], components: [appealRow] });
            } catch (e) {
                dmSent = false;
            }

            // 5. LOG TO DEMOTE LOGS CHANNEL
            const demoteLogChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs) || 
                                     interaction.guild.channels.cache.get(config.channels.punishmentLogs);
            if (demoteLogChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`📉 Staff Activity Termination — #${term.id}`)
                    .addFields(
                        { name: '👤 Termed Staff', value: `<@${targetUser.id}> (\`${targetUser.tag}\` | \`${targetUser.id}\`)`, inline: false },
                        { name: '🛡️ Actioned By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📋 Reason', value: reason, inline: false },
                        { name: '🎭 Preserved Roles', value: preservedRoleIds.map(r => `<@&${r}>`).join(', ') || '*None*', inline: false },
                        { name: '📬 DM Status', value: dmSent ? '✅ DM Sent with Appeal Button' : '⚠️ DM Failed (DMs Closed)', inline: true }
                    )
                    .setColor(config.colors.danger)
                    .setTimestamp();
                await demoteLogChannel.send({ embeds: [logEmbed] });
            }

            return interaction.editReply({
                content: `✅ <@${targetUser.id}> has been terminated for inactivity (Record **#${term.id}**).\n• **Preserved Roles:** ${preservedRoleIds.length} roles recorded for restoration.\n• **DM Notification:** ${dmSent ? '✅ Delivered with Appeal button.' : '⚠️ Failed (User has DMs closed).'}`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('activity-appeal-status')
            .setDescription('Check the activity termination and appeal status for a user')
            .addUserOption(opt => 
                opt.setName('user')
                    .setDescription('User to check appeal status for')
                    .setRequired(true)
            ),
        async execute(interaction) {
            const targetUser = interaction.options.getUser('user');
            const db = getDb();
            const term = await db.getLatestActivityTermByUser(targetUser.id);

            if (!term) {
                return interaction.reply({ 
                    content: `ℹ️ No activity termination record found for <@${targetUser.id}>.`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📋 Activity Term & Appeal Status — #${term.id}`)
                .addFields(
                    { name: '👤 Staff Member', value: `<@${term.user_id}>`, inline: true },
                    { name: '🛡️ Termed By', value: `<@${term.termed_by}>`, inline: true },
                    { name: '📊 Appeal Status', value: `\`${term.appeal_status}\``, inline: true },
                    { name: '📋 Termination Reason', value: term.reason, inline: false },
                    { name: '🎭 Preserved Roles (${term.preserved_roles.length})', value: term.preserved_roles.map(r => `<@&${r}>`).join(', ') || '*None*', inline: false }
                )
                .setColor(term.appeal_status === 'ACCEPTED' ? config.colors.primary : config.colors.secondary)
                .setTimestamp();

            if (term.actioned_by) {
                embed.addFields({ name: '⚖️ Appeal Actioned By', value: `<@${term.actioned_by}>`, inline: true });
            }

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('activity-warn-check')
            .setDescription('Send an individual FINAL WARNING activity check to a staff member instead of terminating them')
            .addUserOption(opt => 
                opt.setName('user')
                    .setDescription('Staff member to issue the final warning activity check to')
                    .setRequired(true)
            )
            .addIntegerOption(opt => 
                opt.setName('hours')
                    .setDescription('Hours allowed to confirm (Default: 24)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) || 
                              member.roles.cache.has(config.roles.mr) || 
                              member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                              member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isManager) {
                return interaction.reply({ 
                    content: '❌ Only FreshlyPlaza Leadership / HR can issue activity check warnings.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('user');
            const hours = interaction.options.getInteger('hours') || 24;

            if ((config.ignoredUserIds || []).includes(targetUser.id)) {
                return interaction.editReply({ 
                    content: `🛡️ **Exempt User:** <@${targetUser.id}> is exempt from activity checks (SECRET_DEVJED exemption policy).` 
                });
            }

            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (e) {
                return interaction.editReply({ content: `❌ Member <@${targetUser.id}> not found in this server.` });
            }

            if (!targetMember) {
                return interaction.editReply({ content: `❌ Member <@${targetUser.id}> not found.` });
            }

            const expiresTimestamp = Math.floor((Date.now() + hours * 60 * 60 * 1000) / 1000);

            const warnEmbed = new EmbedBuilder()
                .setTitle('⚠️ FreshlyPlaza — FINAL WARNING: Mandatory Staff Activity Check')
                .setDescription(`Hello <@${targetUser.id}>,\n\n**THIS IS YOUR FINAL WARNING.**\n\nOur records indicate that you failed to respond to the recent mandatory Staff Activity Check. Instead of immediate termination of your position, leadership has granted you **one final opportunity** to confirm your staff activity.\n\nPlease click the button below within **${hours} hours** (<t:${expiresTimestamp}:R> | <t:${expiresTimestamp}:f>) to confirm you wish to retain your position.\n\n⚠️ **Failure to confirm within this final deadline will result in immediate termination of your staff position and role forfeiture without further notice.**`)
                .addFields(
                    { name: '🛡️ Issued By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏳ Final Deadline', value: `<t:${expiresTimestamp}:R>`, inline: true },
                    { name: '📌 Action Required', value: 'Click the **✅ Confirm Activity (Final Warning)** button below to keep your staff role.', inline: false }
                )
                .setColor(config.colors.warning)
                .setFooter({ text: 'FreshlyPlaza Management & Foundership Team', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_confirm_warning_check')
                    .setLabel('✅ Confirm Activity (Final Warning)')
                    .setStyle(ButtonStyle.Success)
            );

            let dmSent = true;
            try {
                await targetUser.send({ embeds: [warnEmbed], components: [confirmRow] });
            } catch (e) {
                dmSent = false;
            }

            // Save record to DB
            const db = getDb();
            const data = db.getData();
            if (!data.activity_warning_checks) data.activity_warning_checks = [];
            data.activity_warning_checks.push({
                user_id: targetUser.id,
                issued_by: interaction.user.id,
                issued_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
                status: 'PENDING',
                dm_sent: dmSent
            });
            db.save();

            // Also log to demote/mod logs
            const logChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs) || 
                               interaction.guild.channels.cache.get(config.channels.modLogs);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('⚠️ Final Warning Activity Check Issued')
                    .addFields(
                        { name: '👤 Staff Member', value: `<@${targetUser.id}> (\`${targetUser.tag}\` | \`${targetUser.id}\`)`, inline: false },
                        { name: '🛡️ Issued By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '⏳ Window', value: `${hours} Hours (<t:${expiresTimestamp}:R>)`, inline: true },
                        { name: '📬 DM Status', value: dmSent ? '✅ DM Delivered with Confirmation Button' : '⚠️ User DMs closed', inline: false }
                    )
                    .setColor(config.colors.warning)
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
            }

            return interaction.editReply({
                content: `✅ Final Warning Activity Check dispatched to <@${targetUser.id}>!\n• **Deadline:** ${hours} Hours (<t:${expiresTimestamp}:R>)\n• **DM Delivery:** ${dmSent ? '✅ Successfully delivered to user DMs with confirmation button.' : '⚠️ Direct message failed (user has DMs closed).'}`
            });
        }
    }
];
