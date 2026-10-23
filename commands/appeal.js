const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('send-appeal')
        .setDescription('Send a punishment appeal notice with an interactive appeal form button directly to a user in DMs')
        .addUserOption(opt => 
            opt.setName('user')
               .setDescription('Target user to receive the appeal notice in DMs')
               .setRequired(true)
        )
        .addStringOption(opt => 
            opt.setName('type')
               .setDescription('Type of punishment being appealed')
               .setRequired(true)
               .addChoices(
                   { name: '⛔ Server Ban Appeal', value: 'Server Ban' },
                   { name: '📉 Staff Termination / Activity Removal', value: 'Staff Termination' },
                   { name: '⚠️ Official Strike', value: 'Staff Strike' },
                   { name: '🔇 Mute / Timeout', value: 'Timeout / Mute' },
                   { name: '📋 General Punishment', value: 'General Moderation' }
               )
        )
        .addStringOption(opt => 
            opt.setName('reason')
               .setDescription('Original reason for the punishment (Optional)')
               .setRequired(false)
        ),
    async execute(interaction) {
        const member = interaction.member;
        const isStaff = member.roles.cache.has(config.roles.hr) || 
                        member.roles.cache.has(config.roles.mr) || 
                        member.roles.cache.has(config.roles.staff) ||
                        member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                        member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isStaff) {
            return interaction.reply({ content: '❌ You do not have permission to send appeal notices.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('user');
        const appealType = interaction.options.getString('type');
        const reason = interaction.options.getString('reason') || 'Violation of Grandway Shopping rules / Staff policies';

        const db = getDb();
        const data = db.getData();
        if (!data.manual_appeals) data.manual_appeals = [];

        const appealId = data.manual_appeals.length + 1;
        const record = {
            id: appealId,
            user_id: targetUser.id,
            user_tag: targetUser.tag,
            sender_id: interaction.user.id,
            appeal_type: appealType,
            reason: reason,
            status: 'PENDING',
            created_at: new Date().toISOString()
        };
        data.manual_appeals.push(record);
        db.save();

        const dmEmbed = new EmbedBuilder()
            .setTitle(`⚖️ Grandway Shopping — Official Punishment Appeal Notice`)
            .setDescription(
                `Hello <@${targetUser.id}>,\n\n` +
                `An appeal window has been opened for your recent punishment (**${appealType}**) by Grandway Shopping Leadership.\n\n` +
                `If you believe this action was issued in error or would like to request reinstatement/review, please click the **📝 Submit Appeal** button below to complete the appeal form.`
            )
            .addFields(
                { name: '⚖️ Punishment Type', value: appealType, inline: true },
                { name: '🛡️ Dispatched By', value: `<@${interaction.user.id}>`, inline: true },
                { name: '📋 Stated Reason', value: `\`\`\`${reason}\`\`\``, inline: false },
                { 
                    name: '📌 How It Works', 
                    value: 'Click the button below to submit your explanation, justification, and Roblox username. Your appeal will be routed directly to Grandway Shopping Leadership for review.' 
                }
            )
            .setColor(config.colors.primary)
            .setFooter({ text: `Appeal Record #${appealId} • Grandway Shopping Moderation & Appeals` })
            .setTimestamp();

        const appealRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`btn_submit_manual_appeal_${appealId}`)
                .setLabel('📝 Submit Appeal Form')
                .setStyle(ButtonStyle.Primary)
        );

        let dmSent = true;
        try {
            await targetUser.send({ embeds: [dmEmbed], components: [appealRow] });
        } catch (e) {
            dmSent = false;
        }

        const logChannelId = config.channels.activityAppeals || config.channels.ticketLogs;
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle(`📤 Appeal Notice Dispatched — #${appealId}`)
                .addFields(
                    { name: 'Recipient', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: 'Dispatched By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Punishment Type', value: appealType, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'DM Status', value: dmSent ? '✅ Delivered' : '⚠️ Failed (DMs Closed)', inline: true }
                )
                .setColor(config.colors.secondary)
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] });
        }

        return interaction.editReply({
            content: dmSent
                ? `✅ Appeal notice **#${appealId}** successfully sent to <@${targetUser.id}> in DMs with the interactive submission form!`
                : `⚠️ Appeal record **#${appealId}** created, but could not DM <@${targetUser.id}> because their DMs are closed.`
        });
    }
};
