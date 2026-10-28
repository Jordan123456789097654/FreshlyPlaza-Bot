const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('training-announce')
            .setDescription('Announce an official staff training session')
            .addStringOption(opt => 
                opt.setName('type')
                    .setDescription('Training Type')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Store Colleague (Trainee)', value: 'Store Colleague' },
                        { name: 'Cashier & Customer Service', value: 'Cashier & Customer Service' },
                        { name: 'Store Security & Loss Prevention', value: 'Store Security' },
                        { name: 'Senior Colleague / Supervisor', value: 'Senior Colleague' }
                    )
            )
            .addStringOption(opt => opt.setName('time').setDescription('Scheduled Time (e.g. 6:00 PM EST or in 30 minutes)').setRequired(true))
            .addUserOption(opt => opt.setName('cohost').setDescription('Co-Host (Optional)').setRequired(false))
            .addStringOption(opt => opt.setName('link').setDescription('Training Center Game Link (Optional)').setRequired(false)),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const type = interaction.options.getString('type');
            const time = interaction.options.getString('time');
            const cohost = interaction.options.getUser('cohost');
            const trainingLink = interaction.options.getString('link') || config.robloxGameLink;

            const res = await db.run(
                `INSERT INTO trainings (host_id, cohost_id, type, status) VALUES (?, ?, ?, 'ACTIVE')`,
                [interaction.user.id, cohost ? cohost.id : null, type]
            );

            const { formatWorldTime, parseScheduledTime } = require('../utils/timeFormat');
            const parsedTarget = parseScheduledTime(time, new Date());
            const trainingTargetDate = parsedTarget || new Date();
            const worldTime = formatWorldTime(trainingTargetDate);

            const statedDisplay = parsedTarget
                ? `${time} &bull; <t:${worldTime.unixSec}:F> (<t:${worldTime.unixSec}:R>)`
                : time;

            const embed = new EmbedBuilder()
                .setTitle(`🎓 Grandway Shopping — ${type} Training Session`)
                .setDescription(
                    `An official training session for **${type}** has been scheduled!\n` +
                    `All eligible trainees and applicants should arrive at the training center on time.`
                )
                .addFields(
                    { name: '👤 Training Host', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '👥 Training Co-Host', value: cohost ? `<@${cohost.id}>` : '*None*', inline: true },
                    { name: '⏰ Stated Time', value: statedDisplay, inline: true },
                    { name: '🆔 Session ID', value: `#${res.lastID}`, inline: true },
                    { name: '🔗 Training Center', value: `[Join Training Center](${trainingLink})`, inline: false }
                );

            if (worldTime && worldTime.worldTimesList) {
                embed.addFields({
                    name: parsedTarget ? '🌐 Global Timezones (Session Start Time)' : '🌐 Global Timezones (Announced At)',
                    value: worldTime.worldTimesList,
                    inline: false
                });
            }

            embed.setColor(config.colors.primary)
                .setFooter({ text: 'Grandway Shopping HR & Training Academy', iconURL: interaction.guild.iconURL() })
                .setTimestamp();

            const joinRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('🎓 Join Training Center')
                    .setStyle(ButtonStyle.Link)
                    .setURL(trainingLink)
            );

            const targetChannelId = config.channels.trainingSessions;
            let targetChannel = interaction.guild.channels.cache.get(targetChannelId);
            if (!targetChannel) {
                try {
                    targetChannel = await interaction.guild.channels.fetch(targetChannelId);
                } catch (e) {
                    targetChannel = interaction.channel;
                }
            }

            if (targetChannel) {
                const msg = await targetChannel.send({
                    content: `<@&${config.roles.trainingPing}> <@&${config.roles.trainee}> 📢 **TRAINING SESSION SCHEDULED!**`,
                    embeds: [embed],
                    components: [joinRow]
                });
                await db.run(`UPDATE trainings SET message_id = ? WHERE id = ?`, [msg.id, res.lastID]);
            }

            return interaction.editReply({ content: `✅ Training session **#${res.lastID}** posted in <#${targetChannel ? targetChannel.id : config.channels.trainingSessions}>!` });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('training-pass')
            .setDescription('Pass a trainee in a training session & send DM')
            .addUserOption(opt => opt.setName('trainee').setDescription('Trainee User').setRequired(true))
            .addStringOption(opt => opt.setName('notes').setDescription('Notes / Performance comments').setRequired(false)),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const trainee = interaction.options.getUser('trainee');
            const notes = interaction.options.getString('notes') || 'Passed all training requirements successfully.';

            // Assign staff role if configured and remove trainee role
            let roleAssigned = false;
            try {
                const member = await interaction.guild.members.fetch(trainee.id);
                if (member) {
                    if (config.roles.staff) await member.roles.add(config.roles.staff);
                    if (config.roles.trainee) await member.roles.remove(config.roles.trainee);
                    roleAssigned = true;
                }
            } catch (e) {}

            // Send congratulations DM
            let dmSent = false;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎉 Grandway Shopping — Congratulations, You Passed Training!')
                    .setDescription(`Hello <@${trainee.id}>,\n\nYou have officially **PASSED** your training session at **Grandway Shopping**!\n\nWelcome to the team! You may now begin attending store shifts, assisting customers, and working duty stations.`)
                    .addFields(
                        { name: '🛡️ Evaluator', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📝 Performance Notes', value: notes, inline: false }
                    )
                    .setColor(config.colors.primary)
                    .setFooter({ text: 'Grandway Shopping HR & Training Academy', iconURL: interaction.guild.iconURL() })
                    .setTimestamp();

                await trainee.send({ embeds: [dmEmbed] });
                dmSent = true;
            } catch (e) {}

            // Auto-Rank Trainee in Roblox Group
            let robloxRanked = false;
            let robloxRoleName = null;
            try {
                const RobloxManager = require('../utils/robloxManager');
                const verif = await db.getVerification(trainee.id);
                if (verif && verif.roblox_id) {
                    const roles = await RobloxManager.getGroupRoles();
                    const targetRole = roles.find(r => r.name.toLowerCase().includes('junior store colleague') || r.rank === 8);
                    if (targetRole) {
                        const rankRes = await RobloxManager.setRank(verif.roblox_id, targetRole.id);
                        if (rankRes.success) {
                            robloxRanked = true;
                            robloxRoleName = targetRole.name;
                        }
                    }
                }
            } catch (e) {
                console.error('[TRAINING PASS ROBLOX SYNC]', e);
            }

            const logChannelId = config.channels.trainingLogs;
            let logChannel = interaction.guild.channels.cache.get(logChannelId);
            if (!logChannel) {
                try {
                    logChannel = await interaction.guild.channels.fetch(logChannelId);
                } catch (e) {}
            }

            if (logChannel) {
                const passEmbed = new EmbedBuilder()
                    .setTitle('🎉 Trainee Pass & Promotion Log')
                    .addFields(
                        { name: '👤 Trainee', value: `<@${trainee.id}> (\`${trainee.tag}\`)`, inline: true },
                        { name: '🛡️ Evaluator / Host', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📊 Status', value: '✅ PASSED', inline: true },
                        { name: '📝 Notes', value: notes, inline: false },
                        { name: '📬 Trainee DM', value: dmSent ? '✅ DM Delivered' : '⚠️ User DMs closed', inline: true },
                        { name: '🎭 Staff Role', value: roleAssigned ? '✅ Added @Staff Member' : '⚠️ Role not modified', inline: true },
                        { name: '🎮 Roblox Group Rank', value: robloxRanked ? `✅ Ranked to **${robloxRoleName}**` : 'ℹ️ Not linked or already ranked', inline: false }
                    )
                    .setColor(config.colors.primary)
                    .setTimestamp();
                await logChannel.send({ embeds: [passEmbed] });
            }

            return interaction.editReply({ 
                content: `✅ Successfully passed <@${trainee.id}>!\n• **DM Notification:** ${dmSent ? '✅ Delivered' : '⚠️ User DMs closed'}\n• **Discord Role:** ${roleAssigned ? '✅ Added @Staff Member' : '⚠️ Not modified'}\n• **Roblox Group Rank:** ${robloxRanked ? `✅ Ranked to **${robloxRoleName}**` : 'ℹ️ (Unchanged / unverified)'}\n• **Logged:** <#${config.channels.trainingLogs}>` 
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('training-fail')
            .setDescription('Fail a trainee in a training session & send DM')
            .addUserOption(opt => opt.setName('trainee').setDescription('Trainee User').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for failing').setRequired(true)),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const trainee = interaction.options.getUser('trainee');
            const reason = interaction.options.getString('reason');

            // Send encouragement / fail feedback DM
            let dmSent = false;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('📚 Grandway Shopping — Training Session Notice')
                    .setDescription(`Hello <@${trainee.id}>,\n\nUnfortunately, you did not pass your training session today at **Grandway Shopping**.\nDon't be discouraged! You are encouraged to review the employee guide and re-attempt during the next open training session.`)
                    .addFields(
                        { name: '🛡️ Evaluator', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📝 Feedback / Reason', value: reason, inline: false }
                    )
                    .setColor(config.colors.danger)
                    .setFooter({ text: 'Grandway Shopping HR & Training Academy' })
                    .setTimestamp();

                await trainee.send({ embeds: [dmEmbed] });
                dmSent = true;
            } catch (e) {}

            const logChannelId = config.channels.trainingLogs;
            let logChannel = interaction.guild.channels.cache.get(logChannelId);
            if (!logChannel) {
                try {
                    logChannel = await interaction.guild.channels.fetch(logChannelId);
                } catch (e) {}
            }

            if (logChannel) {
                const failEmbed = new EmbedBuilder()
                    .setTitle('❌ Trainee Training Result — FAILED')
                    .addFields(
                        { name: '👤 Trainee', value: `<@${trainee.id}> (\`${trainee.tag}\`)`, inline: true },
                        { name: '🛡️ Evaluator / Host', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📊 Status', value: '❌ FAILED', inline: true },
                        { name: '📝 Reason', value: reason, inline: false },
                        { name: '📬 Trainee DM', value: dmSent ? '✅ DM Delivered' : '⚠️ User DMs closed', inline: true }
                    )
                    .setColor(config.colors.danger)
                    .setTimestamp();
                await logChannel.send({ embeds: [failEmbed] });
            }

            return interaction.editReply({ 
                content: `✅ Logged training failure for <@${trainee.id}> in <#${config.channels.trainingLogs}>.\n• **DM Notification:** ${dmSent ? '✅ Delivered' : '⚠️ User DMs closed'}` 
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('training-conclude')
            .setDescription('Conclude an active training session'),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const db = getDb();
            const active = await db.get(`SELECT * FROM trainings WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1`);
            if (!active) {
                return interaction.editReply({ content: '❌ No active training session found.' });
            }

            await db.run(`UPDATE trainings SET status = 'CONCLUDED', concluded_at = CURRENT_TIMESTAMP WHERE id = ?`, [active.id]);

            const concludeEmbed = new EmbedBuilder()
                .setTitle('🎓 Training Session Concluded')
                .setDescription(`Training Session **#${active.id}** has officially concluded.\nCongratulations to all candidates who passed today!`)
                .setColor(config.colors.neutral)
                .setTimestamp();

            const targetChannel = interaction.guild.channels.cache.get(config.channels.trainingSessions);
            if (targetChannel && active.message_id) {
                try {
                    const msg = await targetChannel.messages.fetch(active.message_id);
                    await msg.edit({ embeds: [concludeEmbed], components: [] });
                } catch (e) {}
            }

            return interaction.editReply({ content: `✅ Training **#${active.id}** concluded!` });
        }
    }
];
