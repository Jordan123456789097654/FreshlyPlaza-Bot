const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('shift-evaluate')
            .setDescription('Evaluate a staff colleague on duty after/during a shift and DM them official feedback')
            .addUserOption(opt => 
                opt.setName('staff')
                    .setDescription('Staff colleague to evaluate')
                    .setRequired(true)
            )
            .addIntegerOption(opt => 
                opt.setName('rating')
                    .setDescription('Performance rating from 1 to 5 stars')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(5)
            )
            .addStringOption(opt => 
                opt.setName('station')
                    .setDescription('Duty station evaluated')
                    .setRequired(true)
                    .addChoices(
                        { name: 'Self-Checkouts (SCO)', value: 'Self-Checkouts (SCO)' },
                        { name: 'Manual Tills / Registers', value: 'Manual Tills / Registers' },
                        { name: 'Restocking / Aisles', value: 'Restocking / Aisles' },
                        { name: 'Security & Loss Prevention', value: 'Security & Loss Prevention' },
                        { name: 'Customer Service Desk', value: 'Customer Service Desk' },
                        { name: 'General Floor / Greeter', value: 'General Floor / Greeter' }
                    )
            )
            .addStringOption(opt => 
                opt.setName('notes')
                    .setDescription('Evaluation feedback & observations')
                    .setRequired(true)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.staff) || 
                              member.roles.cache.has(config.roles.mr) || 
                              member.roles.cache.has(config.roles.hr) ||
                              member.permissions.has(PermissionFlagsBits.ManageGuild);

            if (!isManager) {
                return interaction.reply({ 
                    content: '❌ Only staff members and shift hosts can submit shift evaluations.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('staff');
            const rating = interaction.options.getInteger('rating');
            const station = interaction.options.getString('station');
            const notes = interaction.options.getString('notes');

            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (e) {
                return interaction.editReply({ content: `❌ Member <@${targetUser.id}> not found in this server.` });
            }

            // Save to DB
            const db = getDb();
            const evaluation = await db.addShiftEvaluation(
                targetUser.id,
                targetUser.tag,
                interaction.user.id,
                rating,
                station,
                notes
            );

            const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

            // 1. DM the reviewed user
            let dmSent = true;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('📋 Grandway Shopping — Shift Performance Evaluation')
                    .setDescription(`Hello <@${targetUser.id}>,\n\nYou have received an official **Shift Evaluation** from shift leadership for your performance on duty at **Grandway Shopping**!`)
                    .addFields(
                        { name: '🏪 Assigned Duty Station', value: station, inline: true },
                        { name: '⭐ Performance Rating', value: `${stars} (${rating}/5)`, inline: true },
                        { name: '🛡️ Evaluator', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📝 Evaluator Feedback & Notes', value: notes, inline: false },
                        { name: '🆔 Evaluation Record', value: `#${evaluation.id}`, inline: true }
                    )
                    .setColor(rating >= 4 ? config.colors.primary : rating === 3 ? config.colors.warning : config.colors.danger)
                    .setFooter({ text: 'Grandway Shopping Staff Operations', iconURL: interaction.guild.iconURL() })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) {
                dmSent = false;
            }

            // 2. Log in Shift Logs channel
            const logChannelId = config.channels.shiftLogs || config.channels.modLogs;
            let logChannel = interaction.guild.channels.cache.get(logChannelId);
            if (!logChannel) {
                try {
                    logChannel = await interaction.guild.channels.fetch(logChannelId);
                } catch (e) {}
            }

            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`📊 Staff Shift Evaluation — #${evaluation.id}`)
                    .addFields(
                        { name: '👤 Colleague Evaluated', value: `<@${targetUser.id}> (\`${targetUser.tag}\`)`, inline: true },
                        { name: '🛡️ Evaluator', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '🏪 Station', value: station, inline: true },
                        { name: '⭐ Score', value: `${stars} (${rating}/5)`, inline: true },
                        { name: '📝 Notes', value: notes, inline: false },
                        { name: '📬 DM Status', value: dmSent ? '✅ DM Sent to Staff Member' : '⚠️ DM Failed (DMs closed)', inline: true }
                    )
                    .setColor(rating >= 4 ? config.colors.primary : rating === 3 ? config.colors.warning : config.colors.danger)
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
            }

            return interaction.editReply({
                content: `✅ Shift evaluation **#${evaluation.id}** submitted for <@${targetUser.id}>!\n• **Score:** ${stars} (${rating}/5)\n• **Station:** ${station}\n• **Direct Message:** ${dmSent ? '✅ Successfully DMed the reviewed staff member.' : '⚠️ Direct message failed (user has DMs closed).'}`
            });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('customer-feedback')
            .setDescription('Submit customer feedback / receipt review for a shopping trip at Grandway Shopping')
            .addIntegerOption(opt => 
                opt.setName('rating')
                    .setDescription('Your overall shopping experience (1 to 5 stars)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(5)
            )
            .addStringOption(opt => 
                opt.setName('comments')
                    .setDescription('Comments regarding your shopping trip')
                    .setRequired(true)
            )
            .addUserOption(opt => 
                opt.setName('staff')
                    .setDescription('Staff colleague who served or helped you (Optional)')
                    .setRequired(false)
            )
            .addStringOption(opt => 
                opt.setName('order-receipt')
                    .setDescription('Roblox transaction / item details (Optional)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const rating = interaction.options.getInteger('rating');
            const comments = interaction.options.getString('comments');
            const staffMentioned = interaction.options.getUser('staff');
            const orderReceipt = interaction.options.getString('order-receipt') || 'N/A';

            const db = getDb();
            const feedback = await db.addCustomerFeedback(
                interaction.user.id,
                interaction.user.tag,
                orderReceipt,
                staffMentioned ? staffMentioned.id : null,
                rating,
                comments
            );

            const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

            // If a staff member was mentioned and reviewed, DM them!
            let staffDmSent = false;
            if (staffMentioned) {
                try {
                    const staffEmbed = new EmbedBuilder()
                        .setTitle('🌟 Grandway Shopping — You Received Customer Feedback!')
                        .setDescription(`A customer left a review mentioning you for outstanding customer service during their shopping trip!`)
                        .addFields(
                            { name: '⭐ Rating', value: `${stars} (${rating}/5)`, inline: true },
                            { name: '👤 Customer', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '💬 Customer Review', value: comments, inline: false }
                        )
                        .setColor(config.colors.primary)
                        .setFooter({ text: 'Grandway Shopping Customer Care', iconURL: interaction.guild.iconURL() })
                        .setTimestamp();

                    await staffMentioned.send({ embeds: [staffEmbed] });
                    staffDmSent = true;
                } catch (e) {}
            }

            // Post into public suggestions or staff-announcements / reviews
            const reviewChannelId = config.channels.suggestions || config.channels.staffAnnouncements;
            let reviewChannel = interaction.guild.channels.cache.get(reviewChannelId);
            if (!reviewChannel) {
                try {
                    reviewChannel = await interaction.guild.channels.fetch(reviewChannelId);
                } catch (e) {}
            }

            if (reviewChannel) {
                const publicEmbed = new EmbedBuilder()
                    .setTitle(`🛒 Customer Shopping Review — #${feedback.id}`)
                    .addFields(
                        { name: '👤 Customer', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '⭐ Rating', value: `${stars} (${rating}/5)`, inline: true },
                        { name: '👨‍💼 Staff Mentioned', value: staffMentioned ? `<@${staffMentioned.id}>` : '*None*', inline: true },
                        { name: '🧾 Order / Receipt', value: orderReceipt, inline: true },
                        { name: '💬 Review', value: comments, inline: false }
                    )
                    .setColor(rating >= 4 ? config.colors.primary : rating === 3 ? config.colors.warning : config.colors.danger)
                    .setFooter({ text: 'Grandway Shopping Customer Care & Experience' })
                    .setTimestamp();

                await reviewChannel.send({ embeds: [publicEmbed] });
            }

            return interaction.editReply({
                content: `✅ Thank you for your feedback! Your review (**#${feedback.id}**) has been submitted.${staffMentioned ? `\n• Mentioned Colleague: <@${staffMentioned.id}> (${staffDmSent ? '✅ DMed with your review!' : '⚠️ DMs closed'})` : ''}`
            });
        }
    }
];
