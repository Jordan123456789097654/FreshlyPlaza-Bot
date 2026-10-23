const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

/**
 * Warns anyone who pings a member that currently has the LOA role.
 * Exempt: bots, HR, Administrators, ignored users, and the LOA member pinging themselves.
 */
async function handleLoaPing(message) {
    try {
        const settings = config.loaPing || {};
        if (settings.enabled === false) return;
        if (!message || !message.guild || message.author?.bot || message.webhookId) return;
        if (!config.roles.loa) return;

        // Direct user mentions only (includes reply-pings, excludes @everyone / role pings)
        if (!message.mentions.members || message.mentions.members.size === 0) return;

        const loaMembers = message.mentions.members.filter(m =>
            m.roles.cache.has(config.roles.loa) && m.id !== message.author.id && !m.user.bot
        );
        if (loaMembers.size === 0) return;

        // Exemptions for the sender
        const author = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
        if (author) {
            const exempt = author.permissions.has(PermissionFlagsBits.Administrator) ||
                           author.roles.cache.has(config.roles.hr) ||
                           (config.ignoredUserIds || []).includes(author.id);
            if (exempt) return;
        }

        const db = getDb();
        const loaIds = [...loaMembers.keys()];
        await db.addLoaPingWarning(message.author.id, loaIds, message.channel.id, message.id);
        const totalWarnings = db.getLoaPingWarningCount(message.author.id);
        const mentionList = loaIds.map(id => `<@${id}>`).join(', ');

        const warnEmbed = new EmbedBuilder()
            .setTitle('⚠️ LOA Ping Warning')
            .setDescription(
                `<@${message.author.id}>, you pinged ${mentionList}, who ${loaIds.length > 1 ? 'are' : 'is'} currently on a **Leave of Absence (LOA)**.\n\n` +
                `Please do not ping staff members who are on leave. This has been logged as an official warning.`
            )
            .addFields({ name: '📋 Total LOA Ping Warnings', value: `${totalWarnings}`, inline: true })
            .setColor(config.colors.warning)
            .setFooter({ text: 'Grandway Shopping LOA Protection' })
            .setTimestamp();

        await message.reply({
            content: `<@${message.author.id}>`,
            embeds: [warnEmbed],
            allowedMentions: { users: [message.author.id], repliedUser: false }
        }).catch(() => {});

        // DM the offender (best effort)
        await message.author.send({ embeds: [warnEmbed] }).catch(() => {});

        // Log to mod logs
        const logChannel = message.guild.channels.cache.get(config.channels.modLogs || config.channels.punishmentLogs);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('📋 LOA Ping Warning Issued')
                .addFields(
                    { name: '👤 Offender', value: `<@${message.author.id}> (\`${message.author.tag}\`)`, inline: true },
                    { name: '🌴 Pinged (on LOA)', value: mentionList, inline: true },
                    { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
                    { name: '📊 Total Warnings', value: `${totalWarnings}`, inline: true },
                    { name: '💬 Message', value: message.content ? message.content.slice(0, 1000) : '*No text content*', inline: false },
                    { name: '🔗 Link', value: message.url, inline: false }
                )
                .setColor(config.colors.warning)
                .setTimestamp();
            await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
        }

        // Optional escalation to an official strike
        const threshold = settings.strikeThreshold || 0;
        if (threshold > 0 && totalWarnings > 0 && totalWarnings % threshold === 0) {
            await db.addStrike(message.author.id, message.client.user.id, `Automatic: ${totalWarnings} LOA ping warnings`, 1);
            const demoteChannel = message.guild.channels.cache.get(config.channels.demoteLogs);
            if (demoteChannel) {
                await demoteChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('📉 Automatic Strike — Repeated LOA Pings')
                        .setDescription(`<@${message.author.id}> reached **${totalWarnings}** LOA ping warnings and received +1 strike.`)
                        .setColor(config.colors.danger)
                        .setTimestamp()]
                }).catch(() => {});
            }
        }

        if (settings.deleteMessage) await message.delete().catch(() => {});
    } catch (err) {
        console.error('[LOA PING HANDLER ERROR]', err);
    }
}

module.exports = { handleLoaPing };
