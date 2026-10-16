const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');
const RobloxManager = require('../utils/robloxManager');

// Helper to resolve Roblox user from Discord user or direct Roblox username/ID
async function resolveRobloxTarget(interaction, userInput, robloxInput) {
    const db = getDb();
    if (robloxInput) {
        if (/^\d+$/.test(robloxInput.trim())) {
            return { id: robloxInput.trim(), name: `ID:${robloxInput.trim()}` };
        }
        const found = await RobloxManager.getUserIdByUsername(robloxInput.trim());
        if (found) return found;
    }

    if (userInput) {
        const verif = await db.getVerification(userInput.id);
        if (verif && verif.roblox_id) {
            return { id: verif.roblox_id, name: verif.roblox_username || userInput.username };
        }

        // Check guild member displayName (e.g. "Jordan (@JordanDanielsGames)", "Jordan (JordanDanielsGames)", "Jordan - JordanDanielsGames")
        try {
            const member = interaction.guild ? await interaction.guild.members.fetch(userInput.id).catch(() => null) : null;
            const namesToCheck = [];
            if (member && member.displayName) {
                const dn = member.displayName;
                // Regex for patterns like (@username), (username), [username], | username
                const matchParen = dn.match(/[([@]([a-zA-Z0-9_]{3,20})[)\]]/);
                if (matchParen) namesToCheck.push(matchParen[1]);

                const parts = dn.split(/[-–—|•/]/).map(p => p.trim()).filter(Boolean);
                for (const part of parts) {
                    const clean = part.replace(/^@/, '');
                    if (/^[a-zA-Z0-9_]{3,20}$/.test(clean)) namesToCheck.push(clean);
                }

                if (/^[a-zA-Z0-9_]{3,20}$/.test(dn)) {
                    namesToCheck.push(dn);
                }
            }
            if (userInput.username && /^[a-zA-Z0-9_]{3,20}$/.test(userInput.username)) {
                namesToCheck.push(userInput.username);
            }

            for (const candidate of namesToCheck) {
                const found = await RobloxManager.getUserIdByUsername(candidate);
                if (found) return found;
            }
        } catch (e) {
            console.error('[RESOLVE ROBLOX FROM DISPLAY NAME]', e);
        }
    }

    return null;
}

function checkManagerPerms(member) {
    return member.roles.cache.has(config.roles.hr) || 
           member.roles.cache.has(config.roles.mr) || 
           member.permissions.has(PermissionFlagsBits.ManageRoles) ||
           member.permissions.has(PermissionFlagsBits.Administrator);
}

module.exports = [
    // 1. /rank
    {
        data: new SlashCommandBuilder()
            .setName('rank')
            .setDescription('Set a player\'s rank in the FreshlyPlaza Roblox group')
            .addStringOption(opt => 
                opt.setName('role')
                   .setDescription('Name or Rank Number of the group role to assign')
                   .setRequired(true)
            )
            .addUserOption(opt => 
                opt.setName('discord_user')
                   .setDescription('Target Discord user (if verified)')
                   .setRequired(false)
            )
            .addStringOption(opt => 
                opt.setName('roblox_username')
                   .setDescription('Target Roblox username or ID directly')
                   .setRequired(false)
            ),
        async execute(interaction) {
            if (!checkManagerPerms(interaction.member)) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Leadership / HR can rank members.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            const targetUser = interaction.options.getUser('discord_user');
            const targetRoblox = interaction.options.getString('roblox_username');
            const roleInput = interaction.options.getString('role').toLowerCase().trim();

            const target = await resolveRobloxTarget(interaction, targetUser, targetRoblox);
            if (!target) {
                return interaction.editReply({ content: '❌ Could not find a linked Roblox user. Please provide a `roblox_username` or select a verified Discord member.' });
            }

            const roles = await RobloxManager.getGroupRoles();
            const matchedRole = roles.find(r => 
                r.name.toLowerCase() === roleInput || 
                r.name.toLowerCase().includes(roleInput) || 
                String(r.rank) === roleInput ||
                String(r.id) === roleInput
            );

            if (!matchedRole) {
                return interaction.editReply({ content: `❌ Group role \`${roleInput}\` not found in FreshlyPlaza group.` });
            }

            // Rank safety cap: Don't allow bot to rank to Founder or Executive Director (rank >= 253)
            if (matchedRole.rank >= 253) {
                return interaction.editReply({ content: `🛡️ **Rank Cap Protection:** Cannot rank to Executive role **${matchedRole.name}** (Rank ${matchedRole.rank}).` });
            }

            const currentRole = await RobloxManager.getUserRankInGroup(target.id);
            const res = await RobloxManager.setRank(target.id, matchedRole.id);

            if (!res.success) {
                return interaction.editReply({ content: `❌ Failed to rank **${target.name}**: \`${res.error}\`` });
            }

            const embed = new EmbedBuilder()
                .setTitle('👑 Roblox Group Rank Updated')
                .setDescription(`Successfully updated Roblox rank for **${target.name}**!`)
                .addFields(
                    { name: '👤 Target Player', value: `\`${target.name}\` (\`${target.id}\`)`, inline: true },
                    { name: '🛡️ Actioned By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔄 Old Rank', value: currentRole ? `${currentRole.name} (Rank ${currentRole.rank})` : '*Not in Group / Unknown*', inline: false },
                    { name: '✨ New Rank', value: `**${matchedRole.name}** (Rank ${matchedRole.rank})`, inline: false }
                )
                .setColor(config.colors.primary)
                .setTimestamp()
                .setFooter({ text: 'FreshlyPlaza Automated Group Management' });

            const logChId = config.channels.demoteLogs || config.channels.ticketLogs;
            const logCh = interaction.guild.channels.cache.get(logChId);
            if (logCh) logCh.send({ embeds: [embed] }).catch(() => {});

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 2. /promote
    {
        data: new SlashCommandBuilder()
            .setName('promote')
            .setDescription('Promote a player to the next higher rank in the FreshlyPlaza Roblox group')
            .addUserOption(opt => opt.setName('discord_user').setDescription('Target Discord user (if verified)').setRequired(false))
            .addStringOption(opt => opt.setName('roblox_username').setDescription('Target Roblox username or ID').setRequired(false)),
        async execute(interaction) {
            if (!checkManagerPerms(interaction.member)) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Leadership / HR can promote members.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            const target = await resolveRobloxTarget(interaction, interaction.options.getUser('discord_user'), interaction.options.getString('roblox_username'));
            if (!target) {
                return interaction.editReply({ content: '❌ Could not find a linked Roblox user. Please provide `roblox_username` or select a verified Discord member.' });
            }

            const res = await RobloxManager.promoteUser(target.id);
            if (!res.success) {
                return interaction.editReply({ content: `❌ Promotion failed: \`${res.error}\`` });
            }

            const embed = new EmbedBuilder()
                .setTitle('📈 Roblox Group Member Promoted')
                .addFields(
                    { name: '👤 Player', value: `\`${target.name}\` (\`${target.id}\`)`, inline: true },
                    { name: '🛡️ Actioned By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔄 Role Progression', value: `${res.oldRole.name} ➔ **${res.newRole.name}** (Rank ${res.newRole.rank})`, inline: false }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 3. /demote
    {
        data: new SlashCommandBuilder()
            .setName('demote')
            .setDescription('Demote a player to the lower rank in the FreshlyPlaza Roblox group')
            .addUserOption(opt => opt.setName('discord_user').setDescription('Target Discord user (if verified)').setRequired(false))
            .addStringOption(opt => opt.setName('roblox_username').setDescription('Target Roblox username or ID').setRequired(false)),
        async execute(interaction) {
            if (!checkManagerPerms(interaction.member)) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Leadership / HR can demote members.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            const target = await resolveRobloxTarget(interaction, interaction.options.getUser('discord_user'), interaction.options.getString('roblox_username'));
            if (!target) {
                return interaction.editReply({ content: '❌ Could not find a linked Roblox user. Please provide `roblox_username` or select a verified Discord member.' });
            }

            const res = await RobloxManager.demoteUser(target.id);
            if (!res.success) {
                return interaction.editReply({ content: `❌ Demotion failed: \`${res.error}\`` });
            }

            const embed = new EmbedBuilder()
                .setTitle('📉 Roblox Group Member Demoted')
                .addFields(
                    { name: '👤 Player', value: `\`${target.name}\` (\`${target.id}\`)`, inline: true },
                    { name: '🛡️ Actioned By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔄 Role Progression', value: `${res.oldRole.name} ➔ **${res.newRole.name}** (Rank ${res.newRole.rank})`, inline: false }
                )
                .setColor(config.colors.danger)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 4. /exile
    {
        data: new SlashCommandBuilder()
            .setName('exile')
            .setDescription('Exile/kick a member from the FreshlyPlaza Roblox group')
            .addUserOption(opt => opt.setName('discord_user').setDescription('Target Discord user (if verified)').setRequired(false))
            .addStringOption(opt => opt.setName('roblox_username').setDescription('Target Roblox username or ID').setRequired(false))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for exile').setRequired(false)),
        async execute(interaction) {
            if (!checkManagerPerms(interaction.member)) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Leadership / HR can exile members.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            const reason = interaction.options.getString('reason') || 'Termination / Policy Violation';
            const target = await resolveRobloxTarget(interaction, interaction.options.getUser('discord_user'), interaction.options.getString('roblox_username'));
            if (!target) {
                return interaction.editReply({ content: '❌ Could not find a linked Roblox user. Please provide `roblox_username` or select a verified Discord member.' });
            }

            const currentRole = await RobloxManager.getUserRankInGroup(target.id);
            if (!currentRole) {
                return interaction.editReply({ content: `❌ **${target.name}** is not in the FreshlyPlaza Roblox group.` });
            }

            const res = await RobloxManager.exileUser(target.id);
            if (!res.success) {
                return interaction.editReply({ content: `❌ Failed to exile **${target.name}**: \`${res.error}\`` });
            }

            const embed = new EmbedBuilder()
                .setTitle('⛔ Member Exiled from Roblox Group')
                .addFields(
                    { name: '👤 Exiled Player', value: `\`${target.name}\` (\`${target.id}\`)`, inline: true },
                    { name: '🛡️ Actioned By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📋 Former Rank', value: `${currentRole.name} (Rank ${currentRole.rank})`, inline: true },
                    { name: '📝 Reason', value: reason, inline: false }
                )
                .setColor(config.colors.danger)
                .setTimestamp();

            const logChId = config.channels.demoteLogs || config.channels.punishmentLogs;
            const logCh = interaction.guild.channels.cache.get(logChId);
            if (logCh) logCh.send({ embeds: [embed] }).catch(() => {});

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 5. /shout
    {
        data: new SlashCommandBuilder()
            .setName('shout')
            .setDescription('Post an official announcement shout to the FreshlyPlaza Roblox group')
            .addStringOption(opt => 
                opt.setName('message')
                   .setDescription('Shout text to post (leave empty or type "clear" to clear the shout)')
                   .setRequired(false)
            ),
        async execute(interaction) {
            if (!checkManagerPerms(interaction.member)) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Leadership can update the Roblox group shout.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            let msg = interaction.options.getString('message') || '';
            if (msg.toLowerCase() === 'clear') msg = '';

            const res = await RobloxManager.postShout(msg);
            if (!res.success) {
                return interaction.editReply({ content: `❌ Failed to update group shout: \`${res.error}\`` });
            }

            const embed = new EmbedBuilder()
                .setTitle('📢 Roblox Group Shout Updated')
                .setDescription(msg ? `\`\`\`${msg}\`\`\`` : '*Group shout cleared.*')
                .addFields({ name: '🛡️ Updated By', value: `<@${interaction.user.id}>`, inline: true })
                .setColor(config.colors.secondary)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 6. /roblox-audit
    {
        data: new SlashCommandBuilder()
            .setName('roblox-audit')
            .setDescription('View the latest official Roblox group audit logs directly in Discord')
            .addIntegerOption(opt => opt.setName('limit').setDescription('Number of entries to fetch (Max 20, default 10)').setRequired(false)),
        async execute(interaction) {
            if (!checkManagerPerms(interaction.member)) {
                return interaction.reply({ content: '❌ Only FreshlyPlaza Leadership can inspect group audit logs.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            const limit = Math.min(20, Math.max(1, interaction.options.getInteger('limit') || 10));
            const logs = await RobloxManager.getGroupAuditLogs(null, limit);

            if (!logs.length) {
                return interaction.editReply({ content: 'ℹ️ No audit logs returned or unable to read audit logs.' });
            }

            const lines = logs.map(l => {
                const actor = l.actor?.user?.username || 'Unknown';
                const action = l.actionType || 'Action';
                const target = l.description?.TargetName || l.description?.TargetId || '';
                const time = l.created ? `<t:${Math.floor(new Date(l.created).getTime() / 1000)}:R>` : '';
                return `• **${actor}** performed \`${action}\` ${target ? `on **${target}**` : ''} (${time})`;
            });

            const embed = new EmbedBuilder()
                .setTitle(`📋 Roblox Group Audit Log (Latest ${logs.length})`)
                .setDescription(lines.join('\n').slice(0, 4000))
                .setColor(config.colors.secondary)
                .setFooter({ text: 'FreshlyPlaza Security & Audit Feed' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 7. /cookie-status
    {
        data: new SlashCommandBuilder()
            .setName('cookie-status')
            .setDescription('Check the current health and bot identity of the connected Roblox ranking account'),
        async execute(interaction) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const health = await RobloxManager.checkCookieHealth();

            if (!health.valid) {
                return interaction.editReply({
                    content: `🔴 **Roblox Cookie Status: INVALID / EXPIRED**\nError: \`${health.error}\``
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🟢 Roblox Ranking Service: ONLINE & HEALTHY')
                .addFields(
                    { name: '🤖 Bot Username', value: `\`${health.user.name}\``, inline: true },
                    { name: '🆔 Bot User ID', value: `\`${health.user.id}\``, inline: true },
                    { name: '🏢 Managed Group ID', value: `\`${RobloxManager.getGroupId()}\``, inline: true },
                    { name: '⚡ Token Engine', value: 'Auto-refreshing X-CSRF-TOKEN & HTTPS Keepalive', inline: false }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 8. /sync-roles
    {
        data: new SlashCommandBuilder()
            .setName('sync-roles')
            .setDescription('Sync Discord roles with Roblox group rank for a member (or yourself)')
            .addUserOption(opt => opt.setName('user').setDescription('Target Discord user to sync (Defaults to yourself)').setRequired(false)),
        async execute(interaction) {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const target = await resolveRobloxTarget(interaction, targetUser, null);

            if (!target) {
                return interaction.editReply({
                    content: `❌ Could not find a linked Roblox user for <@${targetUser.id}>. Please verify your account first with \`/verify\` or put your Roblox username in your server display name.`
                });
            }

            const groupRole = await RobloxManager.getUserRankInGroup(target.id);
            if (!groupRole) {
                return interaction.editReply({
                    content: `❌ **${target.name}** is not currently in the FreshlyPlaza Roblox group.`
                });
            }

            // Sync with discord roles: Map group rank to discord staff/trainee roles
            let addedRoles = [];
            let member;
            try {
                member = await interaction.guild.members.fetch(targetUser.id);
            } catch (e) {}

            if (member) {
                // If Rank >= 2 (Trainee or above), grant @Trainee
                if (groupRole.rank >= 2 && config.roles.trainee && !member.roles.cache.has(config.roles.trainee)) {
                    await member.roles.add(config.roles.trainee).catch(() => {});
                    addedRoles.push(`<@&${config.roles.trainee}>`);
                }
                // If Rank >= 8 (Junior Store Colleague or above), grant @Staff
                if (groupRole.rank >= 8 && config.roles.staff && !member.roles.cache.has(config.roles.staff)) {
                    await member.roles.add(config.roles.staff).catch(() => {});
                    addedRoles.push(`<@&${config.roles.staff}>`);
                }
                // If Rank >= 12 (Junior Team Leader or above), grant @MR
                if (groupRole.rank >= 12 && config.roles.mr && !member.roles.cache.has(config.roles.mr)) {
                    await member.roles.add(config.roles.mr).catch(() => {});
                    addedRoles.push(`<@&${config.roles.mr}>`);
                }
                // If Rank >= 18 (Corporate or Director), grant @HR
                if (groupRole.rank >= 18 && config.roles.hr && !member.roles.cache.has(config.roles.hr)) {
                    await member.roles.add(config.roles.hr).catch(() => {});
                    addedRoles.push(`<@&${config.roles.hr}>`);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🔄 Role Sync Complete')
                .addFields(
                    { name: '👤 Member', value: `<@${targetUser.id}>`, inline: true },
                    { name: '🎮 Roblox Player', value: `\`${target.name}\` (\`${target.id}\`)`, inline: true },
                    { name: '👑 Group Rank', value: `**${groupRole.name}** (Rank ${groupRole.rank})`, inline: false },
                    { name: '🎭 Synced Discord Roles', value: addedRoles.length > 0 ? addedRoles.join(', ') : '✅ Already up to date with group rank', inline: false }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 9. /game-stats
    {
        data: new SlashCommandBuilder()
            .setName('game-stats')
            .setDescription('View live player count, visits, and details for the FreshlyPlaza Roblox game'),
        async execute(interaction) {
            await interaction.deferReply();
            const groupInfo = await RobloxManager.getGroupInfo();
            const gameStats = await RobloxManager.getGameStats();

            const embed = new EmbedBuilder()
                .setTitle('🛒 FreshlyPlaza — Live Game & Group Intelligence')
                .setURL(config.robloxGameLink)
                .setDescription('Real-time operational status for FreshlyPlaza Supermarket.')
                .addFields(
                    { name: '👥 Group Members', value: `**${groupInfo ? groupInfo.memberCount : '70+'}** members`, inline: true },
                    { name: '🎮 In-Game Players', value: `**${gameStats ? (gameStats.playing || 0) : 0}** shoppers live`, inline: true },
                    { name: '🌐 Total Visits', value: `**${gameStats ? (gameStats.visits || 'N/A') : 'N/A'}**`, inline: true },
                    { name: '🏪 Experience Link', value: `[Play FreshlyPlaza on Roblox](${config.robloxGameLink})`, inline: false },
                    { name: '📢 Group Shout', value: groupInfo?.shout?.body ? `\`\`\`${groupInfo.shout.body}\`\`\`` : '*No active shout*', inline: false }
                )
                .setColor(config.colors.primary)
                .setFooter({ text: 'FreshlyPlaza Roblox Integration' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },

    // 10. /roblox-roles
    {
        data: new SlashCommandBuilder()
            .setName('roblox-roles')
            .setDescription('View all available ranks & roles in the FreshlyPlaza Roblox group'),
        async execute(interaction) {
            await interaction.deferReply();
            const roles = await RobloxManager.getGroupRoles();
            if (!roles || roles.length === 0) {
                return interaction.editReply({ content: '❌ Could not retrieve group roles from Roblox.' });
            }

            const sorted = roles.sort((a, b) => b.rank - a.rank);

            // Group into Leadership, Management, Staff, and Members
            const execRanks = sorted.filter(r => r.rank >= 245);
            const mrRanks = sorted.filter(r => r.rank >= 11 && r.rank < 245);
            const staffRanks = sorted.filter(r => r.rank >= 5 && r.rank <= 10);
            const memberRanks = sorted.filter(r => r.rank < 5);

            const formatRoles = (arr) => arr.map(r => `• \`Rank ${String(r.rank).padStart(3, ' ')}\` **${r.name}** (ID: \`${r.id}\`)`).join('\n') || '*None*';

            const embed = new EmbedBuilder()
                .setTitle('👑 FreshlyPlaza — Roblox Group Rank Hierarchy')
                .setDescription(`Showing all **${roles.length}** official group ranks configured in the FreshlyPlaza Roblox group (\`${RobloxManager.getGroupId()}\`). You can use any of these role names or rank numbers in \`/rank\`.`)
                .addFields(
                    { name: '🏛️ Foundership & Executive Leadership (Rank 245–255)', value: formatRoles(execRanks), inline: false },
                    { name: '👔 Middle Management / MR & Corporate (Rank 11–244)', value: formatRoles(mrRanks), inline: false },
                    { name: '🛒 Store Staff / Security & Colleagues (Rank 5–10)', value: formatRoles(staffRanks), inline: false },
                    { name: '🛍️ Members, Customers & Trainees (Rank 0–4)', value: formatRoles(memberRanks), inline: false }
                )
                .setColor(config.colors.primary)
                .setFooter({ text: 'FreshlyPlaza Automated Ranking Directory' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
];
