const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

async function broadcastLoaApproval(client, guild, loa, actionedByUserId) {
    const channelId = config.channels.loaAnnouncements || '1559311276176441434';
    let announceChannel = guild.channels.cache.get(channelId);
    if (!announceChannel) {
        try {
            announceChannel = await guild.channels.fetch(channelId);
        } catch (e) {}
    }

    if (announceChannel) {
        const embed = new EmbedBuilder()
            .setTitle('🌴 Staff Leave of Absence (LOA) Approved')
            .setDescription(`Official Leave of Absence notice for staff member <@${loa.user_id}>.\n\nDuring this time, the staff member is excused from shift requirements and activity checks.`)
            .addFields(
                { name: '👤 Staff Member', value: `<@${loa.user_id}>`, inline: true },
                { name: '📅 Leave Period', value: `**${loa.start_date}** ➔ **${loa.end_date}**`, inline: true },
                { name: '🆔 Record ID', value: `#${loa.id}`, inline: true },
                { name: '📝 Reason', value: loa.reason || '*Not specified*', inline: false },
                { name: '🛡️ Authorized By', value: `<@${actionedByUserId}>`, inline: true }
            )
            .setColor(config.colors.secondary)
            .setFooter({ text: 'Grandway Shopping HR Portal • Leave Management', iconURL: guild.iconURL() })
            .setTimestamp();

        try {
            await announceChannel.send({
                content: `📢 **STAFF LOA NOTICE:** <@${loa.user_id}>`,
                embeds: [embed]
            });
        } catch (e) {
            console.error('[LOA ANNOUNCEMENT ERROR]', e);
        }
    }

    // Direct message the user
    try {
        const user = await client.users.fetch(loa.user_id);
        if (user) {
            await user.send({
                content: `🌴 **Your Grandway Shopping LOA Request #${loa.id} has been APPROVED!**\n\n• **Duration:** ${loa.start_date} to ${loa.end_date}\n• **Approved By:** <@${actionedByUserId}>\n\nYour LOA role has been applied. You are protected from shift activity checks while on leave. Please return promptly on ${loa.end_date}.`
            });
        }
    } catch (e) {}
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('loa-request')
            .setDescription('Submit a Leave of Absence request')
            .addStringOption(opt => opt.setName('start').setDescription('Start Date (e.g. Oct 15, 2026)').setRequired(true))
            .addStringOption(opt => opt.setName('end').setDescription('End Date (e.g. Oct 22, 2026)').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for LOA').setRequired(true)),
        async execute(interaction) {
            const db = getDb();
            const startDate = interaction.options.getString('start');
            const endDate = interaction.options.getString('end');
            const reason = interaction.options.getString('reason');

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
                .setTimestamp()
                .setFooter({ text: 'Grandway Shopping HR Portal', iconURL: interaction.guild.iconURL() });

            const hrRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`loa_approve_${loa.id}`).setLabel('✅ Approve LOA').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`loa_deny_${loa.id}`).setLabel('❌ Deny LOA').setStyle(ButtonStyle.Danger)
            );

            const hrChannel = interaction.guild.channels.cache.get(config.channels.demoteLogs) || interaction.guild.channels.cache.get(config.channels.modLogs) || interaction.channel;
            if (hrChannel) {
                await hrChannel.send({ embeds: [loaEmbed], components: [hrRow] });
            }

            return interaction.reply({ content: `✅ Submitted LOA Request **#${loa.id}** (${startDate} - ${endDate}) to HR!`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('loa-approve')
            .setDescription('Approve a staff LOA request & announce in LOA channel')
            .addIntegerOption(opt => opt.setName('id').setDescription('LOA Request ID').setRequired(true)),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) || 
                              member.roles.cache.has(config.roles.mr) || 
                              member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                              member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isManager) {
                return interaction.reply({ content: '❌ Only Grandway Shopping Leadership / HR can approve LOA requests.', ephemeral: true });
            }

            const db = getDb();
            const loaId = interaction.options.getInteger('id');
            const data = db.getData();
            const loa = data.loas.find(l => l.id == loaId);
            if (!loa) return interaction.reply({ content: '❌ LOA request record not found.', ephemeral: true });

            loa.status = 'APPROVED';
            loa.actioned_by = interaction.user.id;
            db.save();

            if (config.roles.loa) {
                try {
                    const targetMember = await interaction.guild.members.fetch(loa.user_id);
                    if (targetMember) await targetMember.roles.add(config.roles.loa);
                } catch (e) {}
            }

            await broadcastLoaApproval(interaction.client, interaction.guild, loa, interaction.user.id);

            return interaction.reply({ content: `✅ LOA Request **#${loaId}** for <@${loa.user_id}> has been APPROVED and announced in <#${config.channels.loaAnnouncements}>!`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('loa-deny')
            .setDescription('Deny a staff LOA request')
            .addIntegerOption(opt => opt.setName('id').setDescription('LOA Request ID').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for denial (Optional)').setRequired(false)),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) || 
                              member.roles.cache.has(config.roles.mr) || 
                              member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                              member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isManager) {
                return interaction.reply({ content: '❌ Only Grandway Shopping Leadership / HR can deny LOA requests.', ephemeral: true });
            }

            const db = getDb();
            const loaId = interaction.options.getInteger('id');
            const denialReason = interaction.options.getString('reason') || 'Operational requirements / incomplete details';
            const data = db.getData();
            const loa = data.loas.find(l => l.id == loaId);
            if (!loa) return interaction.reply({ content: '❌ LOA request record not found.', ephemeral: true });

            loa.status = 'DENIED';
            loa.actioned_by = interaction.user.id;
            loa.denial_reason = denialReason;
            db.save();

            try {
                const user = await interaction.client.users.fetch(loa.user_id);
                if (user) {
                    await user.send({
                        content: `❌ **Your Grandway Shopping LOA Request #${loa.id} was DENIED.**\n• **Reason:** ${denialReason}\n• **Actioned By:** <@${interaction.user.id}>\n\nIf you have questions, please reach out to Management.`
                    });
                }
            } catch (e) {}

            return interaction.reply({ content: `✅ LOA Request **#${loaId}** for <@${loa.user_id}> has been DENIED.`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('loa-panel')
            .setDescription('Post the interactive LOA Request Button Panel in this channel'),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) || 
                              member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                              member.permissions.has(PermissionFlagsBits.Administrator);

            if (!isManager) {
                return interaction.reply({ content: '❌ Only HR / Managers can deploy the LOA Request panel.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🌴 Grandway Shopping — Leave of Absence (LOA) Portal')
                .setDescription(
                    `Staff members requiring time off from shifts, duties, or activity checks must submit an official Leave of Absence.\n\n` +
                    `📌 **Guidelines:**\n` +
                    `• Submit at least **24 hours** in advance when possible.\n` +
                    `• Maximum standard LOA duration: **14 days**.\n` +
                    `• While on LOA, you are excused from mandatory shift activity checks.\n\n` +
                    `Click the button below to fill out your LOA request form.`
                )
                .setColor(config.colors.secondary)
                .setFooter({ text: 'Grandway Shopping Human Resources' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_open_loa_modal')
                    .setLabel('🌴 Request Leave of Absence')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ LOA portal panel deployed!', ephemeral: true });
        }
    }
];

module.exports.broadcastLoaApproval = broadcastLoaApproval;
