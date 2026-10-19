const { AuditLogEvent, EmbedBuilder } = require('discord.js');
const { getDb } = require('../database');
const config = require('../config');

// In-memory action rate tracker: moderatorId -> timestamps array
const modActionRates = new Map();

/**
 * Handles newly created audit log entries in guilds
 */
async function handleAuditLogEntry(entry, guild) {
    try {
        if (!entry || !entry.executor || entry.executor.bot) return;

        const executorId = entry.executor.id;
        const now = Date.now();

        // Exempt founders / bot developer
        if (config.ignoredUserIds && config.ignoredUserIds.includes(executorId)) return;

        const db = getDb();

        // 1. RATE ABUSE DETECTION (Mass bans, kicks, or pruning)
        if (entry.action === AuditLogEvent.MemberBanAdd || entry.action === AuditLogEvent.MemberKick) {
            let userTimestamps = modActionRates.get(executorId) || [];
            userTimestamps = userTimestamps.filter(t => now - t < 60000); // 60s sliding window
            userTimestamps.push(now);
            modActionRates.set(executorId, userTimestamps);

            // Trigger alert if 3 or more ban/kick actions in 60 seconds
            if (userTimestamps.length >= 3) {
                const actionType = entry.action === AuditLogEvent.MemberBanAdd ? 'BANS' : 'KICKS';
                const flag = {
                    id: `FLAG-ABUSE-${Date.now().toString().slice(-4)}`,
                    type: `RAPID_MASS_${actionType}`,
                    executor_id: executorId,
                    executor_tag: entry.executor.tag,
                    target_id: entry.targetId,
                    reason: entry.reason || 'None stated',
                    timestamp: new Date().toISOString()
                };

                await db.addIaAuditFlag(flag);
                await dispatchIaAlert(guild.client, {
                    title: `🚨 [CRITICAL IA ALERT] Potential Rogue Moderator Mass-${actionType}`,
                    description: `Staff member <@${executorId}> (\`${entry.executor.tag}\`) executed **${userTimestamps.length} ${actionType} within 60 seconds** in **${guild.name}**!\n\n**Most Recent Target:** <@${entry.targetId}>\n**Stated Reason:** \`${entry.reason || 'None'}\``,
                    color: 0xE74C3C,
                    priority: 'CRITICAL'
                });
            }
        }

        // 2. PRIVILEGE ESCALATION / SUSPICIOUS ROLE GRANT DETECTION
        if (entry.action === AuditLogEvent.MemberRoleUpdate) {
            // Check if any added roles are high management or admin
            const addedRoles = (entry.changes || []).find(c => c.key === '$add');
            if (addedRoles && addedRoles.new) {
                for (const r of addedRoles.new) {
                    const role = guild.roles.cache.get(r.id);
                    if (role && (role.permissions.has('Administrator') || role.name.toLowerCase().includes('founder') || role.name.toLowerCase().includes('director') || role.name.toLowerCase().includes('high rank'))) {
                        const flag = {
                            id: `FLAG-ROLES-${Date.now().toString().slice(-4)}`,
                            type: 'UNAUTHORIZED_PRIVILEGE_GRANT',
                            executor_id: executorId,
                            executor_tag: entry.executor.tag,
                            target_id: entry.targetId,
                            role_name: role.name,
                            timestamp: new Date().toISOString()
                        };

                        await db.addIaAuditFlag(flag);
                        await dispatchIaAlert(guild.client, {
                            title: '⚠️ [IA AUDIT ALERT] High-Rank Privilege Escalation Detected',
                            description: `Staff member <@${executorId}> (\`${entry.executor.tag}\`) granted privileged role **@${role.name}** to <@${entry.targetId}> in **${guild.name}**.\n\nPlease verify whether this promotion was authorized.`,
                            color: 0xF39C12,
                            priority: 'HIGH'
                        });
                    }
                }
            }
        }

        // 3. CHANNEL PERMISSION OVERWRITE TAMPERING
        if (entry.action === AuditLogEvent.ChannelOverwriteDelete || entry.action === AuditLogEvent.ChannelDelete) {
            const channel = guild.channels.cache.get(entry.targetId);
            const channelName = channel ? channel.name : 'Unknown Channel';

            if (channelName.includes('log') || channelName.includes('entry') || channelName.includes('audit')) {
                const flag = {
                    id: `FLAG-TAMPER-${Date.now().toString().slice(-4)}`,
                    type: 'LOG_CHANNEL_TAMPERING',
                    executor_id: executorId,
                    executor_tag: entry.executor.tag,
                    target_channel: channelName,
                    timestamp: new Date().toISOString()
                };

                await db.addIaAuditFlag(flag);
                await dispatchIaAlert(guild.client, {
                    title: '🚨 [IA TAMPERING ALERT] Log Channel Modification Detected',
                    description: `Staff member <@${executorId}> (\`${entry.executor.tag}\`) deleted or modified permissions on log channel **#${channelName}** in **${guild.name}**!`,
                    color: 0x962D22,
                    priority: 'CRITICAL'
                });
            }
        }
    } catch (err) {
        console.error('[IA AUDIT SCANNER ERROR]', err);
    }
}

/**
 * Dispatches high-priority alert to the Trust & Safety server
 */
async function dispatchIaAlert(client, { title, description, color, priority }) {
    try {
        const tsGuild = client.guilds.cache.get('1561767415044378694');
        if (!tsGuild) return;

        const alertCh = tsGuild.channels.cache.find(c => c.name.includes('ia-classified-briefings')) ||
                        tsGuild.channels.cache.find(c => c.name.includes('ia-staff-case-dockets'));

        if (alertCh) {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .addFields(
                    { name: '🚨 Priority', value: `\`${priority}\``, inline: true },
                    { name: '🛡️ Automated Monitor', value: 'FreshlyPlaza IA Anti-Abuse Sentinel', inline: true }
                )
                .setColor(color)
                .setFooter({ text: 'Immediate Internal Affairs review required.' })
                .setTimestamp();

            await alertCh.send({ content: priority === 'CRITICAL' ? '@everyone 🚨 **CRITICAL STAFF ABUSE DETECTION**' : undefined, embeds: [embed] });
        }
    } catch (e) {
        console.error('[IA ALERT DISPATCH ERROR]', e);
    }
}

module.exports = { handleAuditLogEntry };
