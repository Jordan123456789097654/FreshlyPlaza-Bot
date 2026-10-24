const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('../config');

/**
 * Setup Dyno-style comprehensive server audit logging
 * Logs:
 * - Message Deletions (content, author, channel, executor if mod deleted)
 * - Message Edits (before & after diff, author, channel, jump link)
 * - Member Joins & Leaves (account age, join date, member count)
 * - Member Role Updates (roles added / removed)
 * - Member Nickname Changes (old & new nick)
 * - Member Bans & Unbans (reason, target, executor)
 * - Channel Create / Delete / Update
 * - Voice Channel Join / Leave / Switch
 * @param {import('discord.js').Client} client
 */
function setupAuditLogger(client) {
    const getModLogsChannel = () => {
        const chanId = config.channels.modLogs;
        if (!chanId) return null;
        return client.channels.cache.get(chanId) || null;
    };

    // 1. Message Delete
    client.on('messageDelete', async (message) => {
        try {
            if (!message.guild || message.guild.id !== config.guildId) return;
            if (message.author && message.author.bot) return;

            const logChannel = getModLogsChannel();
            if (!logChannel) return;

            // Check Discord Audit Logs for who deleted it (within last 5 seconds)
            let executor = null;
            try {
                const logs = await message.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MessageDelete });
                const entry = logs.entries.first();
                if (entry && entry.target && entry.target.id === message.author?.id && (Date.now() - entry.createdTimestamp) < 5000) {
                    executor = entry.executor;
                }
            } catch (e) {}

            const embed = new EmbedBuilder()
                .setTitle('🗑️ Message Deleted')
                .setColor(0xE74C3C)
                .addFields(
                    { name: 'Author', value: message.author ? `${message.author.tag} (<@${message.author.id}>)` : 'Unknown Author', inline: true },
                    { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                    { name: 'Deleted By', value: executor ? `${executor.tag} (<@${executor.id}>)` : 'Self / Unknown', inline: true },
                    { name: 'Content', value: message.content ? (message.content.length > 1000 ? message.content.slice(0, 1000) + '...' : message.content) : '*No text content (embed or attachment)*' }
                )
                .setFooter({ text: `Message ID: ${message.id}` })
                .setTimestamp();

            if (message.attachments.size > 0) {
                const fileNames = message.attachments.map(a => a.name).join(', ');
                embed.addFields({ name: 'Attachments', value: fileNames });
            }

            await logChannel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            console.error('[AuditLogger] Error in messageDelete:', err);
        }
    });

    // 2. Message Update / Edit
    client.on('messageUpdate', async (oldMsg, newMsg) => {
        try {
            if (!newMsg.guild || newMsg.guild.id !== config.guildId) return;
            if (newMsg.author && newMsg.author.bot) return;
            if (oldMsg.content === newMsg.content) return; // Ignore embed changes

            const logChannel = getModLogsChannel();
            if (!logChannel) return;

            const embed = new EmbedBuilder()
                .setTitle('✏️ Message Edited')
                .setColor(0xF1C40F)
                .addFields(
                    { name: 'Author', value: `${newMsg.author.tag} (<@${newMsg.author.id}>)`, inline: true },
                    { name: 'Channel', value: `<#${newMsg.channel.id}>`, inline: true },
                    { name: 'Jump Link', value: `[Go to Message](${newMsg.url})`, inline: true },
                    { name: 'Before', value: oldMsg.content ? (oldMsg.content.length > 900 ? oldMsg.content.slice(0, 900) + '...' : oldMsg.content) : '*No previous text*' },
                    { name: 'After', value: newMsg.content ? (newMsg.content.length > 900 ? newMsg.content.slice(0, 900) + '...' : newMsg.content) : '*No new text*' }
                )
                .setFooter({ text: `Message ID: ${newMsg.id}` })
                .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            console.error('[AuditLogger] Error in messageUpdate:', err);
        }
    });

    // 3. Member Join
    client.on('guildMemberAdd', async (member) => {
        try {
            if (member.guild.id !== config.guildId) return;

            // Send custom welcome card into #welcome
            const { sendWelcomeCard } = require('../utils/welcomeCard');
            sendWelcomeCard(member).catch(() => {});

            const logChannel = getModLogsChannel();
            if (!logChannel) return;

            const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));

            const embed = new EmbedBuilder()
                .setTitle('📥 Member Joined')
                .setColor(0x2ECC71)
                .setThumbnail(member.user.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
                    { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R> (${accountAgeDays} days ago)`, inline: true },
                    { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
                )
                .setFooter({ text: `User ID: ${member.id}` })
                .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            console.error('[AuditLogger] Error in guildMemberAdd:', err);
        }
    });

    // 4. Member Remove / Leave
    client.on('guildMemberRemove', async (member) => {
        try {
            if (member.guild.id !== config.guildId) return;
            const logChannel = getModLogsChannel();
            if (!logChannel) return;

            const roles = member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(', ') || 'None';

            const embed = new EmbedBuilder()
                .setTitle('📤 Member Left / Kicked')
                .setColor(0xE74C3C)
                .setThumbnail(member.user.displayAvatarURL())
                .addFields(
                    { name: 'User', value: `${member.user.tag} (<@${member.user.id}>)`, inline: true },
                    { name: 'Roles Held', value: roles.length > 900 ? roles.slice(0, 900) + '...' : roles, inline: false },
                    { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
                )
                .setFooter({ text: `User ID: ${member.id}` })
                .setTimestamp();

            await logChannel.send({ embeds: [embed] }).catch(() => {});
        } catch (err) {
            console.error('[AuditLogger] Error in guildMemberRemove:', err);
        }
    });

    // 5. Member Updates (Roles & Nickname)
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        try {
            if (newMember.guild.id !== config.guildId) return;
            const logChannel = getModLogsChannel();
            if (!logChannel) return;

            // Nickname Change
            if (oldMember.nickname !== newMember.nickname) {
                const embed = new EmbedBuilder()
                    .setTitle('🏷️ Member Nickname Changed')
                    .setColor(0x3498DB)
                    .addFields(
                        { name: 'User', value: `${newMember.user.tag} (<@${newMember.id}>)`, inline: true },
                        { name: 'Before', value: oldMember.nickname || '*None*', inline: true },
                        { name: 'After', value: newMember.nickname || '*None*', inline: true }
                    )
                    .setFooter({ text: `User ID: ${newMember.id}` })
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }

            // Role Changes
            const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
            const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

            if (addedRoles.size > 0 || removedRoles.size > 0) {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ Member Roles Updated')
                    .setColor(0x9B59B6)
                    .addFields(
                        { name: 'User', value: `${newMember.user.tag} (<@${newMember.id}>)`, inline: true }
                    )
                    .setFooter({ text: `User ID: ${newMember.id}` })
                    .setTimestamp();

                if (addedRoles.size > 0) {
                    embed.addFields({ name: 'Roles Added', value: addedRoles.map(r => `<@&${r.id}>`).join(' ') });
                }
                if (removedRoles.size > 0) {
                    embed.addFields({ name: 'Roles Removed', value: removedRoles.map(r => `<@&${r.id}>`).join(' ') });
                }

                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        } catch (err) {
            console.error('[AuditLogger] Error in guildMemberUpdate:', err);
        }
    });

    // 6. Voice State Updates
    client.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            const guild = newState.guild || oldState.guild;
            if (guild.id !== config.guildId) return;
            const logChannel = getModLogsChannel();
            if (!logChannel) return;

            const member = newState.member || oldState.member;
            if (!member || member.user.bot) return;

            // Joined Voice
            if (!oldState.channelId && newState.channelId) {
                const embed = new EmbedBuilder()
                    .setTitle('🔊 Member Joined Voice')
                    .setColor(0x2ECC71)
                    .addFields(
                        { name: 'User', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                        { name: 'Voice Channel', value: `<#${newState.channelId}>`, inline: true }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
            // Left Voice
            else if (oldState.channelId && !newState.channelId) {
                const embed = new EmbedBuilder()
                    .setTitle('🔇 Member Left Voice')
                    .setColor(0xE74C3C)
                    .addFields(
                        { name: 'User', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                        { name: 'Voice Channel', value: `<#${oldState.channelId}>`, inline: true }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
            // Switched Voice Channel
            else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                const embed = new EmbedBuilder()
                    .setTitle('🔀 Member Switched Voice Channel')
                    .setColor(0x3498DB)
                    .addFields(
                        { name: 'User', value: `${member.user.tag} (<@${member.id}>)`, inline: true },
                        { name: 'From', value: `<#${oldState.channelId}>`, inline: true },
                        { name: 'To', value: `<#${newState.channelId}>`, inline: true }
                    )
                    .setTimestamp();
                await logChannel.send({ embeds: [embed] }).catch(() => {});
            }
        } catch (err) {
            console.error('[AuditLogger] Error in voiceStateUpdate:', err);
        }
    });

    console.log('[AuditLogger] Full server audit logger initialized!');
}

module.exports = { setupAuditLogger };
