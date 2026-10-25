require('dotenv').config();
try {
    require('./utils/patchYtdl');
} catch (_) {}
const { Client, GatewayIntentBits, Partials, Collection, ActivityType, EmbedBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const config = require('./config');
const { initDatabase, getDb } = require('./database');
const { handleInteraction } = require('./handlers/interactionHandler');
const { handleHoneypotMessage } = require('./handlers/honeypotHandler');
const { handleGtnMessage } = require('./handlers/gtnHandler');
const { handleTicketChatMessage } = require('./handlers/ticketChatHandler');
const { handleDataEntriesMessage } = require('./handlers/dataEntriesHandler');
const { trackMessageForGhostPing, handleGhostPing } = require('./handlers/ghostPingHandler');
const { handleLoaPing } = require('./handlers/loaPingHandler');
const { handleIncomingModmailDm, handleStaffModmailMessage } = require('./handlers/modmailHandler');
const { setupAuditLogger } = require('./handlers/auditLogger');
const WebPortal = require('./utils/webPortal');
const musicManager = require('./utils/musicManager');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User
    ]
});

// Initialize Lavalink early so connector can bind raw gateway packets
musicManager.init(client);

// Safety net: a stray rejected promise (e.g. a Lavalink node 403) must never crash the whole bot
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason && reason.message ? reason.message : reason);
});

client.commands = new Collection();
let overrideStatus = null; // null (normal/UP), 'MAINTENANCE', 'DOWN', 'DEGRADED', 'PARTIAL_OUTAGE'
let overrideMessage = '';
let overrideSetAt = null;

// Centralized Health & Diagnostics Controller
client.healthControl = {
    setOverride: (status, message = '') => {
        overrideStatus = status;
        overrideMessage = message;
        overrideSetAt = new Date().toISOString();
        if (client.isReady()) {
            if (status === 'MAINTENANCE') {
                client.user.setPresence({
                    activities: [{ name: '⚠️ Under Maintenance • Grandway Shopping', type: ActivityType.Custom }],
                    status: 'dnd'
                });
            } else if (status === 'DOWN') {
                client.user.setPresence({
                    activities: [{ name: '🔴 System Offline / Down', type: ActivityType.Custom }],
                    status: 'invisible'
                });
            } else if (status === 'DEGRADED') {
                client.user.setPresence({
                    activities: [{ name: '⚠️ Degraded Performance • Latency', type: ActivityType.Custom }],
                    status: 'idle'
                });
            } else if (status === 'PARTIAL_OUTAGE') {
                client.user.setPresence({
                    activities: [{ name: '🟠 Partial Outage • Some Services Down', type: ActivityType.Custom }],
                    status: 'idle'
                });
            }
        }
        return { status: overrideStatus, message: overrideMessage, setAt: overrideSetAt };
    },
    reset: () => {
        overrideStatus = null;
        overrideMessage = '';
        overrideSetAt = null;
        if (client.isReady()) {
            client.user.setPresence({
                activities: [{ name: 'Grandway Shopping 🛒', type: ActivityType.Watching }],
                status: 'online'
            });
        }
        return { success: true };
    },
    getMetrics: () => {
        const isReady = client.isReady();
        const uptimeSeconds = Math.floor(process.uptime());
        let ping = client.ws.ping;
        const mem = process.memoryUsage();
        let memUsedMb = Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100;

        const isStressTesting = false;

        let computedStatus = 'UP';
        let reason = '';

        if (overrideStatus) {
            computedStatus = overrideStatus;
            reason = overrideMessage || (
                computedStatus === 'MAINTENANCE' ? 'Scheduled system maintenance in progress. Bot services are temporarily restricted.' :
                computedStatus === 'DOWN' ? 'Critical emergency outage detected. Bot is currently offline.' :
                computedStatus === 'DEGRADED' ? 'Degraded performance reported: operations may be slow or delayed.' :
                computedStatus === 'PARTIAL_OUTAGE' ? 'Partial service disruption: one or more bot features are temporarily impaired.' :
                'Manual operational status override active.'
            );
        } else {
            if (!isReady) {
                computedStatus = 'INITIALIZING';
                reason = 'Bot gateway client is initializing connection to Discord.';
            } else if (ping > 400) {
                computedStatus = 'DEGRADED';
                reason = `High Discord gateway latency detected (${ping}ms, exceeding 400ms threshold).`;
            } else if (memUsedMb > 450) {
                computedStatus = 'DEGRADED';
                reason = `Elevated memory consumption detected (${memUsedMb} MB, exceeding 450 MB threshold).`;
            } else {
                computedStatus = 'UP';
                reason = `All systems operational. Discord WebSocket gateway ping is healthy (${ping >= 0 ? `${ping}ms` : 'healthy'}) and memory usage is normal (${memUsedMb} MB).`;
            }
        }

        return {
            status: computedStatus,
            reason,
            status_reason: reason,
            why: reason,
            notice: reason,
            overrideStatus,
            overrideMessage,
            overrideSetAt,
            isStressTesting,
            stressTestType: null,
            stressRemainingSeconds: 0,
            stressExpiresAt: null,
            ping,
            memUsedMb,
            memTotalMb: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
            rssMb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
            uptimeSeconds
        };
    }
};

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const item = require(filePath);
    if (Array.isArray(item)) {
        for (const cmd of item) {
            if ('data' in cmd && 'execute' in cmd) {
                client.commands.set(cmd.data.name, cmd);
            }
        }
    } else if ('data' in item && 'execute' in item) {
        client.commands.set(item.data.name, item);
    }
}

client.once('clientReady', async () => {
    console.log(`==========================================`);
    console.log(`🚀 Grandway Shopping Discord Bot is ONLINE!`);
    console.log(`Logged in as: ${client.user.tag}`);
    console.log(`Registered Commands: ${client.commands.size}`);
    console.log(`==========================================`);

    // Initialize full server audit logger
    setupAuditLogger(client);

    await initDatabase();

    // Auto-sync / deploy slash commands with Discord API on startup
    try {
        const slashCommandsPayload = [];
        for (const cmd of client.commands.values()) {
            if (cmd.data && typeof cmd.data.toJSON === 'function') {
                slashCommandsPayload.push(cmd.data.toJSON());
            }
        }
        if (process.env.DISCORD_TOKEN && slashCommandsPayload.length > 0) {
            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
            const clientId = client.user.id;
            
            // Register to primary guild immediately (instant guild update, no 1-hour global cache delay)
            if (config.guildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, config.guildId), { body: slashCommandsPayload });
                console.log(`⚡ [AUTO-DEPLOY] Successfully synced ${slashCommandsPayload.length} slash commands to Guild (${config.guildId})`);
            }
            if (config.testGuildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, config.testGuildId), { body: slashCommandsPayload }).catch(() => null);
            }
            if (config.trustAndSafetyGuildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, config.trustAndSafetyGuildId), { body: slashCommandsPayload }).catch(() => null);
            }
        }
    } catch (deployErr) {
        console.warn('⚠️ [AUTO-DEPLOY] Could not auto-sync slash commands on startup:', deployErr.message);
    }

    // Pre-cache guild members and presences across guilds
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.fetch();
        } catch (e) {
            console.warn(`[STARTUP] Could not pre-fetch members for ${guild.name}:`, e.message);
        }
    }

    // Give the ticket override user access to every existing ticket channel
    try {
        const { syncTicketOverrides } = require('./utils/ticketAccess');
        await syncTicketOverrides(client.guilds.cache.get(config.guildId));
    } catch (e) {
        console.error('[TICKET OVERRIDE] Startup sync failed:', e);
    }

    // Automatically purge & close orphaned tickets from old servers or deleted channels
    try {
        const primaryGuild = client.guilds.cache.get(config.guildId);
        if (primaryGuild) {
            const db = require('./database').getDb();
            const tickets = db.getData().tickets || [];
            let cleaned = 0;
            for (const t of tickets) {
                if (t.status !== 'CLOSED' && t.status !== 'RESOLVED_BY_AI') {
                    const channelExists = primaryGuild.channels.cache.has(t.channel_id);
                    if (!channelExists) {
                        t.status = 'CLOSED';
                        t.closed_at = new Date().toISOString();
                        t.close_reason = 'Auto-closed: Legacy server migration / channel deleted';
                        cleaned++;
                    }
                }
            }
            if (cleaned > 0) {
                db.save();
                console.log(`🧹 [CLEANUP] Automatically closed ${cleaned} legacy tickets from old server / deleted channels.`);
            }
        }
    } catch (cleanErr) {
        console.error('[CLEANUP ERROR]', cleanErr.message);
    }

    // Live Rotating Presence Status (respects overrideStatus)
    let statusIndex = 0;
    const updatePresence = () => {
        try {
            if (overrideStatus === 'MAINTENANCE') {
                client.user.setPresence({
                    activities: [{ name: '⚠️ Under Maintenance • Grandway Shopping', type: ActivityType.Custom }],
                    status: 'dnd'
                });
                return;
            } else if (overrideStatus === 'DOWN') {
                client.user.setPresence({
                    activities: [{ name: '🔴 System Offline / Down', type: ActivityType.Custom }],
                    status: 'invisible'
                });
                return;
            } else if (overrideStatus === 'DEGRADED') {
                client.user.setPresence({
                    activities: [{ name: '⚠️ Degraded Performance • Latency', type: ActivityType.Custom }],
                    status: 'idle'
                });
                return;
            } else if (overrideStatus === 'PARTIAL_OUTAGE') {
                client.user.setPresence({
                    activities: [{ name: '🟠 Partial Outage • Some Services Down', type: ActivityType.Custom }],
                    status: 'idle'
                });
                return;
            }

            const guild = client.guilds.cache.get(config.guildId);
            const memberCount = guild ? guild.memberCount : '100+';
            const staffCount = guild ? guild.members.cache.filter(m => m.roles.cache.has(config.roles.staff) && !m.user.bot).size : 15;

            const statuses = [
                { name: 'Grandway Shopping 🛒', type: ActivityType.Watching },
                { name: `${memberCount} Fresh Customers 🏪`, type: ActivityType.Watching },
                { name: `${staffCount} Staff Members on Duty 👔`, type: ActivityType.Watching },
                { name: '/help • Fresh Grocery Needs 🥦', type: ActivityType.Playing },
                { name: 'Self-Checkouts & Tills 🧾', type: ActivityType.Custom },
                { name: 'Fresh Deals in Aisle 4! 🛍️', type: ActivityType.Listening },
                { name: 'your guesses || /gtn-start 🎲', type: ActivityType.Listening }
            ];

            const current = statuses[statusIndex % statuses.length];
            client.user.setPresence({
                activities: [{ name: current.name, type: current.type }],
                status: 'online'
            });
            statusIndex++;
        } catch (e) {
            console.error('[PRESENCE ROTATOR ERROR]', e);
        }
    };

    updatePresence();
    setInterval(updatePresence, 15000); // Rotates every 15 seconds

    // ⏰ Background Processor for Scheduled Shifts (persistent across bot restarts)
    const checkScheduledShifts = async () => {
        try {
            const { getDb } = require('./database');
            const db = getDb();
            const upcoming = await db.getUpcomingScheduledShifts();
            if (!upcoming || upcoming.length === 0) return;

            const now = Date.now();
            const shiftsChannelId = config.channels.shifts;
            const shiftsChannel = client.channels.cache.get(shiftsChannelId);

            for (const sched of upcoming) {
                const targetTime = new Date(sched.scheduled_for).getTime();
                const diffMs = targetTime - now;

                // 1. Send 5-minute reminder if within 5 mins and not reminded yet
                if (diffMs <= 5 * 60 * 1000 && diffMs > 0 && sched.status === 'SCHEDULED') {
                    sched.status = 'REMINDED_5M';
                    db.save();
                    if (shiftsChannel) {
                        await shiftsChannel.send({
                            content: `<@&${config.roles.shiftPing}> ⚠️ **5-MINUTE REMINDER:** Store shift hosted by <@${sched.host_id}> opens in **5 minutes**!\n👉 [Join Grandway Shopping Now](${sched.store_link || config.robloxGameLink})`
                        });
                    }
                }

                // 2. Automatically prompt shift start if scheduled time reached
                if (diffMs <= 0 && (sched.status === 'SCHEDULED' || sched.status === 'REMINDED_5M')) {
                    sched.status = 'DUE';
                    db.save();
                    if (shiftsChannel) {
                        await shiftsChannel.send({
                            content: `🔔 **SCHEDULED SHIFT DUE NOW:** <@${sched.host_id}>, your scheduled store shift is now due to begin!\nHost can run \`/session-start\` to officially open doors.`
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[SCHEDULED SHIFTS CHECKER ERROR]', err);
        }
    };

    setInterval(checkScheduledShifts, 30000); // Checks every 30 seconds
    checkScheduledShifts();

    // 🎫 Ticket SLA Monitor & Customer Inactivity Auto-Close Processor
    const checkTicketSlaAndInactivity = async () => {
        try {
            const { getDb } = require('./database');
            const db = getDb();
            const data = db.getData ? db.getData() : null;
            if (!data || !data.tickets) return;

            const now = Date.now();
            const openTickets = data.tickets.filter(t => t.status === 'OPEN' || t.status === 'CLAIMED' || t.status === 'ESCALATED');

            for (const ticket of openTickets) {
                const channel = client.channels.cache.get(ticket.channel_id);
                if (!channel) continue;

                const createdAt = new Date(ticket.created_at).getTime();

                // 1. Customer Reassurance Badge (Disabled per user request)
                // 2. Staff SLA Escalation Alert (Disabled per user request)

                // 3. Inactive Staff Auto-Unclaim: REMOVED (tickets stay claimed until staff unclaim/close them)

                // 2. Customer Inactivity Check: Staff has replied and awaiting customer
                if (ticket.last_staff_response_at && ticket.awaiting_customer) {
                    const lastStaffTime = new Date(ticket.last_staff_response_at).getTime();
                    const hoursSinceStaff = (now - lastStaffTime) / (1000 * 60 * 60);

                    // Warning after 24 hours of inactivity
                    if (hoursSinceStaff >= 24 && !ticket.customer_warned_at) {
                        ticket.customer_warned_at = new Date().toISOString();
                        db.save();

                        await channel.send({
                            content: `<@${ticket.user_id}> ⚠️ **Inactive Ticket Notice:** We have not heard from you in over **24 hours**. If you still require assistance, please reply to this message. Otherwise, this ticket will be closed automatically in 24 hours.`
                        });
                    }

                    // Auto-Close after 48 hours of inactivity
                    if (hoursSinceStaff >= 48) {
                        ticket.status = 'CLOSED';
                        ticket.closed_at = new Date().toISOString();
                        ticket.closed_by = 'AUTO_INACTIVITY';
                        ticket.close_reason = 'Closed automatically due to 48 hours of customer inactivity';
                        db.save();

                        await channel.send({
                            content: `🔒 **Auto-Closing Ticket:** No activity detected from customer for 48 hours. Generating transcript and closing...`
                        });

                        setTimeout(async () => {
                            try {
                                const { generateHtmlTranscript } = require('./utils/transcript');
                                const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
                                const html = await generateHtmlTranscript(channel, ticket);
                                const att = new AttachmentBuilder(Buffer.from(html, 'utf-8'), {
                                    name: `transcript-ticket-${ticket.id}.html`
                                });

                                const logCh = client.channels.cache.get(config.channels.ticketLogs);
                                if (logCh) {
                                    const logEmb = new EmbedBuilder()
                                        .setTitle(`🔒 Ticket #${ticket.id} Auto-Closed (Inactivity)`)
                                        .addFields(
                                            { name: 'Creator', value: `<@${ticket.user_id}>`, inline: true },
                                            { name: 'Category', value: ticket.type.toUpperCase(), inline: true },
                                            { name: 'Reason', value: '48h Customer Inactivity after Staff Response', inline: false }
                                        )
                                        .setColor(config.colors.neutral)
                                        .setTimestamp();
                                    await logCh.send({ embeds: [logEmb], files: [att] });
                                }
                                await channel.delete();
                            } catch (e) {
                                console.error('[AUTO CLOSE CLEANUP ERROR]', e);
                            }
                        }, 5000);
                    }
                }
            }
        } catch (err) {
            console.error('[TICKET SLA / INACTIVITY CHECK ERROR]', err);
        }
    };

    setInterval(checkTicketSlaAndInactivity, 60000); // Check tickets every 60 seconds

    // 🎫 Live Ticket Support Panel Auto-Updater (Updates queue, wait time, and staff count every 30s across all guilds)
    const updateLiveSupportPanel = async () => {
        try {
            const { getDb } = require('./database');
            const { buildTicketPanelEmbed } = require('./commands/ticket');
            const db = getDb();
            const settings = await db.getTicketSettings();

            for (const guild of client.guilds.cache.values()) {
                // Find support-center channels in this guild
                const channels = guild.channels.cache.filter(c => 
                    (settings && settings.panel_channel_id && c.id === settings.panel_channel_id) ||
                    (config.channels.supportCenter && c.id === config.channels.supportCenter) ||
                    (c.name && c.name.includes('support-center'))
                );

                for (const channel of channels.values()) {
                    try {
                        let targetMessage = null;
                        if (settings && settings.panel_message_id) {
                            targetMessage = await channel.messages.fetch(settings.panel_message_id).catch(() => null);
                        }
                        if (!targetMessage) {
                            // Find bot's panel embed in recent messages
                            const recent = await channel.messages.fetch({ limit: 10 }).catch(() => null);
                            if (recent) {
                                targetMessage = recent.find(m => m.author.id === client.user.id && m.embeds.some(e => e.title && e.title.includes('Support Center')));
                            }
                        }

                        if (targetMessage) {
                            const updatedEmbed = await buildTicketPanelEmbed(guild);
                            await targetMessage.edit({ embeds: [updatedEmbed] }).catch(() => null);
                        }
                    } catch (e) {}
                }
            }
        } catch (panelErr) {
            // Silently suppress background refresh errors if message is not accessible
        }
    };

    updateLiveSupportPanel();
    setInterval(updateLiveSupportPanel, 30000); // Live updates panel every 30 seconds

    // ⚖️ Startup Past Bans Scanner (Detects all existing bans and dispatches appeal form strictly once)
    const scanAndDispatchPastBans = async () => {
        try {
            const { getDb } = require('./database');
            const db = getDb();

            for (const guild of client.guilds.cache.values()) {
                console.log(`[BAN SCANNER] Checking existing bans for server: ${guild.name}...`);
                let bans;
                try {
                    bans = await guild.bans.fetch();
                } catch (e) {
                    console.warn(`[BAN SCANNER] Cannot fetch bans for ${guild.name} (Missing Ban Members permission): ${e.message}`);
                    continue;
                }

                console.log(`[BAN SCANNER] Found ${bans.size} total active bans in ${guild.name}. Checking unsent appeals...`);
                let dispatchedCount = 0;

                for (const ban of bans.values()) {
                    const { user, reason } = ban;
                    if (user.bot) continue;

                    const alreadySent = await db.hasBanAppealBeenSent(user.id);
                    if (alreadySent) continue;

                    const banReason = reason || 'Violation of Grandway Shopping community guidelines';

                    const appealEmbed = new EmbedBuilder()
                        .setTitle(`⚖️ Grandway Shopping — Notice of Server Ban & Appeal Information`)
                        .setDescription(
                            `Hello **${user.username}**,\n\n` +
                            `You have been banned from the **${guild.name}** Discord server.\n\n` +
                            `If you believe this ban was issued in error, or if you would like to submit a formal appeal to our High Rank (HR) Management team, please review the appeal process below.`
                        )
                        .addFields(
                            { name: '👤 Banned User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
                            { name: '📝 Stated Reason', value: `\`\`\`${banReason}\`\`\``, inline: false },
                            { 
                                name: '📋 How to Submit a Ban Appeal', 
                                value: 
                                    `1. **Wait Period:** We recommend waiting at least **48 hours** before submitting your appeal.\n` +
                                    `2. **Appeal Portal:** You can join our designated appeal server or submit an appeal using our official appeal format.\n` +
                                    `3. **Required Information:**\n` +
                                    `   • Your Discord Tag & User ID (\`${user.id}\`)\n` +
                                    `   • Your exact Roblox Username\n` +
                                    `   • Detailed reason explaining why your ban should be lifted and how you will follow server rules going forward.\n` +
                                    `4. **Note:** Trolling, harassing staff in DMs, or ban evading with alt accounts will result in an immediate, non-appealable blacklist.`
                            }
                        )
                        .setColor(config.colors.danger)
                        .setThumbnail(guild.iconURL({ dynamic: true }) || undefined)
                        .setFooter({ text: 'Grandway Shopping Moderation & Appeals Department' })
                        .setTimestamp();

                    try {
                        await user.send({ embeds: [appealEmbed] });
                        await db.markBanAppealSent(user.id, { user_tag: user.tag, reason: banReason, dispatched_by: 'STARTUP_SCANNER' });
                        dispatchedCount++;
                        console.log(`[BAN SCANNER] Dispatched appeal notice to ${user.tag} (${user.id})`);
                    } catch (dmErr) {
                        // Mark as handled to avoid retrying closed DMs endlessly on every reboot
                        await db.markBanAppealSent(user.id, { user_tag: user.tag, reason: banReason, dm_failed: true, dispatched_by: 'STARTUP_SCANNER' });
                        console.warn(`[BAN SCANNER] Could not DM ${user.tag} (DMs closed)`);
                    }

                    // Polite 1s rate-limit pause between DM dispatches
                    await new Promise(r => setTimeout(r, 1000));
                }

                if (dispatchedCount > 0) {
                    console.log(`[BAN SCANNER] Completed scan for ${guild.name}: dispatched ${dispatchedCount} new appeal notices.`);
                } else {
                    console.log(`[BAN SCANNER] All existing banned users in ${guild.name} have already received their appeal notice.`);
                }
            }
        } catch (err) {
            console.error('[BAN SCANNER ERROR]', err);
        }
    };

    // Run past bans scanner 5 seconds after startup
    setTimeout(scanAndDispatchPastBans, 5000);

    // Feature #2: Inactive Ticket Auto-Close & Ghost Warning (SLA) Monitor
    const { checkInactiveTickets } = require('./utils/ticketInactivity');
    setTimeout(() => checkInactiveTickets(client), 15000);
    setInterval(() => checkInactiveTickets(client), 5 * 60 * 1000); // Check every 5 minutes

    // 👔 Workforce Management: Automated 3-Day Shift & Training Hosting Reminder Callout
    const { triggerHostingReminder, checkOverdueStaffDataNotices } = require('./utils/workforceManager');
    setTimeout(() => triggerHostingReminder(client, false), 30000);
    setInterval(() => triggerHostingReminder(client, false), 60 * 60 * 1000); // Check every hour

    // 📋 Workforce Management: Overdue Staff Data Entry Auto-Termination Check
    setTimeout(() => checkOverdueStaffDataNotices(client), 45000);
    setInterval(() => checkOverdueStaffDataNotices(client), 15 * 60 * 1000); // Check every 15 minutes

    // 🕵️ Internal Affairs (IA): 30-Day Auto-Cleanup of Expired Wiretap Audio & Records
    const cleanupExpiredRecordings = async () => {
        try {
            const { getDb } = require('./database');
            const db = getDb();
            if (db && db.cleanupExpiredIaRecordings) {
                const count = await db.cleanupExpiredIaRecordings();
                if (count > 0) console.log(`[IA PURGE] Automatically purged ${count} expired wiretap recordings (30-day policy).`);
            }
        } catch (e) {
            console.error('[IA CLEANUP ERROR]', e);
        }
    };
    setTimeout(cleanupExpiredRecordings, 60000);
    setInterval(cleanupExpiredRecordings, 12 * 60 * 60 * 1000); // Purge check every 12 hours
});

// 🎫 Automatic Ticket Roles Auto-Assignment for HR+ & Staff
const SUPPORT_ROLE_KEYS = ['supportGeneral', 'supportReport', 'supportManagement', 'supportTechnical', 'supportAppeals'];

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        if (newMember.user.bot) return;

        const isHrOrHigher = newMember.roles.cache.has(config.roles.hr) ||
                             newMember.permissions.has('Administrator') ||
                             newMember.roles.cache.some(r => r.name.includes('High Rank') || r.name.includes('Executive') || r.name.includes('Director') || r.name.includes('Founder'));

        if (isHrOrHigher) {
            const supportRolesToAdd = [];
            for (const key of SUPPORT_ROLE_KEYS) {
                const roleId = config.roles[key];
                if (roleId && !newMember.roles.cache.has(roleId)) {
                    supportRolesToAdd.push(roleId);
                }
            }

            if (supportRolesToAdd.length > 0) {
                await newMember.roles.add(supportRolesToAdd, 'Auto-assigned all department ticket support roles for HR+');
                console.log(`[AUTO TICKET ROLES] Assigned ${supportRolesToAdd.length} ticket roles to HR+ member: ${newMember.user.tag}`);
            }
        }

        // 🛒 Dynamic Role Hierarchy Inheritance (Staff, MR, HR cascade)
        const rolesToAdd = [];

        // Check if member has ANY Store Colleague / Security / Staff specific role
        const hasSpecificStaffRole = newMember.roles.cache.some(r => {
            const n = r.name.toLowerCase();
            return n.includes('colleague') || n.includes('security') || n.includes('store staff') || n.includes('team leader') || n.includes('supervisor') || n.includes('corporate') || n.includes('director') || n.includes('intern');
        });

        // 1. Grant @Staff Member & @Low Rank (LR) if they hold any staff sub-role
        if (hasSpecificStaffRole) {
            if (config.roles.staff && !newMember.roles.cache.has(config.roles.staff)) {
                rolesToAdd.push(config.roles.staff);
            }
            const lrRoleId = '1510381751933861958'; // 🛒 │ Low Rank (LR)
            if (lrRoleId && !newMember.roles.cache.has(lrRoleId)) {
                rolesToAdd.push(lrRoleId);
            }
        }

        // 2. Grant @Management (MR) if they hold a Supervisor or Team Leader role
        const hasMrRole = newMember.roles.cache.some(r => {
            const n = r.name.toLowerCase();
            return n.includes('supervisor') || n.includes('team leader') || n.includes('management intern') || n.includes('store manager');
        });
        if (hasMrRole) {
            if (config.roles.mr && !newMember.roles.cache.has(config.roles.mr)) {
                rolesToAdd.push(config.roles.mr);
            }
            if (config.roles.staff && !newMember.roles.cache.has(config.roles.staff)) {
                rolesToAdd.push(config.roles.staff);
            }
        }

        // 3. Grant @High Rank (HR) if they hold Corporate, Director, or Foundership roles
        const hasHrRole = newMember.roles.cache.some(r => {
            const n = r.name.toLowerCase();
            return n.includes('corporate') || n.includes('director') || n.includes('financial officer') || n.includes('founder') || n.includes('trust & safety');
        });
        if (hasHrRole) {
            if (config.roles.hr && !newMember.roles.cache.has(config.roles.hr)) {
                rolesToAdd.push(config.roles.hr);
            }
            if (config.roles.mr && !newMember.roles.cache.has(config.roles.mr)) {
                rolesToAdd.push(config.roles.mr);
            }
            if (config.roles.staff && !newMember.roles.cache.has(config.roles.staff)) {
                rolesToAdd.push(config.roles.staff);
            }
        }

        if (rolesToAdd.length > 0) {
            await newMember.roles.add(rolesToAdd, 'Automatic Staff/MR/HR Role Hierarchy Cascade');
            console.log(`[ROLE HIERARCHY CASCADE] Auto-granted ${rolesToAdd.length} parent roles to ${newMember.user.tag}`);
        }
    } catch (err) {
        console.error('[AUTO TICKET / CASCADE ROLE ASSIGN ERROR]', err.message);
    }
});

// ⚖️ Ban Detection & Automated DM Appeal Form Dispatch
client.on('guildBanAdd', async (ban) => {
    try {
        const { user, guild, reason } = ban;
        if (user.bot) return;

        console.log(`[BAN DETECTED] User ${user.tag} (${user.id}) was banned in ${guild.name}. Reason: ${reason || 'None specified'}`);

        // Fetch audit logs for moderator attribution if available
        let moderatorTag = 'Grandway Shopping Moderation Team';
        try {
            const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: 22 }); // 22 = MEMBER_BAN_ADD
            const banLog = auditLogs.entries.first();
            if (banLog && banLog.target.id === user.id && banLog.executor) {
                moderatorTag = banLog.executor.tag;
            }
        } catch (e) {}

        const banReason = reason || 'Violation of Grandway Shopping community guidelines';

        const appealEmbed = new EmbedBuilder()
            .setTitle(`⚖️ Grandway Shopping — Notice of Server Ban & Appeal Information`)
            .setDescription(
                `Hello **${user.username}**,\n\n` +
                `You have been banned from the **${guild.name}** Discord server.\n\n` +
                `If you believe this ban was issued in error, or if you would like to submit a formal appeal to our High Rank (HR) Management team, please review the appeal process below.`
            )
            .addFields(
                { name: '👤 Banned User', value: `${user.tag} (\`${user.id}\`)`, inline: true },
                { name: '🛡️ Actioned By', value: moderatorTag, inline: true },
                { name: '📝 Stated Reason', value: `\`\`\`${banReason}\`\`\``, inline: false },
                { 
                    name: '📋 How to Submit a Ban Appeal', 
                    value: 
                        `1. **Wait Period:** We recommend waiting at least **48 hours** before submitting your appeal.\n` +
                        `2. **Appeal Portal:** You can join our designated appeal server or submit an appeal using our official appeal format.\n` +
                        `3. **Required Information:**\n` +
                        `   • Your Discord Tag & User ID (\`${user.id}\`)\n` +
                        `   • Your exact Roblox Username\n` +
                        `   • Detailed reason explaining why your ban should be lifted and how you will follow server rules going forward.\n` +
                        `4. **Note:** Trolling, harassing staff in DMs, or ban evading with alt accounts will result in an immediate, non-appealable blacklist.`
                }
            )
            .setColor(config.colors.danger)
            .setThumbnail(guild.iconURL({ dynamic: true }) || undefined)
            .setFooter({ text: 'Grandway Shopping Moderation & Appeals Department' })
            .setTimestamp();

        // Check if appeal has already been dispatched to this user
        const { getDb } = require('./database');
        const db = getDb();
        const alreadySent = await db.hasBanAppealBeenSent(user.id);
        if (alreadySent) {
            console.log(`[BAN APPEAL DM] Notice already sent previously to ${user.tag} (${user.id}). Skipping.`);
            return;
        }

        try {
            await user.send({ embeds: [appealEmbed] });
            await db.markBanAppealSent(user.id, { user_tag: user.tag, reason: banReason });
            console.log(`[BAN APPEAL DM] Successfully delivered appeal notice to ${user.tag}`);
        } catch (dmErr) {
            // Still mark as attempted so we don't spam closed DMs on every bot restart
            await db.markBanAppealSent(user.id, { user_tag: user.tag, reason: banReason, dm_failed: true });
            console.warn(`[BAN APPEAL DM FAILED] Could not DM ${user.tag}: ${dmErr.message}`);
        }

        // Also log to server ban logs channel if configured
        const banLogsChannelId = config.channels.serverBanLogs || config.channels.modLogs || config.channels.punishmentLogs;
        if (banLogsChannelId) {
            const ch = guild.channels.cache.get(banLogsChannelId);
            if (ch) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('⛔ Server Ban Actioned & Appeal Notice Dispatched')
                    .addFields(
                        { name: 'Banned User', value: `<@${user.id}> (${user.tag})`, inline: true },
                        { name: 'Reason', value: banReason, inline: false }
                    )
                    .setColor(config.colors.danger)
                    .setTimestamp();
                await ch.send({ embeds: [logEmbed] });
            }
        }
    } catch (err) {
        console.error('[BAN LISTENER ERROR]', err);
    }
});

client.on('messageCreate', async (message) => {
    // 📬 ModMail DMs & Staff Channel Relays
    if (!message.guild) {
        await handleIncomingModmailDm(message, client);
        return;
    }

    trackMessageForGhostPing(message);
    await handleHoneypotMessage(message);
    await handleGtnMessage(message);
    const wasHandledByModmail = await handleStaffModmailMessage(message, client);
    if (!wasHandledByModmail) {
        await handleTicketChatMessage(message);
    }
    await handleDataEntriesMessage(message);
    await handleLoaPing(message);
});

client.on('messageDelete', async (message) => {
    await handleGhostPing(message);
});

// 🕵️ Internal Affairs (IA): Real-Time Audit Log & Staff Abuse Scanner
const { handleAuditLogEntry } = require('./handlers/iaAuditScanner');
client.on('guildAuditLogEntryCreate', async (entry, guild) => {
    await handleAuditLogEntry(entry, guild);
});

// 🎭 Auto-Role on Member Join
client.on('guildMemberAdd', async (member) => {
    try {
        if (member.user.bot) return;

        const { getDb } = require('./database');
        const db = getDb();
        const dbRoles = db.getAutoRoles();
        const targetRoleIds = dbRoles.length > 0 ? dbRoles : (config.autoRoles || [config.roles.customer]);

        const rolesToAdd = [];
        for (const roleId of targetRoleIds) {
            if (!roleId) continue;
            const role = member.guild.roles.cache.get(roleId);
            if (role) {
                rolesToAdd.push(role);
            }
        }

        if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd, 'Grandway Shopping Automated Onboarding Auto-Role');
            console.log(`[AUTOROLE] Assigned ${rolesToAdd.map(r => r.name).join(', ')} to @${member.user.tag} (${member.id})`);
        }
    } catch (err) {
        console.error(`[AUTOROLE ERROR] Could not assign auto-roles to @${member.user.tag}:`, err.message);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[COMMAND ERROR] /${interaction.commandName}:`, error);
            const errPayload = { content: '❌ There was an error executing this command!', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errPayload);
            } else {
                await interaction.reply(errPayload);
            }
        }
    } else {
        try {
            await handleInteraction(interaction);
        } catch (error) {
            console.error('[INTERACTION ERROR]', error);
        }
    }
});

// ==========================================
// 🌐 HTTP Health Check Server (For Website / Uptime Pings)
// ==========================================
const PORT = process.env.SERVER_PORT || process.env.PORT || 26134 || 3000;
const server = http.createServer(async (req, res) => {
    // Enable CORS so your external website can fetch it
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname.toLowerCase();

    const getReasonParam = (url, fallback = '') => {
        return url.searchParams.get('reason') ||
               url.searchParams.get('why') ||
               url.searchParams.get('msg') ||
               url.searchParams.get('message') ||
               url.searchParams.get('details') ||
               fallback;
    };

    // Routes that change the public bot status require HEALTH_API_TOKEN.
    // Fail closed: if the token is not configured, nothing can change status over HTTP.
    const STATUS_WRITE_ROUTES = [
        '/set-status', '/override', '/status-set',
        '/maintenance', '/set-maintenance',
        '/down', '/offline', '/set-down',
        '/degraded', '/set-degraded',
        '/partial-outage', '/set-partial-outage', '/partial',
        '/reset', '/normal', '/set-up'
    ];
    if (STATUS_WRITE_ROUTES.includes(pathname)) {
        const expected = process.env.HEALTH_API_TOKEN || '';
        const provided = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') || (req.headers['x-api-token'] || '');
        const authorized = expected.length > 0 && provided.length === expected.length &&
            crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
        if (!authorized) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Unauthorized: send the HEALTH_API_TOKEN as an Authorization: Bearer header.' }));
        }
    }

    // 1. Unified SET STATUS & WHY Endpoint
    if (pathname === '/set-status' || pathname === '/override' || pathname === '/status-set') {
        const rawStatus = (parsedUrl.searchParams.get('status') || '').toUpperCase().trim();
        const serviceName = parsedUrl.searchParams.get('service') || '';
        const defaultReason = rawStatus === 'MAINTENANCE' ? 'Scheduled system maintenance in progress. Bot services are temporarily restricted.' :
                              rawStatus === 'DOWN' || rawStatus === 'OFFLINE' ? 'Critical emergency outage detected. Bot is currently offline.' :
                              rawStatus === 'DEGRADED' ? 'Degraded performance reported: operations may be slow or delayed.' :
                              rawStatus === 'PARTIAL_OUTAGE' || rawStatus === 'PARTIAL' ? (serviceName ? `Partial outage: ${serviceName} is temporarily unavailable.` : 'Partial service disruption detected.') :
                              'All systems operational. Automatic health monitoring active.';
        const reason = getReasonParam(parsedUrl, defaultReason);

        if (!rawStatus || rawStatus === 'UP' || rawStatus === 'NORMAL' || rawStatus === 'RESET') {
            client.healthControl.reset();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                success: true,
                status: 'UP',
                reason: reason || 'All systems operational. Automatic health monitoring active.',
                why: reason || 'All systems operational. Automatic health monitoring active.',
                mode_type: 'AUTOMATIC',
                note: 'Bot status reset to NORMAL / UP (HTTP 200 on /health).',
                timestamp: new Date().toISOString()
            }, null, 2));
        }

        const normalizedStatus = rawStatus === 'OFFLINE' ? 'DOWN' : (rawStatus === 'PARTIAL' ? 'PARTIAL_OUTAGE' : rawStatus);
        const validStatuses = ['MAINTENANCE', 'DOWN', 'DEGRADED', 'PARTIAL_OUTAGE'];

        if (!validStatuses.includes(normalizedStatus)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                error: `Invalid status '${rawStatus}'. Supported statuses: UP, MAINTENANCE, DOWN, DEGRADED, PARTIAL_OUTAGE`,
                usage: '/set-status?status=MAINTENANCE&reason=Database+upgrade+in+progress'
            }, null, 2));
        }

        client.healthControl.setOverride(normalizedStatus, reason);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            status: normalizedStatus,
            reason: reason,
            why: reason,
            mode_type: 'MANUAL_OVERRIDE',
            note: `Bot status is now set to ${normalizedStatus}.`,
            timestamp: new Date().toISOString()
        }, null, 2));
    }

    // 2. Trigger MAINTENANCE Mode
    if (pathname === '/maintenance' || pathname === '/set-maintenance') {
        const reason = getReasonParam(parsedUrl, 'Scheduled system maintenance in progress. Bot services are temporarily restricted.');
        client.healthControl.setOverride('MAINTENANCE', reason);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            status: 'MAINTENANCE',
            mode: 'MAINTENANCE',
            reason: reason,
            why: reason,
            note: 'Bot status is now reporting MAINTENANCE (HTTP 503 on /health, DND on Discord).',
            timestamp: overrideSetAt
        }, null, 2));
    }

    // 3. Trigger DOWN / OFFLINE Mode
    if (pathname === '/down' || pathname === '/offline' || pathname === '/set-down') {
        const reason = getReasonParam(parsedUrl, 'Critical emergency outage detected. Bot is currently offline.');
        client.healthControl.setOverride('DOWN', reason);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            status: 'DOWN',
            mode: 'DOWN',
            reason: reason,
            why: reason,
            note: 'Bot status is now reporting DOWN / OFFLINE (HTTP 503 on /health, invisible on Discord).',
            timestamp: overrideSetAt
        }, null, 2));
    }

    // 4. Trigger DEGRADED Mode (Manual touch)
    if (pathname === '/degraded' || pathname === '/set-degraded') {
        const reason = getReasonParam(parsedUrl, 'Degraded performance reported: elevated response times / gateway latency.');
        client.healthControl.setOverride('DEGRADED', reason);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            status: 'DEGRADED',
            mode: 'DEGRADED',
            reason: reason,
            why: reason,
            note: 'Bot status is now reporting DEGRADED (HTTP 200 on /health with degraded status tag, Idle on Discord).',
            timestamp: overrideSetAt
        }, null, 2));
    }

    // 5. Trigger PARTIAL_OUTAGE Mode (Manual touch)
    if (pathname === '/partial-outage' || pathname === '/set-partial-outage' || pathname === '/partial') {
        const serviceName = parsedUrl.searchParams.get('service') || 'Internal feature';
        const defaultReason = `Partial outage: ${serviceName} is temporarily unavailable.`;
        const reason = getReasonParam(parsedUrl, defaultReason);
        client.healthControl.setOverride('PARTIAL_OUTAGE', reason);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            status: 'PARTIAL_OUTAGE',
            mode: 'PARTIAL_OUTAGE',
            service: serviceName,
            reason: reason,
            why: reason,
            note: 'Bot status is now reporting PARTIAL_OUTAGE (HTTP 503 on /health, Idle on Discord).',
            timestamp: overrideSetAt
        }, null, 2));
    }

    // 7. RESET back to Normal / Automatic Mode
    if (pathname === '/reset' || pathname === '/normal' || pathname === '/set-up') {
        client.healthControl.reset();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            status: 'UP',
            mode: 'AUTOMATIC (UP)',
            reason: 'All overrides cleared. Automatic health monitoring active.',
            why: 'All overrides cleared. Automatic health monitoring active.',
            note: 'Bot status has been reset to NORMAL / UP (HTTP 200 on /health).',
            timestamp: new Date().toISOString()
        }, null, 2));
    }

    // 7.1. Public Punishment & Ban Appeal Portal (/appeal)
    if (pathname === '/appeal') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(WebPortal.renderAppealPage());
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const parsed = new URLSearchParams(body);
                    const discordId = (parsed.get('discordId') || '').trim();
                    const robloxUsername = (parsed.get('robloxUsername') || '').trim();
                    const appealType = (parsed.get('appealType') || 'Discord Server Ban').trim();
                    const reason = (parsed.get('reason') || '').trim();
                    const statement = (parsed.get('statement') || '').trim();
                    const prevention = (parsed.get('prevention') || '').trim();

                    if (!discordId || !robloxUsername || !statement) {
                        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                        return res.end(WebPortal.renderAppealPage('Please fill out all required fields.'));
                    }

                    // Forward to appeals channel in Discord
                    const appealsChannelId = config.channels.activityAppeals || config.channels.ticketLogs || config.channels.modLogs;
                    const channel = client.channels.cache.get(appealsChannelId);
                    if (channel) {
                        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                        const appealEmbed = new EmbedBuilder()
                            .setTitle(`⚖️ Web Appeal Submitted: ${appealType}`)
                            .setDescription(`An official punishment appeal has been submitted via the **Grandway Web Portal**.`)
                            .addFields(
                                { name: '👤 Discord Identity', value: '`' + discordId + '`', inline: true },
                                { name: '🎮 Roblox Username', value: `**${robloxUsername}**`, inline: true },
                                { name: '⚖️ Punishment Type', value: appealType, inline: true },
                                { name: '📝 Stated Reason', value: ```${reason}```, inline: false },
                                { name: '❓ Why should this be appealed?', value: statement.slice(0, 1024), inline: false },
                                { name: '🛡️ Future Commitments', value: prevention.slice(0, 1024), inline: false }
                            )
                            .setColor(config.colors.secondary)
                            .setFooter({ text: 'Grandway Web Appeal Portal' })
                            .setTimestamp();

                        await channel.send({
                            content: `📢 **NEW WEB APPEAL SUBMITTED:** ${robloxUsername} (${appealType})`,
                            embeds: [appealEmbed]
                        });
                    }

                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    return res.end(WebPortal.renderAppealPage(null, 'Your appeal has been successfully submitted! Grandway Leadership has received your statement and will review it shortly.'));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                    return res.end(WebPortal.renderAppealPage('Failed to submit appeal: ' + err.message));
                }
            });
            return;
        }
    }

    // 7.2. Colleague & Shift Leaderboard (/leaderboard)
    if (pathname === '/leaderboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(WebPortal.renderLeaderboardPage());
    }

    // 7.3. Staff Web Dashboard (/staff)
    if (pathname === '/staff') {
        const db = getDb();
        const data = db.getData();
        const settings = await db.getTicketSettings();
        const allTickets = data.tickets || [];
        const activeTickets = allTickets.filter(t => t.status !== 'CLOSED' && t.status !== 'RESOLVED_BY_AI');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(WebPortal.renderStaffDashboard(true, activeTickets, allTickets, settings));
    }

    // 7.4. Staff Web Actions API (/api/staff/reply & /api/staff/close)
    if (pathname === '/api/staff/reply' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ticketId, text, isAnon } = JSON.parse(body);
                const db = getDb();
                const ticket = await db.getTicketById(ticketId);
                if (!ticket || ticket.status === 'CLOSED') {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Active ticket not found' }));
                }

                const targetUser = await client.users.fetch(ticket.user_id);
                if (!targetUser) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Could not fetch user' }));
                }

                const { EmbedBuilder } = require('discord.js');
                const dmEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: isAnon ? `${config.storeName} ModMail Team 🛡️` : 'Grandway Staff Web Operator',
                        iconURL: client.user.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription(text)
                    .setColor(config.colors.secondary)
                    .setFooter({ text: `${config.storeName} Official Response • Web Operator` })
                    .setTimestamp();

                await targetUser.send({ embeds: [dmEmbed] });

                // Also notify staff channel in Discord
                if (ticket.channel_id) {
                    const ch = client.channels.cache.get(ticket.channel_id);
                    if (ch) {
                        const receipt = new EmbedBuilder()
                            .setAuthor({ name: '🌐 Web Dashboard Operator' })
                            .setDescription(text)
                            .setColor(config.colors.secondary)
                            .setFooter({ text: 'Dispatched via Staff Web Dashboard' })
                            .setTimestamp();
                        await ch.send({ embeds: [receipt] });
                    }
                }

                await db.addTicketNote(ticket.channel_id, 'WEB_OPERATOR', `[WEB REPLY]: ${text}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.4.1. Get Ticket Chat History for Web Drawer
    if (pathname.startsWith('/api/staff/ticket/') && pathname.endsWith('/messages')) {
        const ticketId = pathname.replace('/api/staff/ticket/', '').replace('/messages', '');
        const db = getDb();
        const ticket = await db.getTicketById(ticketId);
        if (!ticket) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Ticket not found' }));
        }

        let messagesList = [];
        if (ticket.channel_id) {
            const ch = client.channels.cache.get(ticket.channel_id);
            if (ch) {
                try {
                    const fetched = await ch.messages.fetch({ limit: 40 });
                    messagesList = Array.from(fetched.values()).reverse().map(m => ({
                        id: m.id,
                        author: m.author.username,
                        content: m.content || (m.embeds.length > 0 ? (m.embeds[0].description || '[Embed]') : '[Attachment]'),
                        isStaff: m.author.id !== ticket.user_id,
                        isAnon: m.author.bot,
                        time: new Date(m.createdTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }));
                } catch (_) {}
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            ticket,
            messages: messagesList,
            notes: ticket.notes || []
        }));
    }

    // 7.4.2. Staff Internal Whisper from Web Drawer
    if (pathname === '/api/staff/whisper' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ticketId, text } = JSON.parse(body);
                const db = getDb();
                const ticket = await db.getTicketById(ticketId);
                if (!ticket) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Ticket not found' }));
                }

                await db.addTicketNote(ticket.channel_id, 'WEB_STAFF', text);

                if (ticket.channel_id) {
                    const ch = client.channels.cache.get(ticket.channel_id);
                    if (ch) {
                        const { EmbedBuilder } = require('discord.js');
                        const noteEmbed = new EmbedBuilder()
                            .setAuthor({ name: '🔒 Staff Internal Whisper (Web Dashboard)' })
                            .setDescription(text)
                            .setColor(0xF1C40F)
                            .setFooter({ text: 'Internal Staff Whisper • Not sent to customer DM' })
                            .setTimestamp();
                        await ch.send({ embeds: [noteEmbed] });
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.4.3. Update Configurable Support Wait Time & Auto-Update Discord Panel
    if (pathname === '/api/staff/wait-time' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { waitTime } = JSON.parse(body);
                const db = getDb();
                await db.updateTicketSettings({ custom_wait_time: waitTime || null });

                // Trigger Discord #support-center panel embed update immediately
                const { buildTicketPanelEmbed } = require('./commands/ticket');
                const primaryGuild = client.guilds.cache.get(config.guildId);
                if (primaryGuild) {
                    const supportChan = primaryGuild.channels.cache.get(config.channels.supportCenter);
                    if (supportChan) {
                        const recent = await supportChan.messages.fetch({ limit: 10 }).catch(() => null);
                        const targetMsg = recent ? recent.find(m => m.author.id === client.user.id) : null;
                        if (targetMsg) {
                            const newEmbed = await buildTicketPanelEmbed(primaryGuild);
                            await targetMsg.edit({ embeds: [newEmbed] }).catch(() => null);
                        }
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, waitTime }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.4.4. Set Ticket Priority
    if (pathname === '/api/staff/priority' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ticketId, priority } = JSON.parse(body);
                const db = getDb();
                const ticket = await db.getTicketById(ticketId);
                if (!ticket) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Ticket not found' }));
                }

                ticket.priority = ['NORMAL', 'HIGH', 'URGENT'].includes(priority) ? priority : 'NORMAL';
                db.save();

                if (ticket.channel_id) {
                    const ch = client.channels.cache.get(ticket.channel_id);
                    if (ch) {
                        const { EmbedBuilder } = require('discord.js');
                        const pEmbed = new EmbedBuilder()
                            .setTitle(`⭐ Priority Updated: ${ticket.priority}`)
                            .setDescription(`This ModMail thread priority has been updated via the Staff Web Dashboard.`)
                            .setColor(ticket.priority === 'URGENT' ? config.colors.danger : (ticket.priority === 'HIGH' ? config.colors.warning : config.colors.primary))
                            .setTimestamp();
                        await ch.send({ embeds: [pEmbed] });
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, priority: ticket.priority }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.4.5. Transfer Ticket Department
    if (pathname === '/api/staff/transfer' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ticketId, category } = JSON.parse(body);
                const db = getDb();
                const ticket = await db.getTicketById(ticketId);
                if (!ticket) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Ticket not found' }));
                }

                ticket.type = category;
                db.save();

                if (ticket.channel_id) {
                    const ch = client.channels.cache.get(ticket.channel_id);
                    if (ch) {
                        const { EmbedBuilder } = require('discord.js');
                        const tEmbed = new EmbedBuilder()
                            .setTitle(`🔄 Department Transferred: ${category.toUpperCase()}`)
                            .setDescription(`This ModMail thread has been reassigned to **${category.toUpperCase()}** via the Staff Web Dashboard.`)
                            .setColor(config.colors.secondary)
                            .setTimestamp();
                        await ch.send({ embeds: [tEmbed] });
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, category }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.4.6. 1-Click ModMail Blacklist
    if (pathname === '/api/staff/blacklist' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { userId, reason } = JSON.parse(body);
                const db = getDb();
                await db.setTicketBlacklist(userId, 'WEB_STAFF', reason || 'Blacklisted via Staff Web Dashboard');

                // Also close active ticket if any
                const active = await db.getActiveUserTicket(userId);
                if (active) {
                    const { closeModmailThread } = require('./handlers/modmailHandler');
                    const ch = client.channels.cache.get(active.channel_id);
                    if (ch) {
                        await closeModmailThread({
                            channel: ch,
                            ticket: active,
                            closedBy: client.user,
                            reason: 'User Blacklisted: ' + (reason || 'Blacklisted via Web Dashboard'),
                            guild: ch.guild || client.guilds.cache.get(config.guildId),
                            client
                        });
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/staff/close' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { ticketId, reason } = JSON.parse(body);
                const db = getDb();
                const ticket = await db.getTicketById(ticketId);
                if (!ticket) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Ticket not found' }));
                }

                const { closeModmailThread } = require('./handlers/modmailHandler');
                const ch = client.channels.cache.get(ticket.channel_id);
                if (ch) {
                    await closeModmailThread({
                        channel: ch,
                        ticket,
                        closedBy: client.user,
                        reason: reason || 'Closed via Web Dashboard',
                        guild: ch.guild || client.guilds.cache.get(config.guildId),
                        client
                    });
                } else {
                    ticket.status = 'CLOSED';
                    ticket.closed_at = new Date().toISOString();
                    ticket.closed_by = client.user ? client.user.id : 'SYSTEM';
                    ticket.close_reason = reason || 'Closed via Web Dashboard';
                    db.save();
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.4.7. Force-Open ModMail from Web Portal
    if (pathname === '/api/staff/force-open' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { userId, category = 'general', reason = 'Staff inquiry' } = JSON.parse(body);
                if (!userId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'User ID is required' }));
                }

                const db = getDb();
                const isBlacklisted = await db.isTicketBlacklisted(userId);
                if (isBlacklisted) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'User is currently blacklisted from ModMail.' }));
                }

                const activeTicket = await db.getActiveUserTicket(userId);
                if (activeTicket) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: `User already has an active ModMail thread (#${activeTicket.id}).` }));
                }

                const guild = client.guilds.cache.get(config.guildId);
                if (!guild) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Discord Guild not found in bot cache.' }));
                }

                const user = await client.users.fetch(userId).catch(() => null);
                if (!user) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Discord user not found. Please verify the User ID.' }));
                }

                const { createModmailThread } = require('./handlers/modmailHandler');
                const ticketRecord = await createModmailThread({
                    guild,
                    user,
                    categoryKey: category,
                    subject: `[STAFF INITIATED] ${reason}`,
                    details: `Force-opened by Staff Web Command Center: ${reason}`,
                    client
                });

                if (!ticketRecord) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'Could not create ModMail thread. Check bot channel/DM permissions.' }));
                }

                // Send notification in the staff thread channel
                const staffChannel = client.channels.cache.get(ticketRecord.channel_id);
                if (staffChannel) {
                    await staffChannel.send({
                        content: `🚨 **STAFF FORCE-OPENED MODMAIL THREAD**\nInitiated via Web Command Center for reason: **${reason}**\nUser: <@${user.id}> (${user.tag})`
                    }).catch(() => {});
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, ticketId: ticketRecord.id }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.5. Online Ticket Transcript Web Viewer (Supports both archived transcripts and LIVE active tickets)
    if (pathname.startsWith('/transcript/')) {
        const ticketId = pathname.replace('/transcript/', '').replace(/\/$/, '');
        const db = getDb();
        const data = db.getData();
        const record = data.transcripts && data.transcripts[ticketId];

        if (record && record.html) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(record.html);
        }

        // If not in archived transcripts, check if it's an active or open ticket and generate live transcript
        try {
            const ticket = await db.getTicketById(ticketId);
            if (ticket && ticket.channel_id) {
                const ch = client.channels.cache.get(ticket.channel_id) || await client.channels.fetch(ticket.channel_id).catch(() => null);
                if (ch) {
                    const { generateHtmlTranscript } = require('./utils/transcript');
                    const liveHtml = await generateHtmlTranscript(ch, ticket);
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    return res.end(liveHtml);
                }
            }
        } catch (liveErr) {
            console.error('[LIVE TRANSCRIPT ERROR]', liveErr);
        }

        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`
            <!DOCTYPE html>
            <html><head><title>Transcript Not Found</title></head>
            <body style="font-family: sans-serif; background: #0f172a; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh;">
                <div style="text-align: center;">
                    <h1>404 - Transcript Not Found</h1>
                    <p style="color: #94a3b8;">Ticket transcript #${ticketId} does not exist or has expired.</p>
                </div>
            </body></html>
        `);
    }

    // 7.6. Music Command Center Web Dashboard (static live shell; data comes from /api/music/state)
    if (pathname === '/music') {
        const { renderMusicDashboard } = require('./utils/musicDashboard');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(renderMusicDashboard());
    }

    // 7.7. Music Dynamic Banner SVG
    if (pathname === '/music/banner') {
        const musicManager = require('./utils/musicManager');
        const { generateNowPlayingSvg } = require('./utils/bannerGenerator');
        const guild = client.guilds.cache.get(config.guildId);
        const queue = guild ? musicManager.getQueue(guild.id) : null;
        const track = (queue && queue.currentTrack) ? queue.currentTrack : {
            title: 'No Track Playing',
            author: 'Grandway Music System',
            duration: '0:00',
            seconds: 1,
            thumbnail: null
        };

        const svg = generateNowPlayingSvg(track, queue);
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
        return res.end(svg);
    }

    // 7.8. Music Dashboard API Controls
    if (pathname === '/api/music/control' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { action, seconds } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (!guild) return res.end(JSON.stringify({ error: 'Guild not ready' }));
                const queue = musicManager.getQueue(guild.id);

                if (action === 'toggle_pause') {
                    if (queue.player && (queue.player.paused || (queue.player.state && queue.player.state.status === 'paused'))) {
                        queue.resume();
                    } else {
                        queue.pause();
                    }
                } else if (action === 'skip') {
                    queue.skip();
                } else if (action === 'stop') {
                    queue.stop();
                } else if (action === 'shuffle') {
                    queue.shuffle();
                } else if (action === 'clear') {
                    queue.queue = [];
                } else if (action === 'seek' && seconds !== undefined) {
                    if (queue.player && queue.currentTrack) {
                        const targetMs = Math.max(0, Math.floor(seconds * 1000));
                        if (typeof queue.player.seekTo === 'function') {
                            await queue.player.seekTo(targetMs);
                        } else if (queue.player.playTrack) {
                            await queue.player.playTrack({ track: { encoded: queue.currentTrack.encoded }, position: targetMs });
                        }
                        queue.playbackStartTime = Date.now() - (seconds * 1000);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // 7.8.1 YouTube Instant Autocomplete Search
    if (pathname === '/api/music/search' && req.method === 'GET') {
        try {
            const parsed = new URL(req.url, `http://${req.headers.host}`);
            const query = parsed.searchParams.get('q');
            if (!query || !query.trim()) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify([]));
            }

            const yts = require('yt-search');
            const searchRes = await yts(query.trim());
            const videos = (searchRes && searchRes.videos ? searchRes.videos.slice(0, 5) : []).map(v => ({
                title: v.title,
                url: v.url,
                duration: v.timestamp || `${Math.floor(v.seconds / 60)}:${(v.seconds % 60).toString().padStart(2, '0')}`,
                seconds: v.seconds,
                author: v.author ? v.author.name : 'Unknown Artist',
                thumbnail: v.thumbnail || v.image || null
            }));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(videos));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: e.message }));
        }
    }

    if (pathname === '/api/music/volume' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { volume } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (guild) {
                    const queue = musicManager.getQueue(guild.id);
                    queue.setVolume(volume);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/music/filter' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { filter, speed } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (guild) {
                    const queue = musicManager.getQueue(guild.id);
                    await queue.applyFilter(filter, speed === undefined ? null : speed);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/music/loop' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { mode } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (guild) {
                    const queue = musicManager.getQueue(guild.id);
                    queue.loopMode = mode;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/music/queue' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { query } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (!guild) return res.end(JSON.stringify({ error: 'Guild unavailable' }));
                const queue = musicManager.getQueue(guild.id);

                // Auto find default voice channel if disconnected
                if (!queue.connection) {
                    const defaultVc = guild.channels.cache.find(c => c.isVoiceBased() && c.name.includes('Music')) || guild.channels.cache.find(c => c.isVoiceBased());
                    const defaultText = guild.channels.cache.find(c => c.name === 'music-commands') || guild.channels.cache.find(c => c.isTextBased());
                    if (defaultVc && defaultText) {
                        await queue.connect(defaultVc, defaultText);
                    }
                }

                const resolved = await musicManager.resolveQuery(query, client.user);
                if (resolved.type === 'empty') {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ error: 'No songs found matching query' }));
                }

                if (resolved.type === 'playlist') {
                    resolved.tracks.forEach(t => queue.queue.push(t));
                    if (!queue.isPlaying && !queue.currentTrack) {
                        queue.playTrack(queue.queue.shift());
                    }
                } else {
                    const track = resolved.type === 'track' ? resolved.track : resolved.topTrack;
                    if (queue.isPlaying || queue.currentTrack) {
                        queue.queue.push(track);
                    } else {
                        queue.playTrack(track);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/music/queue/delete' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { index, url } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (guild) {
                    const queue = musicManager.getQueue(guild.id);
                    // Guard against stale clients: only remove if the track at that index is the one the user clicked
                    if (!url || (queue.queue[index] && queue.queue[index].url === url)) {
                        queue.remove(index);
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/music/queue/reorder' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { from, to, url } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (guild) {
                    const queue = musicManager.getQueue(guild.id);
                    const fresh = !url || (queue.queue[from] && queue.queue[from].url === url);
                    if (fresh && from >= 0 && from < queue.queue.length && to >= 0 && to < queue.queue.length) {
                        const [moved] = queue.queue.splice(from, 1);
                        queue.queue.splice(to, 0, moved);
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/music/channel' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { channelId } = JSON.parse(body);
                const musicManager = require('./utils/musicManager');
                const guild = client.guilds.cache.get(config.guildId);
                if (guild) {
                    const queue = musicManager.getQueue(guild.id);
                    const targetChannel = await client.channels.fetch(channelId).catch(() => null);
                    if (targetChannel && targetChannel.isVoiceBased()) {
                        await queue.connect(targetChannel, queue.textChannel || targetChannel);
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    if (pathname === '/api/music/lyrics') {
        const musicManager = require('./utils/musicManager');
        const guild = client.guilds.cache.get(config.guildId);
        const queue = guild ? musicManager.getQueue(guild.id) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(queue && queue.currentLyrics ? queue.currentLyrics : { syncedLyrics: [], plainLyrics: null }));
    }

    // 7.9. Music Live State API (single source of truth for the live dashboard; polled, never reloaded)
    if (pathname === '/api/music/state') {
        const musicManager = require('./utils/musicManager');
        const guild = client.guilds.cache.get(config.guildId);
        const queue = guild ? musicManager.getQueue(guild.id) : null;

        const slim = (t) => t ? {
            title: t.title, author: t.author, url: t.url, thumbnail: t.thumbnail || null,
            duration: t.duration, seconds: t.seconds || 0,
            requester: t.requester ? t.requester.tag : null
        } : null;

        const isPlaying = !!(queue && queue.isPlaying && queue.currentTrack);
        const isPaused = !!(queue && queue.player && (queue.player.paused || (queue.player.state && queue.player.state.status === 'paused')));
        const lyr = queue ? queue.currentLyrics : null;

        const voiceChannels = guild ? guild.channels.cache
            .filter(c => c.isVoiceBased())
            .map(c => ({ id: c.id, name: c.name, count: c.members.filter(m => !m.user.bot).size })) : [];

        const botVc = guild && queue && queue.voiceChannelId ? guild.channels.cache.get(queue.voiceChannelId) : null;
        const listeners = botVc ? botVc.members.filter(m => !m.user.bot).map(m => ({
            id: m.id,
            name: m.displayName || m.user.username,
            avatar: m.user.displayAvatarURL({ size: 64 })
        })) : [];

        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify({
            serverTime: Date.now(),
            connected: !!(queue && queue.player),
            isPlaying,
            isPaused,
            current: isPlaying ? slim(queue.currentTrack) : null,
            elapsed: queue ? queue.getPlaybackSeconds() : 0,
            volume: queue ? queue.volume : 100,
            speed: queue ? (queue.speed || 1.0) : 1.0,
            filter: queue ? (queue.activeFilter || 'none') : 'none',
            loop: queue ? queue.loopMode : 'off',
            queue: queue ? queue.queue.map(t => Object.assign(slim(t), { requester: t.requester ? t.requester.tag : null })) : [],
            history: queue ? queue.history.slice(0, 15).map(h => Object.assign(slim(h), { playedAt: h.playedAt })) : [],
            voiceChannelId: queue ? queue.voiceChannelId : null,
            voiceChannelName: queue ? queue.voiceChannelName : null,
            voiceChannels,
            listeners,
            hasLyrics: !!(lyr && ((lyr.syncedLyrics && lyr.syncedLyrics.length) || lyr.plainLyrics))
        }));
    }

    // 8. Main /health and /status Endpoint (Supports automatic detection)
    if (pathname === '/health' || pathname === '/' || pathname === '/status') {
        const metrics = client.healthControl.getMetrics();
        const isHealthy = metrics.status === 'UP' || metrics.status === 'DEGRADED';
        const httpStatusCode = isHealthy ? 200 : 503;

        const payload = {
            status: metrics.status,
            reason: metrics.reason,
            status_reason: metrics.reason,
            why: metrics.reason,
            notice: metrics.reason,
            is_healthy: isHealthy,
            mode_type: metrics.overrideStatus ? 'MANUAL_OVERRIDE' : 'AUTOMATIC',
            bot: client.user ? client.user.tag : 'Grandway Shopping Utils',
            ping: metrics.ping >= 0 ? `${metrics.ping}ms` : 'calculating',
            uptime_seconds: metrics.uptimeSeconds,
            uptime_formatted: `${Math.floor(metrics.uptimeSeconds / 3600)}h ${Math.floor((metrics.uptimeSeconds % 3600) / 60)}m ${metrics.uptimeSeconds % 60}s`,
            guilds: client.guilds.cache.size,
            commands_loaded: client.commands.size,
            system: {
                node_version: process.version,
                memory_used_mb: metrics.memUsedMb,
                memory_total_mb: metrics.memTotalMb,
                rss_mb: metrics.rssMb
            },
            timestamp: new Date().toISOString()
        };

        if (metrics.overrideSetAt) {
            payload.mode_changed_at = metrics.overrideSetAt;
        }

        res.writeHead(httpStatusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(payload, null, 2));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        error: 'Endpoint not found.',
        available_endpoints: {
            health: '/health (View current status and why/reason)',
            note: 'Status-changing routes require an Authorization: Bearer <HEALTH_API_TOKEN> header.',
            set_status: '/set-status?status=MAINTENANCE|DOWN|DEGRADED|PARTIAL_OUTAGE|UP&reason=Why+status+is+set',
            maintenance: '/maintenance?reason=Scheduled+system+maintenance',
            down: '/down?reason=Emergency+host+failure',
            degraded: '/degraded?reason=Elevated+latency',
            partial_outage: '/partial-outage?service=Tickets&reason=Transcripts+failing',
            reset: '/reset (Restores automatic UP)'
        }
    }, null, 2));
});

server.listen(PORT, () => {
    console.log(`🌐 Health pinger HTTP server listening on port ${PORT} (/health)`);
});

client.login(process.env.DISCORD_TOKEN);

