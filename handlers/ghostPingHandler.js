const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

// In-memory cache for recent messages to detect ghost pings
// Key: message.id, Value: { author, content, mentions, createdAt, channelId }
const recentMessages = new Map();

// Periodic cleanup of messages older than 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, msg] of recentMessages.entries()) {
        if (now - msg.createdAt > 10 * 60 * 1000) {
            recentMessages.delete(id);
        }
    }
}, 60 * 1000);

function trackMessageForGhostPing(message) {
    if (!message || message.author?.bot || !message.guild) return;

    // Only track if it mentions users or roles
    const hasMentions = message.mentions.users.size > 0 || message.mentions.roles.size > 0;
    if (!hasMentions) return;

    recentMessages.set(message.id, {
        author: {
            id: message.author.id,
            tag: message.author.tag,
            displayName: message.member?.displayName || message.author.username
        },
        content: message.content,
        mentionedUsers: message.mentions.users.map(u => ({ id: u.id, tag: u.tag })),
        mentionedRoles: message.mentions.roles.map(r => ({ id: r.id, name: r.name })),
        channelId: message.channel.id,
        createdAt: Date.now()
    });
}

async function handleGhostPing(message) {
    try {
        if (!message || !message.guild) return;
        const tracked = recentMessages.get(message.id);
        if (!tracked) return;

        recentMessages.delete(message.id);

        // Check if author was HR or Administrator (Exempt)
        let isHrOrExempt = false;
        try {
            const member = await message.guild.members.fetch(tracked.author.id).catch(() => null);
            if (member) {
                isHrOrExempt = member.permissions.has(PermissionFlagsBits.Administrator) ||
                               member.roles.cache.has(config.roles.hr) ||
                               (config.ignoredUserIds || []).includes(member.id);
            }
        } catch (e) {}

        // If author is HR or Admin, ignore (they are exempt)
        if (isHrOrExempt) return;

        // Build list of pinged targets
        const userPings = tracked.mentionedUsers.filter(u => u.id !== tracked.author.id);
        const rolePings = tracked.mentionedRoles;

        if (userPings.length === 0 && rolePings.length === 0) return;

        const pingList = [
            ...userPings.map(u => `<@${u.id}>`),
            ...rolePings.map(r => `<@&${r.id}>`)
        ].join(', ');

        const ghostEmbed = new EmbedBuilder()
            .setTitle('👻 Ghost Ping Detected!')
            .setDescription(`A message containing mentions was deleted by <@${tracked.author.id}> (\`${tracked.author.tag}\`).`)
            .addFields(
                { name: '👤 Sender', value: `<@${tracked.author.id}>`, inline: true },
                { name: '🔔 Mentioned Target(s)', value: pingList.slice(0, 1024), inline: true },
                { name: '💬 Deleted Content', value: tracked.content ? `>>> ${tracked.content.slice(0, 1000)}` : '*No text content*', inline: false }
            )
            .setColor(config.colors.warning)
            .setFooter({ text: 'Grandway Shopping Anti-Ghost Ping System' })
            .setTimestamp();

        // 1. Call out in the channel
        const channel = message.guild.channels.cache.get(tracked.channelId);
        if (channel) {
            await channel.send({ embeds: [ghostEmbed] }).catch(() => {});
        }

        // 2. Log to mod logs / punishment logs
        const logChannelId = config.channels.modLogs || config.channels.punishmentLogs;
        const logChannel = message.guild.channels.cache.get(logChannelId);
        if (logChannel) {
            await logChannel.send({ embeds: [ghostEmbed] }).catch(() => {});
        }
    } catch (err) {
        console.error('[GHOST PING HANDLER ERROR]', err);
    }
}

module.exports = {
    trackMessageForGhostPing,
    handleGhostPing
};
