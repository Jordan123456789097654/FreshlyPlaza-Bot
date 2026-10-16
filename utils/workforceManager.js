const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../database');
const config = require('../config');

/**
 * Workforce Management & Automated Operations Utility
 * Implements:
 * 1. Timezone heatmaps & peak shift hours
 * 2. Automated recurring shift/training host callouts (every 3 days)
 * 3. Promotion readiness index & tenure milestone tracking
 */

async function triggerHostingReminder(client, isManual = false) {
    const db = getDb();
    const settings = await db.getTicketSettings();
    const now = Date.now();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    // Check last reminder timestamp (skip if < 3 days unless manually triggered)
    if (!isManual && settings.last_trainer_shift_reminder_at) {
        const lastSent = new Date(settings.last_trainer_shift_reminder_at).getTime();
        if (now - lastSent < THREE_DAYS_MS) {
            return { sent: false, reason: 'Cooldown active (triggers every 3 days)' };
        }
    }

    const profiles = await db.getAllStaffProfiles();
    const eligibleHosts = profiles.filter(p => {
        const canHost = p.willing_to_host_trainings && /yes|true|y/i.test(p.willing_to_host_trainings);
        const onLoa = p.loa_status && /loa/i.test(p.loa_status) && !/not on/i.test(p.loa_status);
        return canHost && !onLoa;
    });

    if (eligibleHosts.length === 0) {
        return { sent: false, reason: 'No eligible hosts currently registered in staff roster.' };
    }

    const targetChannelId = config.channels.corporateAnnouncements || '1541943644536180836';
    let targetChannel = client.channels.cache.get(targetChannelId);
    if (!targetChannel) {
        try {
            targetChannel = await client.channels.fetch(targetChannelId);
        } catch (e) {}
    }

    if (!targetChannel) {
        return { sent: false, reason: 'Target announcements channel not reachable' };
    }

    const pings = eligibleHosts.map(h => `<@${h.user_id}>`).join(' ');

    const reminderEmbed = new EmbedBuilder()
        .setTitle('🏪 FreshlyPlaza Staff Operations — Shift & Training Hosting Callout')
        .setDescription(
            `📢 **Attention Certified Shift Hosts & Trainers:**\n\n` +
            `This is your scheduled roster reminder for all staff members who expressed availability to host **Store Shifts** and **Trainee Training Sessions**!\n\n` +
            `🛒 **Keep Our Supermarket Fresh:**\n` +
            `Hosting regular shifts boosts customer engagement, fulfills your promotion quotas, and keeps store shelves stocked.\n\n` +
            `🎓 **Host a Session Today:**\n` +
            `• **Store Shifts:** Schedule in <#${config.channels.shifts}> or start a vote via \`/shift-vote\`\n` +
            `• **Training Sessions:** Open a session in <#${config.channels.trainingSessions}> for waiting Trainees\n\n` +
            `*Thank you for keeping FreshlyPlaza active and operating at peak quality!*`
        )
        .addFields(
            { name: '👥 Scheduled Callout List', value: pings.length > 1024 ? `${eligibleHosts.length} Active Hosts Pinged` : pings, inline: false },
            { name: '📅 Reminder Cadence', value: '`Recurring every 3 days` • *FreshlyPlaza Operations*', inline: true }
        )
        .setColor(config.colors.primary)
        .setThumbnail('https://cdn.discordapp.com/icons/1504761883566280735/f0e44faaa0b623912fc3cb3935511dd0.webp')
        .setFooter({ text: 'FreshlyPlaza Operations • Automated Workforce Dispatcher' })
        .setTimestamp();

    await targetChannel.send({
        content: `🔔 **ATTENTION HOSTS & TRAINERS:** ${pings}`,
        embeds: [reminderEmbed]
    });

    await db.updateTicketSettings({ last_trainer_shift_reminder_at: new Date().toISOString() });
    return { sent: true, count: eligibleHosts.length };
}

function calculateStaffReadiness(profile, activity = {}, strikes = []) {
    let score = 0;
    const breakdown = [];

    // 1. Tenure Evaluation (up to 25 pts)
    let tenureDays = 0;
    if (profile.joined_staff_at) {
        const parsed = new Date(profile.joined_staff_at).getTime();
        if (!isNaN(parsed)) {
            tenureDays = Math.max(0, Math.floor((Date.now() - parsed) / (24 * 60 * 60 * 1000)));
        } else {
            tenureDays = 14; // Approximate default
        }
    } else if (profile.hired_at) {
        tenureDays = Math.max(0, Math.floor((Date.now() - new Date(profile.hired_at).getTime()) / (24 * 60 * 60 * 1000)));
    }

    if (tenureDays >= 30) {
        score += 25;
        breakdown.push('✅ Tenure: 30+ days (+25 pts)');
    } else if (tenureDays >= 14) {
        score += 15;
        breakdown.push(`⏳ Tenure: ${tenureDays} days (+15 pts)`);
    } else {
        score += 5;
        breakdown.push(`🌱 Tenure: ${tenureDays} days (+5 pts)`);
    }

    // 2. Shift Activity (up to 35 pts)
    const shiftsAttended = activity.shifts_attended || 0;
    const shiftsHosted = activity.shifts_hosted || 0;
    const totalShifts = shiftsAttended + shiftsHosted;

    if (totalShifts >= 15) {
        score += 35;
        breakdown.push(`✅ Shift Volume: ${totalShifts} shifts completed (+35 pts)`);
    } else if (totalShifts >= 8) {
        score += 20;
        breakdown.push(`⏳ Shift Volume: ${totalShifts} shifts completed (+20 pts)`);
    } else {
        score += Math.min(10, totalShifts * 2);
        breakdown.push(`⚠️ Shift Volume: ${totalShifts} shifts completed (+${Math.min(10, totalShifts * 2)} pts)`);
    }

    // 3. Training / Leadership Contributions (up to 20 pts)
    const trainingsHosted = activity.trainings_hosted || 0;
    const canHost = profile.willing_to_host_trainings && /yes|true|y/i.test(profile.willing_to_host_trainings);

    if (trainingsHosted >= 5) {
        score += 20;
        breakdown.push(`✅ Training Sessions Hosted: ${trainingsHosted} (+20 pts)`);
    } else if (trainingsHosted >= 2 || canHost) {
        score += 12;
        breakdown.push(`⏳ Training Readiness: ${trainingsHosted} hosted / Host-Ready (+12 pts)`);
    } else {
        breakdown.push(`⚠️ Training Activity: 0 sessions hosted (+0 pts)`);
    }

    // 4. Disciplinary Record (up to 20 pts)
    const activeStrikes = strikes.filter(s => !s.revoked).length;
    if (activeStrikes === 0) {
        score += 20;
        breakdown.push('🛡️ Clean Record: 0 active strikes (+20 pts)');
    } else {
        const penalty = activeStrikes * 10;
        breakdown.push(`❌ Disciplinary Record: ${activeStrikes} active strike(s) (-${penalty} pts)`);
        score = Math.max(0, score - penalty);
    }

    let status = '🔴 Not Ready';
    let recommendation = 'Requires additional shift attendance and active tenure before promotion review.';

    if (score >= 80) {
        status = '🟢 Highly Recommended for Promotion Review';
        recommendation = 'Exceeds operational benchmarks across tenure, activity, and conduct.';
    } else if (score >= 50) {
        status = '🟡 On Track / Moderate Readiness';
        recommendation = 'Close to promotion thresholds. Complete a few more shifts or trainings.';
    }

    return {
        score: Math.min(100, score),
        status,
        recommendation,
        breakdown,
        tenureDays
    };
}

/**
 * Audits all staff members to identify who has not completed the Staff Data Entry.
 * Sends them official DM instructions with:
 * - 1 week (7 days) deadline for regular staff
 * - 3 months (90 days) deadline for LOA staff
 * Records deadlines into freshlyplaza_db.json.
 */
async function dispatchStaffDataAuditAndDms(guild, actionedByUserId) {
    const db = getDb();
    const profiles = (await db.getAllStaffProfiles()).reduce((acc, p) => {
        acc[p.user_id] = p;
        return acc;
    }, {});

    const staffRoleId = config.roles.staff;
    const loaRoleId = config.roles.loa;
    const ignoredUserIds = new Set(config.ignoredUserIds || []);

    try {
        await guild.members.fetch();
    } catch (e) {
        console.warn('[STAFF AUDIT] Member fetch fallback:', e.message);
    }

    const staffMembers = guild.members.cache.filter(m => m.roles.cache.has(staffRoleId) && !m.user.bot);
    const existingNotices = await db.getDataNoticeRecords();

    const missingStaff = [];
    const dmSuccess = [];
    const dmFailed = [];

    const templateText = 
`\`\`\`text
=== FRESHLYPLAZA STAFF DATA ENTRY ===
Preferred Name / Nickname: 
Roblox Username: 
Roblox Profile ID: 
Discord ID (Snowflake): 
Current Staff Rank: 
Date Joined Staff Team (Approx): 
Timezone (e.g. EST, GMT, CST): 
Typical Weekly Availability (Days & Times): 
Primary Department (Till / Stock / Security / Management): 
Willing to Host / Assist Trainings? (Yes / No): 
Current LOA Status (Active / On LOA): 
Additional Notes: 
\`\`\``;

    // 1. Automatically mark all staff members who ALREADY have a completed data entry as COMPLETED
    for (const [userId, profile] of Object.entries(profiles)) {
        if (!existingNotices[userId]) {
            existingNotices[userId] = {
                user_id: userId,
                user_tag: profile.preferred_name || profile.roblox_username || userId,
                is_loa: profile.loa_status && /loa/i.test(profile.loa_status) && !/not on/i.test(profile.loa_status),
                duration_days: 7,
                notified_at: profile.last_roster_update || new Date().toISOString(),
                deadline: null,
                status: 'COMPLETED',
                dm_delivered: true,
                completed_at: profile.last_roster_update || new Date().toISOString()
            };
        } else if (existingNotices[userId].status !== 'COMPLETED') {
            existingNotices[userId].status = 'COMPLETED';
            existingNotices[userId].completed_at = profile.last_roster_update || new Date().toISOString();
        }
    }

    for (const member of staffMembers.values()) {
        if (ignoredUserIds.has(member.id)) continue;

        const hasProfile = Boolean(profiles[member.id]);
        if (hasProfile) {
            // Already completed
            await db.completeDataNotice(member.id);
            continue;
        }

        const isLoa = member.roles.cache.has(loaRoleId);
        missingStaff.push({ member, isLoa });

        // Record deadline in database
        const record = await db.addDataNoticeRecord(member.id, member.user.tag, isLoa);
        const deadlineUnix = Math.floor(new Date(record.deadline).getTime() / 1000);
        const timeframeStr = isLoa ? '3 months (90 days)' : '1 week (7 days)';

        const dmEmbed = new EmbedBuilder()
            .setTitle('⚠️ FreshlyPlaza — Mandatory Staff Data Entry Notice')
            .setDescription(
                `Hello <@${member.id}>,\n\n` +
                `Our leadership team has initiated a mandatory staff roster synchronization for all active and LOA colleagues at **FreshlyPlaza**.\n\n` +
                `You currently do not have a completed roster profile on file in our database.`
            )
            .addFields(
                {
                    name: '⏳ Submission Deadline',
                    value: `• **Timeframe Allowed:** **${timeframeStr}**\n• **Due Date:** <t:${deadlineUnix}:F> (<t:${deadlineUnix}:R>)\n• **Notice Status:** \`PENDING SUBMISSION\``,
                    inline: false
                },
                {
                    name: '🚨 Termination Warning (Policy Enforcement)',
                    value: `Failure to submit your data entry before the deadline will result in **immediate termination of your staff position and removal of all staff roles** from FreshlyPlaza.`,
                    inline: false
                },
                {
                    name: '📋 Submission Instructions',
                    value: 
                        `1. Go to <#${config.channels.supportCenter || '1560290502815785041'}>.\n` +
                        `2. **Open a ticket under the \`📁 DATA-ENTRIES\` category**.\n` +
                        `3. Copy the official template below, fill in your details, and send it directly inside your **ticket**.\n` +
                        `*Management will review and process your data entry!*`,
                    inline: false
                },
                {
                    name: '📝 Official Data Entry Template',
                    value: templateText,
                    inline: false
                }
            )
            .setColor(isLoa ? config.colors.warning : config.colors.danger)
            .setFooter({ text: 'FreshlyPlaza High Rank Management Team', iconURL: guild.iconURL() })
            .setTimestamp();

        try {
            await member.send({ embeds: [dmEmbed] });
            record.dm_delivered = true;
            dmSuccess.push(member);
        } catch (dmErr) {
            record.dm_delivered = false;
            dmFailed.push(member);
        }
    }

    db.save();

    return {
        totalStaff: staffMembers.size,
        completedCount: staffMembers.size - missingStaff.length,
        missingCount: missingStaff.length,
        dmSuccessCount: dmSuccess.length,
        dmFailedCount: dmFailed.length,
        missingStaff
    };
}

/**
 * Checks for overdue staff data entry notices and automatically executes
 * role removals & termination logs for staff who exceeded their deadline.
 */
async function checkOverdueStaffDataNotices(client) {
    const db = getDb();
    const overdue = await db.getOverdueDataNotices();
    if (!overdue || overdue.length === 0) return;

    for (const record of overdue) {
        try {
            const guild = client.guilds.cache.get(config.guildId) || client.guilds.cache.first();
            if (!guild) continue;

            let member;
            try {
                member = await guild.members.fetch(record.user_id);
            } catch (e) {
                // Member might have left the server
                record.status = 'FIRED';
                record.terminated_at = new Date().toISOString();
                db.save();
                continue;
            }

            if (!member) continue;

            // Preserve roles before termination
            const preservedRoleIds = member.roles.cache
                .filter(r => r.id !== guild.id && !r.managed)
                .map(r => r.id);

            const reason = `Automated Termination: Failed to submit mandatory staff data entry within ${record.duration_days} days (${record.is_loa ? 'LOA 3-Month Policy' : '1-Week Standard Policy'}).`;

            // Record in activity terms
            const term = await db.addActivityTerm(record.user_id, member.user.tag, client.user.id, reason, preservedRoleIds);

            // Remove staff roles
            const staffRole = guild.roles.cache.get(config.roles.staff);
            const staffPos = staffRole ? staffRole.position : 0;
            const botHighestPos = guild.members.me ? guild.members.me.roles.highest.position : 999;

            const rolesToRemove = member.roles.cache.filter(r => 
                r.id !== guild.id &&
                !r.managed &&
                r.position >= staffPos &&
                r.position < botHighestPos
            );

            if (rolesToRemove.size > 0) {
                await member.roles.remove(rolesToRemove).catch(() => {});
            }

            // Mark record as FIRED
            record.status = 'FIRED';
            record.terminated_at = new Date().toISOString();
            db.save();

            // Send DM to terminated user
            const termDm = new EmbedBuilder()
                .setTitle('🚨 FreshlyPlaza — Notice of Staff Termination')
                .setDescription(
                    `Hello <@${member.id}>,\n\n` +
                    `Your staff position at **FreshlyPlaza** has been **terminated** due to failure to submit the mandatory Staff Data Entry within your allocated deadline of **${record.duration_days} days**.\n\n` +
                    `Your staff roles have been automatically removed from the server.`
                )
                .addFields(
                    { name: '📋 Reason', value: reason, inline: false },
                    { name: '🆔 Term Record', value: `#${term.id}`, inline: true },
                    { name: '⚖️ Appeal Window', value: `You may submit an appeal to HR within 30 days if you experienced unavoidable circumstances.`, inline: false }
                )
                .setColor(config.colors.danger)
                .setFooter({ text: 'FreshlyPlaza Automated Workforce Enforcement' })
                .setTimestamp();

            await member.send({ embeds: [termDm] }).catch(() => {});

            // Log to demote / mod logs
            const demoteLogChannelId = config.channels.demoteLogs || config.channels.modLogs;
            const logChannel = guild.channels.cache.get(demoteLogChannelId);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('📉 Automated Staff Termination — Data Entry Overdue')
                    .setDescription(`Staff member <@${member.id}> has been terminated for failing to submit their required staff data entry within the deadline.`)
                    .addFields(
                        { name: '👤 Staff Member', value: `<@${member.id}> (\`${member.user.tag}\`)`, inline: true },
                        { name: '⏳ Notice Policy', value: `${record.duration_days} Days (${record.is_loa ? 'LOA Staff' : 'Active Staff'})`, inline: true },
                        { name: '🛡️ Preserved Roles', value: `${preservedRoleIds.length} roles logged in DB for appeal`, inline: true }
                    )
                    .setColor(config.colors.danger)
                    .setFooter({ text: 'FreshlyPlaza SLA Auto-Term' })
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }

            console.log(`[DATA OVERDUE TERMINATION] Successfully fired ${member.user.tag} (${member.id}) for overdue data entry.`);
        } catch (err) {
            console.error('[DATA OVERDUE AUTO-TERM ERROR]', err);
        }
    }
}

module.exports = {
    triggerHostingReminder,
    calculateStaffReadiness,
    dispatchStaffDataAuditAndDms,
    checkOverdueStaffDataNotices
};
