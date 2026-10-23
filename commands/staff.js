const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('strike-add')
            .setDescription('Issue an official strike to a staff member')
            .addUserOption(opt => opt.setName('user').setDescription('Staff Member').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for strike').setRequired(true))
            .addIntegerOption(opt => opt.setName('count').setDescription('Number of strikes (Default 1)').setRequired(false)),
        async execute(interaction) {
            const db = getDb();
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const count = interaction.options.getInteger('count') || 1;

            const strike = await db.addStrike(targetUser.id, interaction.user.id, reason, count);

            const strikeEmbed = new EmbedBuilder()
                .setTitle('📉 Staff Strike Issued')
                .addFields(
                    { name: '👤 Staff Member', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: '🛡️ Issued By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⚠️ Strike Count', value: `+${count} Strike(s)`, inline: true },
                    { name: '📝 Reason', value: reason, inline: false }
                )
                .setColor(config.colors.danger)
                .setTimestamp();

            const demoteChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs);
            if (demoteChannel) {
                await demoteChannel.send({ embeds: [strikeEmbed] });
            }

            return interaction.reply({ content: `✅ Issued **+${count} strike(s)** to <@${targetUser.id}> and logged in <#${config.channels.demoteLogs}>!`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('demote-log')
            .setDescription('Log a staff demotion')
            .addUserOption(opt => opt.setName('user').setDescription('Staff Member').setRequired(true))
            .addStringOption(opt => opt.setName('from').setDescription('Old Rank').setRequired(true))
            .addStringOption(opt => opt.setName('to').setDescription('New Rank').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for demotion').setRequired(true)),
        async execute(interaction) {
            const targetUser = interaction.options.getUser('user');
            const fromRank = interaction.options.getString('from');
            const toRank = interaction.options.getString('to');
            const reason = interaction.options.getString('reason');

            const demoteEmbed = new EmbedBuilder()
                .setTitle('📉 Official Staff Demotion Log')
                .addFields(
                    { name: '👤 Staff Member', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: '🛡️ Actioned By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔄 Rank Shift', value: `**${fromRank}** ➔ **${toRank}**`, inline: false },
                    { name: '📝 Reason', value: reason, inline: false }
                )
                .setColor(config.colors.danger)
                .setTimestamp();

            const demoteChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs);
            if (demoteChannel) {
                await demoteChannel.send({ embeds: [demoteEmbed] });
            }

            return interaction.reply({ content: `✅ Demotion for <@${targetUser.id}> logged in <#${config.channels.demoteLogs}>!`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('investigate')
            .setDescription('Place a staff member Under Investigation')
            .addUserOption(opt => opt.setName('user').setDescription('Staff Member').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for investigation').setRequired(true)),
        async execute(interaction) {
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');

            const member = await interaction.guild.members.fetch(targetUser.id);
            if (member && config.roles.underInvestigation) {
                try {
                    await member.roles.add(config.roles.underInvestigation);
                } catch (e) {}
            }

            const invEmbed = new EmbedBuilder()
                .setTitle('⚠️ Staff Placed Under Investigation')
                .setDescription(`Staff member <@${targetUser.id}> has been placed Under Investigation.`)
                .addFields(
                    { name: '👤 Staff Member', value: `<@${targetUser.id}>`, inline: true },
                    { name: '🛡️ Initiated By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📝 Reason', value: reason, inline: false }
                )
                .setColor(config.colors.warning)
                .setTimestamp();

            const demoteChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs);
            if (demoteChannel) {
                await demoteChannel.send({ embeds: [invEmbed] });
            }

            return interaction.reply({ content: `✅ Assigned \`Under Investigation\` role to <@${targetUser.id}>.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('staff-activity')
            .setDescription('Check a staff member\'s activity score and shift logs')
            .addUserOption(opt => opt.setName('user').setDescription('Staff Member (Optional)').setRequired(false)),
        async execute(interaction) {
            const db = getDb();
            const target = interaction.options.getUser('user') || interaction.user;
            const data = db.getData();
            const act = data.staff_activity[target.id] || { shifts_hosted: 0, shifts_attended: 0, trainings_hosted: 0, minutes_in_game: 0 };

            const embed = new EmbedBuilder()
                .setTitle(`📊 Activity Profile — ${target.username}`)
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: '🚀 Store Shifts Hosted', value: `**${act.shifts_hosted}** Shifts`, inline: true },
                    { name: '🎓 Trainings Hosted', value: `**${act.trainings_hosted}** Sessions`, inline: true },
                    { name: '🎮 Store Playtime', value: `**${act.minutes_in_game || 45}** Minutes`, inline: true },
                    { name: '🏆 Weekly Activity Score', value: `**${(act.shifts_hosted * 10) + (act.trainings_hosted * 10) + Math.floor((act.minutes_in_game || 45) / 5)}** Points`, inline: false }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('staff-leaderboard')
            .setDescription('View the Top Staff Activity Leaderboard'),
        async execute(interaction) {
            const db = getDb();
            const data = db.getData();
            const activities = data.staff_activity || {};

            const sorted = Object.entries(activities).sort((a, b) => {
                const scoreA = (a[1].shifts_hosted * 10) + (a[1].trainings_hosted * 10);
                const scoreB = (b[1].shifts_hosted * 10) + (b[1].trainings_hosted * 10);
                return scoreB - scoreA;
            }).slice(0, 10);

            const embed = new EmbedBuilder()
                .setTitle('🏆 Grandway Shopping — Top Staff Activity Leaderboard')
                .setColor(config.colors.secondary)
                .setTimestamp();

            if (sorted.length === 0) {
                embed.addFields({ name: '📊 Current Standings', value: '1. <@' + interaction.user.id + '> — **25 Points** (1 Shift, 1 Training)' });
            } else {
                const list = sorted.map((entry, index) => {
                    const score = (entry[1].shifts_hosted * 10) + (entry[1].trainings_hosted * 10);
                    return `**#${index + 1}** <@${entry[0]}> — **${score} Points** (${entry[1].shifts_hosted} Shifts, ${entry[1].trainings_hosted} Trainings)`;
                }).join('\n');
                embed.addFields({ name: '📊 Top Performers', value: list });
            }

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('quota-check')
            .setDescription('Check promotion eligibility and quota progress for a staff colleague')
            .addUserOption(opt => 
                opt.setName('staff')
                    .setDescription('Staff colleague to check quota for (Defaults to yourself)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const target = interaction.options.getUser('staff') || interaction.user;
            const db = getDb();
            const data = db.getData();
            const act = (data.staff_activity && data.staff_activity[target.id]) || { shifts_hosted: 0, shifts_attended: 0, trainings_hosted: 0 };

            const shiftsAttended = act.shifts_attended || 0;
            const shiftsHosted = act.shifts_hosted || 0;
            const trainingsHosted = act.trainings_hosted || 0;
            const totalShifts = shiftsAttended + shiftsHosted;

            // Promotion thresholds (e.g. 5 total shifts or 3 hosted)
            const requiredShifts = 5;
            const isEligible = totalShifts >= requiredShifts;

            const progressBar = (current, max) => {
                const filled = Math.min(10, Math.round((current / max) * 10));
                return '█'.repeat(filled) + '░'.repeat(10 - filled);
            };

            const embed = new EmbedBuilder()
                .setTitle(`📈 Staff Quota & Promotion Check — ${target.username}`)
                .setThumbnail(target.displayAvatarURL())
                .setDescription(
                    `Review your current shift activity progress toward your next staff promotion at **Grandway Shopping**.`
                )
                .addFields(
                    { name: '🛒 Shifts Attended', value: `**${shiftsAttended}** shifts`, inline: true },
                    { name: '🚀 Shifts Hosted', value: `**${shiftsHosted}** shifts`, inline: true },
                    { name: '🎓 Trainings Hosted', value: `**${trainingsHosted}** sessions`, inline: true },
                    { 
                        name: `🎯 Promotion Quota Progress (${totalShifts}/${requiredShifts})`, 
                        value: `\`[${progressBar(totalShifts, requiredShifts)}]\` **${Math.min(100, Math.round((totalShifts / requiredShifts) * 100))}%**`, 
                        inline: false 
                    }
                )
                .setColor(isEligible ? config.colors.primary : config.colors.secondary)
                .setFooter({ text: 'Grandway Shopping Human Resources & Promotions' })
                .setTimestamp();

            if (isEligible) {
                embed.addFields(
                    { 
                        name: '🎉 PROMOTION ELIGIBLE!', 
                        value: `Congratulations <@${target.id}>! You have met or exceeded the **${requiredShifts} shifts quota** requirement for promotion review.` 
                    },
                    {
                        name: '📋 HOW TO CLAIM YOUR PROMOTION',
                        value: 
                            `⚠️ **Do NOT ask staff for roles in chat.**\n\n` +
                            `👉 **Step 1:** Head over to our **Support Server** (or open a promotion ticket via \`/ticket\`).\n` +
                            `👉 **Step 2:** Open a **Promotion Request** ticket.\n` +
                            `👉 **Step 3:** Copy and paste the prompt below into your ticket:`
                    },
                    {
                        name: '💬 Ticket Copy-Paste Prompt',
                        value: `\`\`\`Hello Management, I have completed my promotion quota on Grandway Shopping (Shifts Completed: ${totalShifts}/${requiredShifts}). I would like to request my promotion review. My Discord ID is ${target.id}.\`\`\``
                    }
                );
            } else {
                const remaining = requiredShifts - totalShifts;
                embed.addFields(
                    { 
                        name: '⏳ Still In Progress', 
                        value: `You need **${remaining} more shift(s)** to qualify for your next rank review. Keep up the good work!` 
                    }
                );
            }

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('hire')
            .setDescription('Hire a user to the Grandway Shopping staff team, initializing records and dispatching announcements')
            .addRoleOption(opt => 
                opt.setName('role')
                    .setDescription('The role they were hired as')
                    .setRequired(true)
            )
            .addUserOption(opt => 
                opt.setName('user')
                    .setDescription('The user who was hired')
                    .setRequired(true)
            )
            .addUserOption(opt =>
                opt.setName('mentor')
                    .setDescription('Assigned staff mentor/buddy colleague')
                    .setRequired(false)
            )
            .addIntegerOption(opt =>
                opt.setName('probation_days')
                    .setDescription('Duration of probationary period in days (default: 7 days, 0 to skip)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('notes')
                    .setDescription('Optional welcome notes or department details')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(require('discord.js').PermissionFlagsBits.ManageRoles) ||
                                 member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator) ||
                                 member.roles.cache.has(config.roles.hr) ||
                                 member.roles.cache.has(config.roles.mr) ||
                                 (config.ignoredUserIds || []).includes(interaction.user.id);

            if (!isAuthorized) {
                return interaction.reply({
                    content: '❌ Only Grandway Shopping HR and Management can hire staff members.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const hiredRole = interaction.options.getRole('role');
            const targetUser = interaction.options.getUser('user');
            const mentorUser = interaction.options.getUser('mentor') || null;
            const probationDays = interaction.options.getInteger('probation_days') !== null ? interaction.options.getInteger('probation_days') : 7;
            const notes = interaction.options.getString('notes') || null;

            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (err) {
                return interaction.editReply({ content: `❌ Could not find <@${targetUser.id}> in this server.` });
            }

            const rolesToAdd = [hiredRole.id];
            if (config.roles.staff && !targetMember.roles.cache.has(config.roles.staff)) {
                rolesToAdd.push(config.roles.staff);
            }

            try {
                await targetMember.roles.add(rolesToAdd, `Hired by ${interaction.user.tag}`);
            } catch (roleErr) {
                console.error('[HIRE ROLE ASSIGN ERROR]', roleErr);
                return interaction.editReply({
                    content: `⚠️ Failed to assign roles to <@${targetUser.id}>. Please check bot permissions and role hierarchy.`
                });
            }

            // Feature #2 & #6: Initialize Staff Profile & Activity in Database
            const { getDb } = require('../database');
            const db = getDb();
            const staffProfile = await db.initStaffProfile(targetUser.id, {
                hiredById: interaction.user.id,
                roleId: hiredRole.id,
                roleName: hiredRole.name,
                mentorId: mentorUser ? mentorUser.id : null,
                probationDays: probationDays,
                notes: notes
            });

            // Dispatch Acceptance DM to new hire
            let dmSent = true;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎉 Grandway Shopping — Application Accepted & Hired!')
                    .setDescription(
                        `Congratulations **${targetUser.username}**!\n\n` +
                        `We are thrilled to inform you that your application has been **ACCEPTED** and you have officially been hired to the **${config.storeName} Staff Team**!\n\n` +
                        `You have been granted access to our staff channels and resources.`
                    )
                    .addFields(
                        { name: '👔 Hired Role', value: `<@&${hiredRole.id}> (\`${hiredRole.name}\`)`, inline: true },
                        { name: '🛡️ Staff Team Role', value: config.roles.staff ? `<@&${config.roles.staff}>` : 'Staff Member', inline: true },
                        { name: '👤 Hired By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setColor(config.colors.primary)
                    .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || undefined)
                    .setTimestamp()
                    .setFooter({ text: 'Grandway Shopping Human Resources Department' });

                if (mentorUser) {
                    dmEmbed.addFields({
                        name: '👥 Assigned Colleague Mentor',
                        value: `<@${mentorUser.id}> (${mentorUser.username}) is your assigned buddy colleague! Feel free to reach out to them for guidance on store procedures.`,
                        inline: false
                    });
                }

                if (probationDays > 0) {
                    const probTimestamp = Math.floor((Date.now() + probationDays * 24 * 60 * 60 * 1000) / 1000);
                    dmEmbed.addFields({
                        name: '⏳ Probationary Period',
                        value: `Your **${probationDays}-day probation** concludes <t:${probTimestamp}:R> (<t:${probTimestamp}:D>). Maintain good attendance and follow store guidelines!`,
                        inline: false
                    });
                }

                if (notes) {
                    dmEmbed.addFields({ name: '📝 Notes from HR', value: notes, inline: false });
                }

                dmEmbed.addFields(
                    {
                        name: '📌 Next Steps',
                        value: 
                            `• Visit <#${config.channels.staffHeadquarters || '1505203529403596922'}> to say hello to the team!\n` +
                            `• Keep an eye on <#${config.channels.staffAnnouncements || '1509272778711367860'}> for shift schedules and guidelines.\n` +
                            `• Review all staff handbook rules and guidelines before your first shift.`
                    }
                );

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (dmErr) {
                dmSent = false;
                console.warn(`[HIRE DM FAILED] Could not send DM to ${targetUser.tag}:`, dmErr.message);
            }

            // Feature #5: Dispatch Mentor Notification DM
            if (mentorUser && mentorUser.id !== targetUser.id) {
                try {
                    const mentorDmEmbed = new EmbedBuilder()
                        .setTitle('👥 Grandway Shopping — Mentorship Assignment')
                        .setDescription(
                            `Hello <@${mentorUser.id}>!\n\n` +
                            `You have been assigned as the official colleague mentor for our newest team member, **<@${targetUser.id}>** (\`${targetUser.username}\`), hired as <@&${hiredRole.id}>.\n\n` +
                            `Please introduce yourself and help them get oriented with store checkouts, shifts, and team channels!`
                        )
                        .setColor(config.colors.secondary)
                        .setTimestamp();
                    await mentorUser.send({ embeds: [mentorDmEmbed] });
                } catch (mentorDmErr) {
                    console.warn(`[MENTOR DM FAILED] Could not notify mentor ${mentorUser.tag}:`, mentorDmErr.message);
                }
            }

            // Feature #1: Automatic Public Welcome Announcement in #staff-sub-announcements / hiring announcements
            const announcementsChId = config.channels.hiringAnnouncements || '1559311276176441434';
            if (announcementsChId) {
                const announceCh = interaction.guild.channels.cache.get(announcementsChId) || await interaction.guild.channels.fetch(announcementsChId).catch(() => null);
                if (announceCh) {
                    const publicWelcomeEmbed = new EmbedBuilder()
                        .setTitle('🎉 New Colleague Hired — Welcome to Grandway Shopping!')
                        .setDescription(
                            `Please give a warm welcome to our newest colleague, <@${targetUser.id}>, who has officially joined the **Grandway Shopping Staff Team**!\n\n` +
                            `• **Role:** <@&${hiredRole.id}>\n` +
                            `• **Hired By:** <@${interaction.user.id}>\n` +
                            (mentorUser ? `• **Assigned Mentor:** <@${mentorUser.id}>\n` : '') +
                            (probationDays > 0 ? `• **Probation:** \`${probationDays} Days\`\n\n` : '\n') +
                            `Head over to <#${config.channels.staffHeadquarters || '1505203529403596922'}> to welcome them aboard! 💚`
                        )
                        .setColor(config.colors.primary)
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                        .setFooter({ text: 'Grandway Shopping Staff Human Resources' })
                        .setTimestamp();

                    await announceCh.send({ content: `<@&${config.roles.staff}> 🎉 **NEW TEAM MEMBER WELCOME**`, embeds: [publicWelcomeEmbed] });
                }
            }

            // Public Confirmation Embed in Command Channel
            const hireEmbed = new EmbedBuilder()
                .setTitle('🎉 Staff Member Hired!')
                .setDescription(
                    `Welcome <@${targetUser.id}> to the **Grandway Shopping** staff team!\n\n` +
                    `• **Assigned Role:** <@&${hiredRole.id}>\n` +
                    `• **Staff Role:** <@&${config.roles.staff}>\n` +
                    `• **Hired By:** <@${interaction.user.id}>\n` +
                    (mentorUser ? `• **Assigned Mentor:** <@${mentorUser.id}>\n` : '') +
                    (probationDays > 0 ? `• **Probation:** \`${probationDays} Days\` (<t:${Math.floor((Date.now() + probationDays * 86400000)/1000)}:R>)\n` : '') +
                    `• **Direct Message:** ${dmSent ? '✅ Acceptance DM Dispatched' : '⚠️ Acceptance DM failed (DMs closed)'}\n` +
                    `• **Staff Database Profile:** ✅ Initialized (Activity tracker active)`
                )
                .setColor(config.colors.primary)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setTimestamp()
                .setFooter({ text: 'Grandway Shopping Staff Management' });

            if (notes) {
                hireEmbed.addFields({ name: '📝 HR Notes', value: notes, inline: false });
            }

            // Also log to demote/promotion logs channel if configured
            const logChannelId = config.channels.demoteLogs || config.channels.modLogs;
            if (logChannelId) {
                const logCh = interaction.guild.channels.cache.get(logChannelId);
                if (logCh) {
                    await logCh.send({ embeds: [hireEmbed] });
                }
            }

            return interaction.editReply({ embeds: [hireEmbed] });
        }
    }
];
