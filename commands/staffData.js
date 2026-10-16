const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { getDb } = require('../database');
const config = require('../config');
const { calculateStaffReadiness, triggerHostingReminder, dispatchStaffDataAuditAndDms } = require('../utils/workforceManager');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('staff-data')
            .setDescription('Manage, view, and analyze indexed staff roster data entries')
            .addSubcommand(sub =>
                sub.setName('view')
                   .setDescription('View the complete indexed roster profile of a staff member')
                   .addUserOption(opt => opt.setName('user').setDescription('Staff Member to view').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('readiness')
                   .setDescription('Calculate the promotion readiness index and tenure milestones for a staff member')
                   .addUserOption(opt => opt.setName('user').setDescription('Staff Member to evaluate').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('departments')
                   .setDescription('View workforce distribution and station coverage across all store departments')
            )
            .addSubcommand(sub =>
                sub.setName('heatmap')
                   .setDescription('Analyze staff timezone distribution to identify peak shift hours and coverage gaps')
            )
            .addSubcommand(sub =>
                sub.setName('ping-hosts')
                   .setDescription('Dispatch a hosting reminder to certified shift and training hosts in Corporate Announcements')
            )
            .addSubcommand(sub =>
                sub.setName('list')
                   .setDescription('List all registered staff profiles in the database')
                   .addStringOption(opt =>
                       opt.setName('department')
                          .setDescription('Filter by department')
                          .setRequired(false)
                          .addChoices(
                              { name: 'Management', value: 'Management' },
                              { name: 'Till / Checkout', value: 'Till' },
                              { name: 'Stock / Replenishment', value: 'Stock' },
                              { name: 'Security', value: 'Security' }
                          )
                   )
            )
            .addSubcommand(sub =>
                sub.setName('summary')
                   .setDescription('View high-level staffing analytics, timezone breakdown, and roster metrics')
            )
            .addSubcommand(sub =>
                sub.setName('audit')
                   .setDescription('Check for staff who have not submitted their data entry, DM them instructions & start deadlines')
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isStaffOrLeadership = member && (
                member.roles.cache.has(config.roles.staff) ||
                member.roles.cache.has(config.roles.mr) ||
                member.roles.cache.has(config.roles.hr) ||
                member.permissions.has(PermissionFlagsBits.ManageGuild)
            );

            if (!isStaffOrLeadership) {
                return interaction.reply({
                    content: '🚫 **Access Denied:** Only FreshlyPlaza Staff Leadership can inspect staff roster data.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const db = getDb();

            // ==========================================
            // 1. VIEW SINGLE STAFF MEMBER
            // ==========================================
            if (subcommand === 'view') {
                const targetUser = interaction.options.getUser('user');
                const profile = await db.getStaffProfile(targetUser.id);
                const verification = (db.getData().verifications || {})[targetUser.id];
                const activity = (db.getData().staff_activity || {})[targetUser.id] || {};

                if (!profile && !verification) {
                    return interaction.reply({
                        content: `❌ No roster data entry found for <@${targetUser.id}> (\`${targetUser.id}\`). They have not submitted their DATA-ENTRIES template yet.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const robloxUser = profile?.roblox_username || verification?.roblox_username || 'Not Linked';
                const robloxId = profile?.roblox_id || verification?.roblox_id || 'N/A';
                const robloxLink = robloxId !== 'N/A' ? `[**${robloxUser}**](https://www.roblox.com/users/${robloxId}/profile)` : `\`${robloxUser}\``;

                const viewEmbed = new EmbedBuilder()
                    .setTitle(`📋 Staff Roster Profile — ${profile?.preferred_name || targetUser.username}`)
                    .setDescription(`Official database roster records for <@${targetUser.id}>.`)
                    .addFields(
                        { name: '👤 Discord Member', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                        { name: '🏷️ Preferred Name', value: profile?.preferred_name ? `\`${profile.preferred_name}\`` : '*Not specified*', inline: true },
                        { name: '🎮 Roblox Profile', value: `${robloxLink} (ID: \`${robloxId}\`)`, inline: true },
                        { name: '🛡️ Current Rank', value: profile?.rank || profile?.current_role_name || '*Not set*', inline: true },
                        { name: '🏢 Department', value: profile?.department ? `\`${profile.department}\`` : '*General Store*', inline: true },
                        { name: '🌐 Timezone', value: profile?.timezone ? `\`${profile.timezone}\`` : '*Not specified*', inline: true },
                        { name: '📅 Date Joined Staff', value: profile?.joined_staff_at || '*Not recorded*', inline: true },
                        { name: '🎓 Training Host', value: profile?.willing_to_host_trainings || '*No preference*', inline: true },
                        { name: '🌴 LOA Status', value: profile?.loa_status ? `\`${profile.loa_status}\`` : '`Active`', inline: true },
                        { name: '⏰ Weekly Availability', value: profile?.weekly_availability ? `> ${profile.weekly_availability}` : '*No schedule listed*', inline: false },
                        { 
                            name: '📊 Shift & Activity Metrics', 
                            value: `• **Shifts Hosted:** \`${activity.shifts_hosted || 0}\`\n• **Shifts Attended:** \`${activity.shifts_attended || 0}\`\n• **Trainings Hosted:** \`${activity.trainings_hosted || 0}\``, 
                            inline: false 
                        }
                    )
                    .setColor(config.colors.primary)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: `Last Updated: ${profile?.last_roster_update ? new Date(profile.last_roster_update).toLocaleDateString() : 'Initial Import'}` })
                    .setTimestamp();

                if (profile?.notes) {
                    viewEmbed.addFields({ name: '📝 Additional Notes', value: profile.notes, inline: false });
                }

                return interaction.reply({ embeds: [viewEmbed] });
            }

            // ==========================================
            // 2. READINESS SCORE & TENURE MILESTONE (#5)
            // ==========================================
            if (subcommand === 'readiness') {
                const targetUser = interaction.options.getUser('user');
                const profile = await db.getStaffProfile(targetUser.id);
                const activity = (db.getData().staff_activity || {})[targetUser.id] || {};
                const strikes = (db.getData().staff_strikes || []).filter(s => s.user_id === targetUser.id);

                if (!profile) {
                    return interaction.reply({
                        content: `❌ No roster data entry found for <@${targetUser.id}>. Ask them to submit their entry in DATA-ENTRIES first!`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const readiness = calculateStaffReadiness(profile, activity, strikes);

                const progressBar = (score) => {
                    const filled = Math.round(score / 10);
                    return '🟩'.repeat(filled) + '⬜'.repeat(10 - filled);
                };

                const readinessEmbed = new EmbedBuilder()
                    .setTitle(`📈 Staff Promotion Readiness Index — ${profile.preferred_name || targetUser.username}`)
                    .setDescription(
                        `### 🎯 Readiness Score: \`${readiness.score}/100\`\n` +
                        `**Status:** ${readiness.status}\n\n` +
                        `\`[${progressBar(readiness.score)}]\` **${readiness.score}%**\n\n` +
                        `> 💡 **HR Recommendation:** *${readiness.recommendation}*`
                    )
                    .addFields(
                        { name: '👤 Candidate', value: `<@${targetUser.id}> (${profile.rank || 'Staff'})`, inline: true },
                        { name: '📅 Recorded Tenure', value: `\`${readiness.tenureDays} Days served\``, inline: true },
                        { name: '🛡️ Active Strikes', value: `\`${strikes.filter(s => !s.revoked).length} strikes\``, inline: true },
                        { name: '📋 Metric Breakdown', value: readiness.breakdown.join('\n'), inline: false }
                    )
                    .setColor(readiness.score >= 80 ? config.colors.primary : readiness.score >= 50 ? config.colors.warning : config.colors.danger)
                    .setFooter({ text: 'FreshlyPlaza Leadership Succession & Promotion Engine' })
                    .setTimestamp();

                return interaction.reply({ embeds: [readinessEmbed] });
            }

            // ==========================================
            // 3. DEPARTMENT BALANCE & STATIONS (#4)
            // ==========================================
            if (subcommand === 'departments') {
                const profiles = await db.getAllStaffProfiles();
                const total = profiles.length;

                const deptMap = {
                    'Management': [],
                    'Till': [],
                    'Stock': [],
                    'Security': [],
                    'Other / Unassigned': []
                };

                profiles.forEach(p => {
                    const dept = (p.department || '').toLowerCase();
                    if (dept.includes('manage')) deptMap['Management'].push(p);
                    else if (dept.includes('till') || dept.includes('check')) deptMap['Till'].push(p);
                    else if (dept.includes('stock')) deptMap['Stock'].push(p);
                    else if (dept.includes('sec')) deptMap['Security'].push(p);
                    else deptMap['Other / Unassigned'].push(p);
                });

                const deptFields = Object.entries(deptMap).map(([name, list]) => {
                    const pct = total > 0 ? Math.round((list.length / total) * 100) : 0;
                    const topMembers = list.slice(0, 5).map(m => `<@${m.user_id}>`).join(', ') || '*No staff assigned*';
                    return {
                        name: `${name} (${list.length} Staff • ${pct}%)`,
                        value: `${topMembers}${list.length > 5 ? ` *+${list.length - 5} more*` : ''}`,
                        inline: false
                    };
                });

                const deptEmbed = new EmbedBuilder()
                    .setTitle('🏢 FreshlyPlaza Workforce — Departmental & Station Balance')
                    .setDescription(`Current distribution of staff across supermarket stations based on roster preferences.`)
                    .addFields(deptFields)
                    .setColor(config.colors.secondary)
                    .setFooter({ text: `Total Workforce Indexed: ${total} Colleagues` })
                    .setTimestamp();

                return interaction.reply({ embeds: [deptEmbed] });
            }

            // ==========================================
            // 4. TIMEZONE HEATMAP & SHIFT WINDOWS (#1)
            // ==========================================
            if (subcommand === 'heatmap') {
                const profiles = await db.getAllStaffProfiles();
                const total = profiles.length;

                const tzClusters = {
                    'European / UK (GMT, BST, CET)': 0,
                    'US East (EST, EDT)': 0,
                    'US Central & Mountain (CST, MST)': 0,
                    'US Pacific (PST, PDT)': 0,
                    'Asia / Oceania (AEST, JST, IST)': 0,
                    'Other / Unspecified': 0
                };

                profiles.forEach(p => {
                    const tz = (p.timezone || '').toUpperCase();
                    if (/GMT|BST|CET|UTC\+1|UTC\+2|UTC\+0/i.test(tz)) tzClusters['European / UK (GMT, BST, CET)']++;
                    else if (/EST|EDT|UTC\-5|UTC\-4/i.test(tz)) tzClusters['US East (EST, EDT)']++;
                    else if (/CST|CDT|MST|MDT|UTC\-6|UTC\-7/i.test(tz)) tzClusters['US Central & Mountain (CST, MST)']++;
                    else if (/PST|PDT|UTC\-8/i.test(tz)) tzClusters['US Pacific (PST, PDT)']++;
                    else if (/AEST|AEDT|JST|IST|UTC\+8|UTC\+9|UTC\+10/i.test(tz)) tzClusters['Asia / Oceania (AEST, JST, IST)']++;
                    else tzClusters['Other / Unspecified']++;
                });

                const tzLines = Object.entries(tzClusters).map(([region, count]) => {
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return `• **${region}:** \`${count}\` staff (**${pct}%**)`;
                }).join('\n');

                const heatmapEmbed = new EmbedBuilder()
                    .setTitle('🌍 Workforce Timezone Heatmap & Peak Shift Windows')
                    .setDescription(
                        `Analyzed all registered staff timezones to identify ideal store shift times and coverage dead-zones.\n\n` +
                        `### 📊 Regional Timezone Clusters:\n${tzLines}\n\n` +
                        `### ⚡ Recommended Shift Hosting Windows:\n` +
                        `> 🟢 **Global Peak Window:** \`18:00 – 22:00 UTC\` *(Overlaps UK evenings & US afternoons)*\n` +
                        `> 🟡 **Secondary Window:** \`14:00 – 17:00 UTC\` *(High Europe / UK turnout)*\n` +
                        `> 🔴 **Coverage Dead-Zone:** \`04:00 – 10:00 UTC\` *(Low staff availability)*`
                    )
                    .setColor(config.colors.primary)
                    .setFooter({ text: 'FreshlyPlaza Smart Shift Scheduler' })
                    .setTimestamp();

                return interaction.reply({ embeds: [heatmapEmbed] });
            }

            // ==========================================
            // 5. MANUAL HOST CALLOUT TRIGGER
            // ==========================================
            if (subcommand === 'ping-hosts') {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const result = await triggerHostingReminder(interaction.client, true);

                if (!result.sent) {
                    return interaction.editReply({ content: `⚠️ Could not dispatch reminder: ${result.reason}` });
                }

                return interaction.editReply({
                    content: `✅ Successfully dispatched shift & training host callout to <#${config.channels.corporateAnnouncements}>! Pinged **${result.count}** eligible staff hosts.`
                });
            }

            // ==========================================
            // 6. LIST ALL REGISTERED STAFF
            // ==========================================
            if (subcommand === 'list') {
                const deptFilter = interaction.options.getString('department');
                const allProfiles = await db.getAllStaffProfiles();

                let filtered = allProfiles;
                if (deptFilter) {
                    filtered = allProfiles.filter(p => (p.department || '').toLowerCase().includes(deptFilter.toLowerCase()));
                }

                if (filtered.length === 0) {
                    return interaction.reply({
                        content: `⚠️ No staff profiles found${deptFilter ? ` for department **${deptFilter}**` : ''}.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const listText = filtered.slice(0, 20).map((p, idx) => {
                    const name = p.preferred_name || 'Staff';
                    const roblox = p.roblox_username ? `@${p.roblox_username}` : 'No Roblox';
                    const rank = p.rank || 'Staff';
                    const tz = p.timezone || 'N/A';
                    return `**${idx + 1}.** <@${p.user_id}> (${name}) • **${rank}** • Roblox: \`${roblox}\` • TZ: \`${tz}\``;
                }).join('\n');

                const listEmbed = new EmbedBuilder()
                    .setTitle(`📋 FreshlyPlaza Staff Roster ${deptFilter ? `(${deptFilter})` : `(${filtered.length} Total)`}`)
                    .setDescription(listText + (filtered.length > 20 ? `\n\n*...and ${filtered.length - 20} more profiles.*` : ''))
                    .setColor(config.colors.secondary)
                    .setFooter({ text: `Total Indexed: ${filtered.length} Staff Members` })
                    .setTimestamp();

                return interaction.reply({ embeds: [listEmbed] });
            }

            // ==========================================
            // 7. ROSTER SUMMARY ANALYTICS
            // ==========================================
            if (subcommand === 'summary') {
                const profiles = await db.getAllStaffProfiles();
                const total = profiles.length;

                const deptCounts = {};
                const tzCounts = {};
                let canHostTrainings = 0;
                let onLoaCount = 0;

                profiles.forEach(p => {
                    const dept = p.department || 'Unassigned';
                    deptCounts[dept] = (deptCounts[dept] || 0) + 1;

                    const tz = (p.timezone || 'Unspecified').toUpperCase();
                    tzCounts[tz] = (tzCounts[tz] || 0) + 1;

                    if (p.willing_to_host_trainings && /yes/i.test(p.willing_to_host_trainings)) {
                        canHostTrainings++;
                    }

                    if (p.loa_status && /loa/i.test(p.loa_status) && !/not on/i.test(p.loa_status)) {
                        onLoaCount++;
                    }
                });

                const deptLines = Object.entries(deptCounts).map(([d, c]) => `• **${d}:** \`${c}\` staff`).join('\n') || '*None*';
                const tzLines = Object.entries(tzCounts).slice(0, 8).map(([t, c]) => `• **${t}:** \`${c}\` staff`).join('\n') || '*None*';

                const summaryEmbed = new EmbedBuilder()
                    .setTitle('📊 FreshlyPlaza Staff Roster Analytics & Overview')
                    .setDescription(`Comprehensive workforce data compiled from automated \`DATA-ENTRIES\` submissions.`)
                    .addFields(
                        { name: '👥 Total Staff Profiles Indexed', value: `\`${total}\` registered staff members`, inline: false },
                        { name: '🏢 Department Breakdown', value: deptLines, inline: true },
                        { name: '🌐 Top Timezone Clusters', value: tzLines, inline: true },
                        { 
                            name: '⚡ Operational Readiness', 
                            value: `• 🎓 **Eligible Training Hosts:** \`${canHostTrainings}\`\n• 🌴 **Currently on LOA:** \`${onLoaCount}\`\n• 🟢 **Active Duty Force:** \`${total - onLoaCount}\``, 
                            inline: false 
                        }
                    )
                    .setColor(config.colors.primary)
                    .setFooter({ text: 'FreshlyPlaza Workforce Management Analytics' })
                    .setTimestamp();

                return interaction.reply({ embeds: [summaryEmbed] });
            }

            // ==========================================
            // 8. AUDIT UNREGISTERED STAFF & DISPATCH DMS
            // ==========================================
            if (subcommand === 'audit') {
                const isManagement = member && (
                    member.roles.cache.has(config.roles.hr) ||
                    member.roles.cache.has(config.roles.mr) ||
                    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                    member.permissions.has(PermissionFlagsBits.Administrator)
                );

                if (!isManagement) {
                    return interaction.reply({
                        content: '❌ Only FreshlyPlaza Leadership / HR can run the staff data entry audit.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const result = await dispatchStaffDataAuditAndDms(interaction.guild, interaction.user.id);

                const auditEmbed = new EmbedBuilder()
                    .setTitle('📋 Staff Data Entry Audit & Policy Dispatch')
                    .setDescription(
                        `Audit completed across all staff members in **${interaction.guild.name}**.\n` +
                        `Direct messages with the official template and deadlines have been dispatched.`
                    )
                    .addFields(
                        { name: '👥 Total Staff Audited', value: `\`${result.totalStaff}\` members`, inline: true },
                        { name: '✅ Already Registered', value: `\`${result.completedCount}\` members`, inline: true },
                        { name: '⚠️ Missing Data Entries', value: `\`${result.missingCount}\` members`, inline: true },
                        { name: '📬 Notice DMs Delivered', value: `\`${result.dmSuccessCount}\` delivered`, inline: true },
                        { name: '🔒 DMs Blocked / Closed', value: `\`${result.dmFailedCount}\` failed to DM`, inline: true },
                        { 
                            name: '⏳ Deadline & Termination Policy', 
                            value: `• **Active Staff:** **1 Week (7 Days)** to submit into <#${config.channels.dataEntries || '1560356498264166541'}>\n• **Staff on Approved LOA:** **3 Months (90 Days)**\n• **Enforcement:** Failure to submit before the deadline triggers **automatic termination and role stripping**.`,
                            inline: false 
                        }
                    )
                    .setColor(result.missingCount > 0 ? config.colors.warning : config.colors.primary)
                    .setFooter({ text: 'FreshlyPlaza Workforce Management' })
                    .setTimestamp();

                if (result.missingStaff.length > 0) {
                    const sampleList = result.missingStaff.slice(0, 15).map(s => {
                        return `• <@${s.member.id}> (${s.isLoa ? '🌴 LOA — 3 Months' : 'Active — 1 Week'})`;
                    }).join('\n');
                    auditEmbed.addFields({
                        name: `🚨 Unregistered Staff (${result.missingStaff.length} Total)`,
                        value: sampleList + (result.missingStaff.length > 15 ? `\n*...and ${result.missingStaff.length - 15} more.*` : ''),
                        inline: false
                    });
                }

                return interaction.editReply({ embeds: [auditEmbed] });
            }
        }
    }
];
