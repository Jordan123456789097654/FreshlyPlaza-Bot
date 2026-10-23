const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

async function handleHoneypotMessage(message) {
    if (!message.guild || message.author.bot) return;

    // Check if message is in the #honeypot channel
    if (message.channel.id === config.channels.honeypot) {
        const db = getDb();
        const member = message.member;

        // Ignore guild owner or Administrator role if testing
        if (member.permissions.has(PermissionFlagsBits.Administrator)) {
            // Still delete test message to keep honeypot channel clean
            try {
                await message.delete();
            } catch (e) {}
            return;
        }

        // Action 1: Delete message immediately
        try {
            await message.delete();
        } catch (e) {
            console.error('[HONEYPOT] Failed to delete message:', e);
        }

        // Action 2: Add Honeypot role / Timeout member
        let actionTaken = 'Honeypot Role Assigned & Message Deleted';
        try {
            if (config.roles.honeypot) {
                await member.roles.add(config.roles.honeypot);
            }
            // Timeout for 24 hours
            await member.timeout(24 * 60 * 60 * 1000, 'Triggered Honeypot Security Trap Channel');
            actionTaken = 'Timed out (24h), Honeypot Role added, Message Deleted';
        } catch (e) {
            console.error('[HONEYPOT] Failed to apply role/timeout:', e);
        }

        // Action 3: Record to database
        try {
            await db.run(
                `INSERT INTO honeypot_logs (user_id, username, trigger_reason, action_taken) VALUES (?, ?, ?, ?)`,
                [message.author.id, message.author.tag, `Message in #honeypot: "${message.content.substring(0, 100)}"`, actionTaken]
            );
        } catch (e) {}

        // Action 4: Log to #modlogs and #punishment-logs
        const alertEmbed = new EmbedBuilder()
            .setTitle('🚨 SECURITY ALERT — HONEYPOT TRIGGERED')
            .setDescription(`A user triggered the **Grandway Shopping Security Trap Channel** (<#${config.channels.honeypot}>) and has been automatically moderated.`)
            .addFields(
                { name: '👤 Offender', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                { name: '🆔 User ID', value: message.author.id, inline: true },
                { name: '🔨 Action Taken', value: actionTaken, inline: false },
                { name: '💬 Message Content', value: `\`\`\`${message.content || '[No Text Content]'}\`\`\``, inline: false }
            )
            .setColor(config.colors.danger)
            .setTimestamp()
            .setFooter({ text: 'Grandway Shopping Anti-Raid System', iconURL: message.guild.iconURL() });

        const modLogsChannel = message.guild.channels.cache.get(config.channels.modLogs);
        if (modLogsChannel) {
            await modLogsChannel.send({ embeds: [alertEmbed] });
        }

        const punishmentLogsChannel = message.guild.channels.cache.get(config.channels.punishmentLogs);
        if (punishmentLogsChannel) {
            await punishmentLogsChannel.send({ embeds: [alertEmbed] });
        }
    }
}

module.exports = { handleHoneypotMessage };
