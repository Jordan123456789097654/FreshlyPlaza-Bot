const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');
const { generateAiJobDescription } = require('../utils/groqJobOffer');

/**
 * Builds the official Job Offer Embed
 */
function buildJobOfferEmbed(offer, guild) {
    const expiresTimestamp = Math.floor((new Date(offer.created_at).getTime() + 7 * 86400000) / 1000);
    const isAccepted = offer.status === 'ACCEPTED';
    const isDeclined = offer.status === 'DECLINED';
    const isCanceled = offer.status === 'CANCELED';

    let statusDisplay = `🟡 **Pending Response** (Expires <t:${expiresTimestamp}:R>)`;
    let embedColor = config.colors.primary;

    if (isAccepted) {
        statusDisplay = `🟢 **ACCEPTED** on <t:${Math.floor(new Date(offer.accepted_at || Date.now()).getTime() / 1000)}:f>`;
        embedColor = 0x2ECC71;
    } else if (isDeclined) {
        statusDisplay = `🔴 **DECLINED** on <t:${Math.floor(new Date(offer.declined_at || Date.now()).getTime() / 1000)}:f>${offer.decline_reason ? `\n*Reason: "${offer.decline_reason}"*` : ''}`;
        embedColor = 0xE74C3C;
    } else if (isCanceled) {
        statusDisplay = `⚪ **REVOKED / CANCELED** by Staff${offer.cancel_reason ? `\n*Reason: "${offer.cancel_reason}"*` : ''}`;
        embedColor = 0x95A5A6;
    }

    const respText = (offer.responsibilities || []).map(r => `• ${r}`).join('\n') || '• Uphold store standards and assist customers.';
    const reqText = (offer.requirements || []).map(q => `• ${q}`).join('\n') || '• Maintain professionalism and attend store shifts.';
    const perksText = (offer.perks_and_growth || []).map(p => `• ${p}`).join('\n') || `• ${offer.perks}`;

    const embed = new EmbedBuilder()
        .setTitle(`💼 Official Employment Offer — ${guild ? guild.name : 'Grandway Shopping'}`)
        .setColor(embedColor)
        .setDescription(
            `### 🌟 ${offer.headline || `Welcome to the Team as our next ${offer.position_title}!`}\n\n` +
            `Hello <@${offer.user_id}>! On behalf of the **Grandway Shopping Recruitment & Management Team**, we are excited to extend an official employment offer for you to join our store colleagues!\n\n` +
            `### 📋 Position Overview\n${offer.overview}\n\n` +
            `### 🎯 Key Responsibilities\n${respText}\n\n` +
            `### ✨ Perks & Advancement\n${perksText}\n\n` +
            `### 📌 Requirements & Expectations\n${reqText}\n\n` +
            `*${offer.closing_note || 'We look forward to seeing you excel on the shop floor!'}*`
        )
        .addFields(
            { name: '🏷️ Offered Position', value: `**${offer.position_title}** (<@&${offer.role_id}>)`, inline: true },
            { name: '🏬 Department', value: offer.department || 'Store Operations', inline: true },
            { name: '👮 Hiring Manager', value: `<@${offer.offerer_id}>`, inline: true },
            { name: '⏳ Probation Period', value: offer.probation_days > 0 ? `${offer.probation_days} Days` : 'None / Immediate Colleague', inline: true },
            { name: '📬 Delivered Via', value: offer.delivery_method === 'modmail' ? '📩 Modmail Support Ticket' : '📬 Direct Message (DM)', inline: true },
            { name: '🆔 Offer ID', value: `\`#${offer.id}\``, inline: true },
            { name: '📊 Offer Status', value: statusDisplay, inline: false }
        )
        .setFooter({ text: `Grandway Shopping Recruitment System • Offer #${offer.id}` })
        .setTimestamp(new Date(offer.created_at));

    if (guild && guild.iconURL()) {
        embed.setThumbnail(guild.iconURL({ dynamic: true }));
    }

    return embed;
}

/**
 * Builds the Action Buttons for a Job Offer
 */
function buildJobOfferButtons(offerId, status = 'PENDING') {
    if (status === 'ACCEPTED') {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`job_offer_accepted_btn_${offerId}`)
                .setLabel('Offer Accepted')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
        );
    }

    if (status === 'DECLINED') {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`job_offer_declined_btn_${offerId}`)
                .setLabel('Offer Declined')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );
    }

    if (status === 'CANCELED') {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`job_offer_canceled_btn_${offerId}`)
                .setLabel('Offer Revoked')
                .setEmoji('⚪')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`job_offer_accept_${offerId}`)
            .setLabel('Accept Offer')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`job_offer_decline_${offerId}`)
            .setLabel('Decline Offer')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );
}

module.exports = {
    buildJobOfferEmbed,
    buildJobOfferButtons,
    data: new SlashCommandBuilder()
        .setName('job-offer')
        .setDescription('Grandway Shopping Job Offer System: dispatch AI-crafted job offers via DMs or Modmail')
        .addSubcommand(sub =>
            sub.setName('send')
                .setDescription('Offer a candidate a job position with Groq AI generated description via DM or Modmail')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('The Discord member to extend the job offer to')
                        .setRequired(true)
                )
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('The staff role to be granted upon accepting')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('delivery')
                        .setDescription('How to deliver the job offer to the candidate')
                        .setRequired(true)
                        .addChoices(
                            { name: '📬 Direct Message (DMs)', value: 'dm' },
                            { name: '📩 Modmail Support Ticket', value: 'modmail' }
                        )
                )
                .addStringOption(opt =>
                    opt.setName('position_title')
                        .setDescription('Exact job title (e.g. "Store Cashier", "Inventory Specialist", defaults to role name)')
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('department')
                        .setDescription('Department (e.g. Store Operations, Customer Care, Fresh Bakery & Greggs, Logistics)')
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('perks')
                        .setDescription('Specific perks, bonuses, or compensation to highlight')
                        .setRequired(false)
                )
                .addIntegerOption(opt =>
                    opt.setName('probation_days')
                        .setDescription('Probationary period in days (default: 7 days, 0 for none)')
                        .setMinValue(0)
                        .setMaxValue(90)
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('custom_notes')
                        .setDescription('Custom qualifications, duties, or notes for Groq AI to weave into the offer')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View status and details of existing job offers')
                .addStringOption(opt =>
                    opt.setName('offer_id')
                        .setDescription('Specific Offer ID (e.g. "JO-123456")')
                        .setRequired(false)
                )
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('Filter job offers by candidate')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('Revoke / cancel a pending job offer')
                .addStringOption(opt =>
                    opt.setName('offer_id')
                        .setDescription('Offer ID to cancel (e.g. "JO-123456")')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('reason')
                        .setDescription('Reason for canceling the job offer')
                        .setRequired(false)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const member = interaction.member;
        const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                            member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                            member.permissions.has(PermissionFlagsBits.Administrator) ||
                            (config.roles.hr && member.roles.cache.has(config.roles.hr)) ||
                            (config.roles.mr && member.roles.cache.has(config.roles.mr)) ||
                            (config.roles.staff && member.roles.cache.has(config.roles.staff));

        if (!isAuthorized) {
            return interaction.reply({
                content: '🚫 Only Grandway Shopping HR, Management, and authorized Recruiters can use the Job Offer System.',
                flags: MessageFlags.Ephemeral
            });
        }

        const sub = interaction.options.getSubcommand();
        const db = getDb();

        // 1. /job-offer send
        if (sub === 'send') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('user');
            const offeredRole = interaction.options.getRole('role');
            const delivery = interaction.options.getString('delivery');
            const positionTitle = interaction.options.getString('position_title') || offeredRole.name;
            const department = interaction.options.getString('department') || 'Store Operations & Customer Experience';
            const perks = interaction.options.getString('perks') || null;
            const probationDays = interaction.options.getInteger('probation_days') ?? 7;
            const customNotes = interaction.options.getString('custom_notes') || null;

            if (targetUser.bot) {
                return interaction.editReply({ content: '❌ You cannot extend an employment offer to a Discord bot.' });
            }

            // Check if candidate is already in server
            let targetMember = null;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (_) {}

            if (!targetMember) {
                return interaction.editReply({ content: `❌ <@${targetUser.id}> is not currently a member of this Discord server.` });
            }

            // Check active offers
            const activeOffers = await db.getActiveJobOffers(targetUser.id);
            const duplicatePending = activeOffers.find(o => o.role_id === offeredRole.id);
            if (duplicatePending) {
                return interaction.editReply({
                    content: `⚠️ An active job offer (**#${duplicatePending.id}**) for **${duplicatePending.position_title}** is already pending for <@${targetUser.id}>.`
                });
            }

            // Generate AI Job Description using Groq
            const aiData = await generateAiJobDescription({
                positionTitle,
                department,
                perks,
                probationDays,
                customNotes,
                hiringManagerName: interaction.user.tag,
                guildName: interaction.guild.name
            });

            // Create record in DB
            const offer = await db.createJobOffer({
                user_id: targetUser.id,
                user_tag: targetUser.tag,
                offerer_id: interaction.user.id,
                offerer_tag: interaction.user.tag,
                role_id: offeredRole.id,
                role_name: offeredRole.name,
                position_title: positionTitle,
                department,
                perks: perks || 'Store colleague discount, shift rewards, promotion pathways',
                probation_days: probationDays,
                custom_notes: customNotes || '',
                delivery_method: delivery,
                headline: aiData.headline,
                overview: aiData.overview,
                responsibilities: aiData.responsibilities,
                requirements: aiData.requirements,
                perks_and_growth: aiData.perks_and_growth,
                closing_note: aiData.closing_note
            });

            const offerEmbed = buildJobOfferEmbed(offer, interaction.guild);
            const offerButtons = buildJobOfferButtons(offer.id, 'PENDING');

            // Dispatch based on chosen delivery method
            if (delivery === 'dm') {
                try {
                    const dmMsg = await targetUser.send({
                        content: `🔔 <@${targetUser.id}>, you have received an official **Job Offer** from **${interaction.guild.name}**!`,
                        embeds: [offerEmbed],
                        components: [offerButtons]
                    });

                    await db.updateJobOffer(offer.id, {
                        message_id: dmMsg.id,
                        channel_id: dmMsg.channelId
                    });

                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('✅ Job Offer Dispatched via DMs!')
                        .setDescription(`Successfully sent the job offer to <@${targetUser.id}>'s Direct Messages!`)
                        .addFields(
                            { name: '🆔 Offer ID', value: `\`#${offer.id}\``, inline: true },
                            { name: '👤 Candidate', value: `<@${targetUser.id}>`, inline: true },
                            { name: '🏷️ Role Offered', value: `<@&${offeredRole.id}> (\`${positionTitle}\`)`, inline: true },
                            { name: '🏬 Department', value: department, inline: true },
                            { name: '⏳ Probation', value: probationDays > 0 ? `${probationDays} Days` : 'None', inline: true },
                            { name: '📬 Delivery', value: 'Direct Message (DM)', inline: true }
                        )
                        .setColor(0x2ECC71)
                        .setFooter({ text: 'Awaiting candidate acceptance • Groq AI job description generated' })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [confirmEmbed] });
                } catch (dmErr) {
                    return interaction.editReply({
                        content: `⚠️ **Could not send DM to <@${targetUser.id}>!**\nTheir direct messages are closed or private.\n\n💡 **Tip:** You can re-send this offer with \`delivery: Modmail Support Ticket\` to create a dedicated private channel for them!`,
                        embeds: [offerEmbed]
                    });
                }
            } else if (delivery === 'modmail') {
                const { createModmailThread } = require('../handlers/modmailHandler');
                let ticketChannel = null;

                try {
                    const res = await createModmailThread({
                        guild: interaction.guild,
                        user: targetUser,
                        member: targetMember,
                        categoryKey: 'management',
                        subject: `Job Offer: ${positionTitle}`,
                        details: `Official employment offer extended by Hiring Manager <@${interaction.user.id}>.`,
                        client: interaction.client
                    });
                    ticketChannel = res.channel;
                } catch (mmErr) {
                    // Check if candidate already has an active modmail ticket
                    const activeTicket = await db.getActiveUserTicket(targetUser.id, null, interaction.guild);
                    if (activeTicket && interaction.guild.channels.cache.has(activeTicket.channel_id)) {
                        ticketChannel = interaction.guild.channels.cache.get(activeTicket.channel_id);
                    } else {
                        return interaction.editReply({
                            content: `❌ Could not open Modmail Ticket: ${mmErr.message}`,
                            embeds: [offerEmbed]
                        });
                    }
                }

                if (ticketChannel) {
                    const ticketMsg = await ticketChannel.send({
                        content: `💼 **OFFICIAL JOB OFFER EXTENDED** for <@${targetUser.id}> by <@${interaction.user.id}>:`,
                        embeds: [offerEmbed],
                        components: [offerButtons]
                    });

                    await db.updateJobOffer(offer.id, {
                        message_id: ticketMsg.id,
                        channel_id: ticketChannel.id
                    });

                    // Also ping the user via DM bridge if active
                    try {
                        await targetUser.send({
                            content: `💼 You have received a **Job Offer** from **${interaction.guild.name}**! It has been linked to your Modmail Ticket.`,
                            embeds: [offerEmbed],
                            components: [offerButtons]
                        }).catch(() => null);
                    } catch (_) {}

                    const confirmEmbed = new EmbedBuilder()
                        .setTitle('✅ Job Offer Dispatched via Modmail Ticket!')
                        .setDescription(`Successfully created/linked the job offer in <#${ticketChannel.id}>!`)
                        .addFields(
                            { name: '🆔 Offer ID', value: `\`#${offer.id}\``, inline: true },
                            { name: '👤 Candidate', value: `<@${targetUser.id}>`, inline: true },
                            { name: '🏷️ Role Offered', value: `<@&${offeredRole.id}> (\`${positionTitle}\`)`, inline: true },
                            { name: '📩 Ticket Channel', value: `<#${ticketChannel.id}>`, inline: true },
                            { name: '🏬 Department', value: department, inline: true },
                            { name: '⏳ Probation', value: probationDays > 0 ? `${probationDays} Days` : 'None', inline: true }
                        )
                        .setColor(0x2ECC71)
                        .setFooter({ text: 'Awaiting candidate acceptance • Groq AI job description generated' })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [confirmEmbed] });
                }
            }
        }

        // 2. /job-offer view
        if (sub === 'view') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const offerIdInput = interaction.options.getString('offer_id');
            const targetUserInput = interaction.options.getUser('user');

            if (offerIdInput) {
                const cleanId = offerIdInput.trim().toUpperCase();
                const offer = await db.getJobOffer(cleanId.startsWith('JO-') ? cleanId : `JO-${cleanId}`);
                if (!offer) {
                    return interaction.editReply({ content: `❌ Could not find a job offer with ID **${offerIdInput}**.` });
                }

                const embed = buildJobOfferEmbed(offer, interaction.guild);
                const buttons = buildJobOfferButtons(offer.id, offer.status);
                return interaction.editReply({ embeds: [embed], components: [buttons] });
            }

            const data = db.getData();
            let list = data.job_offers || [];

            if (targetUserInput) {
                list = list.filter(o => o.user_id === targetUserInput.id);
            }

            if (list.length === 0) {
                return interaction.editReply({
                    content: targetUserInput
                        ? `ℹ️ No job offers found for <@${targetUserInput.id}>.`
                        : 'ℹ️ No job offers have been extended yet.'
                });
            }

            // Show latest 10 offers
            const recent = list.slice(-10).reverse();
            const listText = recent.map((o, idx) => {
                const statusEmoji = o.status === 'ACCEPTED' ? '🟢' : (o.status === 'DECLINED' ? '🔴' : (o.status === 'CANCELED' ? '⚪' : '🟡'));
                return `**#${idx + 1}** \`#${o.id}\` — ${statusEmoji} **${o.status}**\n` +
                       `└ 👤 <@${o.user_id}> • **${o.position_title}** (<@&${o.role_id}>)\n` +
                       `└ 👮 Offered by <@${o.offerer_id}> • <t:${Math.floor(new Date(o.created_at).getTime() / 1000)}:R>`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setTitle('💼 Grandway Shopping — Job Offer Registry')
                .setDescription(listText)
                .setColor(config.colors.secondary)
                .setFooter({ text: `Showing ${recent.length} of ${list.length} total offers` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // 3. /job-offer cancel
        if (sub === 'cancel') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const offerIdInput = interaction.options.getString('offer_id').trim().toUpperCase();
            const reason = interaction.options.getString('reason') || 'Revoked by hiring manager';
            const cleanId = offerIdInput.startsWith('JO-') ? offerIdInput : `JO-${offerIdInput}`;

            const offer = await db.getJobOffer(cleanId);
            if (!offer) {
                return interaction.editReply({ content: `❌ Could not find a job offer with ID **${offerIdInput}**.` });
            }

            if (offer.status !== 'PENDING') {
                return interaction.editReply({ content: `⚠️ Job offer **#${offer.id}** cannot be canceled because it is already **${offer.status}**.` });
            }

            const updated = await db.updateJobOffer(offer.id, {
                status: 'CANCELED',
                cancel_reason: reason,
                canceled_by: interaction.user.id,
                canceled_at: new Date().toISOString()
            });

            // If offer was delivered via DM or Channel, update the buttons
            if (offer.channel_id && offer.message_id) {
                try {
                    const ch = interaction.guild.channels.cache.get(offer.channel_id) || await interaction.guild.channels.fetch(offer.channel_id).catch(() => null);
                    if (ch) {
                        const msg = await ch.messages.fetch(offer.message_id).catch(() => null);
                        if (msg) {
                            const updatedEmbed = buildJobOfferEmbed(updated, interaction.guild);
                            const updatedRow = buildJobOfferButtons(offer.id, 'CANCELED');
                            await msg.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => null);
                        }
                    }
                } catch (_) {}
            }

            return interaction.editReply({
                content: `✅ Successfully revoked job offer **#${offer.id}** for <@${offer.user_id}>.\nReason: *"${reason}"*`
            });
        }
    }
};
