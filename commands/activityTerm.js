const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('activity-term')
            .setDescription('Staff inactivity check management and appeal dockets')
            .addSubcommand(sub =>
                sub.setName('terminate')
                    .setDescription('Terminate a staff member for inactivity in an activity check & preserve roles')
                    .addUserOption(opt => 
                        opt.setName('user')
                            .setDescription('Staff member to terminate')
                            .setRequired(true)
                    )
                    .addStringOption(opt => 
                        opt.setName('reason')
                            .setDescription('Reason for termination (Optional)')
                            .setRequired(false)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('appeal-status')
                    .setDescription('Check the activity termination and appeal status for a user')
                    .addUserOption(opt => 
                        opt.setName('user')
                            .setDescription('User to check appeal status for')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('warn-check')
                    .setDescription('Send an individual FINAL WARNING activity check to a staff member')
                    .addUserOption(opt => 
                        opt.setName('user')
                            .setDescription('Staff member to issue the final warning activity check to')
                            .setRequired(true)
                    )
                    .addIntegerOption(opt => 
                        opt.setName('hours')
                            .setDescription('Hours allowed to confirm (Default: 24)')
                            .setRequired(false)
                    )
            ),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();

            if (sub === 'terminate') {
                const member = interaction.member;
                const isManager = member.roles.cache.has(config.roles.hr) || 
                                  member.roles.cache.has(config.roles.mr) || 
                                  member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                                  member.permissions.has(PermissionFlagsBits.Administrator);

                if (!isManager) {
                    return interaction.reply({ 
                        content: '❌ Only Grandway Shopping Leadership / HR can terminate staff members.', 
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

                const staffRolesToPreserve = [
                    config.roles.staff,
                    config.roles.trainee,
                    config.roles.mr,
                    config.roles.hr,
                    config.roles.supportGeneral,
                    config.roles.supportReport,
                    config.roles.supportManagement,
                    config.roles.supportTechnical,
                    config.roles.supportAppeals,
                    config.roles.shiftLeader,
                    config.roles.trainer,
                    config.roles.greggsWorker,
                    config.roles.baker,
                    config.roles.cashier
                ].filter(Boolean);

                const preservedRoleIds = targetMember.roles.cache
                    .filter(r => staffRolesToPreserve.includes(r.id))
                    .map(r => r.id);

                const rolesToRemove = targetMember.roles.cache.filter(r => 
                    staffRolesToPreserve.includes(r.id) && r.id !== interaction.guild.id
                );

                for (const [, role] of rolesToRemove) {
                    try {
                        await targetMember.roles.remove(role, `Staff Inactivity Termination by ${interaction.user.tag}`);
                    } catch (e) {
                        console.error(`[ACTIVITY TERM] Failed to remove role ${role.name}:`, e.message);
                    }
                }

                const db = getDb();
                const term = await db.createActivityTerm({
                    userId: targetUser.id,
                    userTag: targetUser.tag || targetUser.username,
                    termedBy: interaction.user.id,
                    termedByTag: interaction.user.tag || interaction.user.username,
                    reason,
                    preservedRoles: preservedRoleIds
                });

                const appealUrl = `${config.webDashboardUrl}/appeal?termId=${term.id}&userId=${targetUser.id}`;

                let dmSent = true;
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('⚠️ Grandway Shopping — Staff Activity Termination Notice')
                        .setDescription(`Hello <@${targetUser.id}>,\n\nYou have been **terminated from your staff position** at Grandway Shopping due to:\n> **${reason}**\n\n🛡️ **Preserved Position Records:**\nYour prior rank and staff permissions have been securely archived. If you had an active LOA, technical difficulties, or family emergency, you may appeal this termination to leadership for immediate position reinstatement.\n\nClick the button below to submit your official Activity Termination Appeal.`)
                        .addFields(
                            { name: '📋 Termination Record ID', value: `\`#${term.id}\``, inline: true },
                            { name: '🛡️ Authorized By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '⚖️ Appeal Window', value: '7 Days from Notice', inline: true }
                        )
                        .setColor(config.colors.danger)
                        .setTimestamp()
                        .setFooter({ text: 'Grandway Shopping Leadership & Human Resources' });

                    const appealButtonRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setLabel('⚖️ Submit Activity Appeal')
                            .setStyle(ButtonStyle.Link)
                            .setURL(appealUrl)
                    );

                    await targetUser.send({ embeds: [dmEmbed], components: [appealButtonRow] });
                } catch (dmErr) {
                    dmSent = false;
                }

                const demoteLogChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs || config.channels.manualPunishments);
                if (demoteLogChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle(`📉 Staff Activity Termination — #${term.id}`)
                        .addFields(
                            { name: '👤 Terminated Staff', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                            { name: '🛡️ Enforcing Colleague', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '📋 Reason', value: reason, inline: false },
                            { name: '🎭 Preserved Roles (${preservedRoleIds.length})', value: preservedRoleIds.map(r => `<@&${r}>`).join(', ') || '*None*', inline: false },
                            { name: '📬 User DM Delivered', value: dmSent ? '✅ Yes (Appeal Button Attached)' : '❌ No (DMs Closed)', inline: true }
                        )
                        .setColor(config.colors.danger)
                        .setTimestamp();
                    await demoteLogChannel.send({ embeds: [logEmbed] });
                }

                return interaction.editReply({
                    content: `✅ <@${targetUser.id}> has been terminated for inactivity (Record **#${term.id}**).\n• **Preserved Roles:** ${preservedRoleIds.length} roles recorded for restoration.\n• **DM Notification:** ${dmSent ? '✅ Delivered with Appeal button.' : '⚠️ Failed (User has DMs closed).'}`
                });
            }

            if (sub === 'appeal-status') {
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

            if (sub === 'warn-check') {
                const member = interaction.member;
                const isManager = member.roles.cache.has(config.roles.hr) || 
                                  member.roles.cache.has(config.roles.mr) || 
                                  member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                                  member.permissions.has(PermissionFlagsBits.Administrator);

                if (!isManager) {
                    return interaction.reply({ 
                        content: '❌ Only Grandway Shopping Leadership / HR can issue activity check warnings.', 
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
                    .setTitle('⚠️ Grandway Shopping — FINAL WARNING: Mandatory Staff Activity Check')
                    .setDescription(`Hello <@${targetUser.id}>,\n\n**THIS IS YOUR FINAL WARNING.**\n\nOur records indicate that you failed to respond to the recent mandatory Staff Activity Check. Instead of immediate termination of your position, leadership has granted you **one final opportunity** to confirm your staff activity.\n\nPlease click the button below within **${hours} hours** (<t:${expiresTimestamp}:R> | <t:${expiresTimestamp}:f>) to confirm you wish to retain your position.\n\n⚠️ **Failure to confirm within this final deadline will result in immediate termination of your staff position and role forfeiture without further notice.**`)
                    .addFields(
                        { name: '🛡️ Issued By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '⏳ Final Deadline', value: `<t:${expiresTimestamp}:R>`, inline: true },
                        { name: '📌 Action Required', value: 'Click the **✅ Confirm Activity (Final Warning)** button below to keep your staff role.', inline: false }
                    )
                    .setColor(config.colors.warning)
                    .setFooter({ text: 'Grandway Shopping Management & Foundership Team', iconURL: interaction.guild.iconURL() })
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
                } catch (dmErr) {
                    dmSent = false;
                }

                return interaction.editReply({
                    content: `✅ Final warning activity check sent to <@${targetUser.id}>.\n• **Deadline:** ${hours} Hours (<t:${expiresTimestamp}:R>)\n• **DM Delivered:** ${dmSent ? '✅ Yes' : '⚠️ Failed (User DMs closed).'}`
                });
            }
        }
    }
];
