const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');
const { syncMemberRobloxRoles } = require('../utils/robloxSync');

// 100% Roblox Filter Safe Words (supermarket, food, and grocery terms)
const ROBLOX_SAFE_WORDS = [
    'apple', 'banana', 'orange', 'grape', 'bread', 'water',
    'milk', 'cheese', 'market', 'store', 'cart', 'basket',
    'fruit', 'fresh', 'juice', 'cookie', 'pasta', 'green',
    'clean', 'happy', 'bright', 'sweet', 'lemon', 'berry'
];

function generateVerificationCode() {
    const word1 = ROBLOX_SAFE_WORDS[Math.floor(Math.random() * ROBLOX_SAFE_WORDS.length)];
    const word2 = ROBLOX_SAFE_WORDS[Math.floor(Math.random() * ROBLOX_SAFE_WORDS.length)];
    const randNum = Math.floor(100 + Math.random() * 900);
    // Format: "grandway apple bread 482" - perfectly safe in Roblox bio
    return `grandway ${word1} ${word2} ${randNum}`;
}

const pendingVerifications = new Map();

/**
 * Fetch Roblox user ID by username
 */
async function resolveRobloxUser(username) {
    const cleanUser = username.trim().replace(/^@/, '');
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [cleanUser], excludeBannedUsers: false }),
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    return data.data[0];
}

/**
 * Fetch Roblox user description (bio) & profile details
 */
async function fetchRobloxUserBio(robloxId) {
    const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`, {
        headers: { 'User-Agent': 'GrandwayVerificationBot' },
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
        description: data.description || '',
        name: data.name,
        displayName: data.displayName || data.name,
        created: data.created
    };
}

/**
 * Fetch Roblox Group rank info
 */
async function fetchRobloxGroupRank(robloxId, groupId) {
    try {
        const res = await fetch(`https://groups.roblox.com/v2/users/${robloxId}/groups/roles`, {
            headers: { 'User-Agent': 'GrandwayVerificationBot' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return { rankNumber: 0, rankName: 'Non-Member / Guest' };
        const data = await res.json();
        if (data.data) {
            const grp = data.data.find(g => g.group && g.group.id == groupId);
            if (grp && grp.role) {
                return { rankNumber: grp.role.rank, rankName: grp.role.name };
            }
        }
    } catch (e) {}
    return { rankNumber: 0, rankName: 'Non-Member / Guest' };
}

/**
 * Helper to initiate verification flow for a user with a given username
 */
async function startVerificationProcess(interaction, usernameInput) {
    const robloxUser = await resolveRobloxUser(usernameInput).catch(() => null);
    if (!robloxUser) {
        const msg = `❌ Could not find a Roblox account with the username **${usernameInput}**. Please verify your spelling and try again.`;
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: msg, embeds: [], components: [] });
        } else {
            return interaction.reply({ content: msg, ephemeral: true });
        }
    }

    const robloxId = robloxUser.id;
    const robloxUsername = robloxUser.name;
    const code = generateVerificationCode();

    const [{ rankNumber, rankName }, userDetails] = await Promise.all([
        fetchRobloxGroupRank(robloxId, config.robloxGroupId),
        fetchRobloxUserBio(robloxId).catch(() => null)
    ]);

    pendingVerifications.set(interaction.user.id, {
        code,
        robloxId,
        robloxUsername,
        createdAt: Date.now()
    });

    const accountAge = userDetails && userDetails.created
        ? Math.floor((Date.now() - new Date(userDetails.created).getTime()) / (1000 * 60 * 60 * 24))
        : 'Unknown';

    const embed = new EmbedBuilder()
        .setTitle(`🔐 Grandway Shopping Roblox Verification`)
        .setDescription(
            `Hello <@${interaction.user.id}>! To verify that you own **${robloxUsername}**, please complete the quick bio challenge:\n\n` +
            `### 🔑 Step 1: Copy your verification code\n` +
            `\`\`\`\n${code}\n\`\`\`\n` +
            `### 📝 Step 2: Paste it into your Roblox Profile 'About' / Bio\n` +
            `1. Open your profile: [Roblox Profile](https://www.roblox.com/users/${robloxId}/profile)\n` +
            `2. Go to Profile Settings on Roblox.\n` +
            `3. Paste the code into your **About** box and click **Save**.\n\n` +
            `### ⚡ Step 3: Click 'Confirm Verification'\n` +
            `Once saved, click **Confirm Verification** below! The bot will verify your code and assign your **Verified Member** role along with your exact **${rankName}** role!`
        )
        .addFields(
            { name: '👤 Roblox User', value: `**${robloxUsername}** (\`${robloxId}\`)`, inline: true },
            { name: '🏬 Group Rank', value: `**${rankName}** (Rank ${rankNumber})`, inline: true },
            { name: '📅 Account Age', value: `${accountAge} days`, inline: true }
        )
        .setColor(config.colors.secondary)
        .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`)
        .setFooter({ text: 'Roblox-Safe Bio Words • Code expires in 15 minutes' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`verify_confirm_${robloxId}`)
            .setLabel('Confirm Verification')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setLabel('Open Roblox Profile')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.roblox.com/users/${robloxId}/profile`),
        new ButtonBuilder()
            .setCustomId(`verify_cancel_${robloxId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
    );

    if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ embeds: [embed], components: [row] });
    } else {
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('verify')
            .setDescription('Link & verify your Roblox account with Grandway Shopping using your Profile Bio')
            .addStringOption(opt => opt.setName('username').setDescription('Your exact Roblox username').setRequired(true)),
        async execute(interaction) {
            await interaction.deferReply({ ephemeral: true });
            const usernameInput = interaction.options.getString('username');
            return await startVerificationProcess(interaction, usernameInput);
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('sync-rank')
            .setDescription('Re-sync your Roblox Group rank with Grandway Shopping Discord roles'),
        async execute(interaction) {
            await interaction.deferReply({ ephemeral: true });
            const db = getDb();
            const data = db.getData();
            const verif = data.verifications[interaction.user.id];

            if (!verif) {
                return interaction.editReply({
                    content: '❌ You are not verified yet! Please click the **Verify Account** button in <#' + config.channels.verification + '> or run `/verify`.'
                });
            }

            const { rankNumber, rankName } = await fetchRobloxGroupRank(verif.roblox_id, config.robloxGroupId);
            const member = interaction.member;

            if (member) {
                await syncMemberRobloxRoles(member, rankNumber, rankName);
                try {
                    await member.setNickname(`${verif.roblox_username} (${rankName})`);
                } catch (e) {}
            }

            const embed = new EmbedBuilder()
                .setTitle('🔄 Roles & Group Rank Re-Synced!')
                .setDescription(`Successfully refreshed roles for <@${interaction.user.id}>!`)
                .addFields(
                    { name: 'Roblox Account', value: `**${verif.roblox_username}** (\`${verif.roblox_id}\`)`, inline: true },
                    { name: 'Grandway Group Rank', value: `**${rankName}** (Rank ${rankNumber})`, inline: true }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
    ,
    {
        data: new SlashCommandBuilder()
            .setName('manual-verify')
            .setDescription('Staff Command: Manually verify a Discord user with their Roblox account & assign roles')
            .addUserOption(opt => opt.setName('user').setDescription('The Discord member to verify').setRequired(true))
            .addStringOption(opt => opt.setName('username').setDescription('Their exact Roblox username or numeric ID').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for manual verification override').setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
        async execute(interaction) {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (config.roles.staff && member.roles.cache.has(config.roles.staff)) ||
                                (config.roles.mr && member.roles.cache.has(config.roles.mr)) ||
                                (config.roles.hr && member.roles.cache.has(config.roles.hr));

            if (!isAuthorized) {
                return interaction.reply({
                    content: '🚫 You do not have permission to manually verify members. (Requires Staff / Manage Roles)',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user');
            const targetUsernameInput = interaction.options.getString('username').trim();
            const reason = interaction.options.getString('reason') || 'Manual verification by staff';

            let targetMember = null;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (_) {}

            if (!targetMember) {
                return interaction.editReply({ content: '❌ Could not find that user in this Discord server.' });
            }

            let robloxUser = null;
            if (/^\d+$/.test(targetUsernameInput)) {
                try {
                    const res = await fetch('https://users.roblox.com/v1/users/' + targetUsernameInput, {
                        headers: { 'User-Agent': 'GrandwayVerificationBot' },
                        signal: AbortSignal.timeout(5000)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        robloxUser = { id: data.id, name: data.name };
                    }
                } catch (_) {}
            }

            if (!robloxUser) {
                robloxUser = await resolveRobloxUser(targetUsernameInput).catch(() => null);
            }

            if (!robloxUser) {
                return interaction.editReply({
                    content: `❌ Could not locate a Roblox account matching **${targetUsernameInput}**. Please verify spelling or numeric Roblox ID.`
                });
            }

            const robloxId = robloxUser.id;
            const robloxUsername = robloxUser.name;

            const [{ rankNumber, rankName }, userDetails] = await Promise.all([
                fetchRobloxGroupRank(robloxId, config.robloxGroupId),
                fetchRobloxUserBio(robloxId).catch(() => null)
            ]);

            const db = getDb();
            await db.setVerification(targetUser.id, robloxId, robloxUsername);

            pendingVerifications.delete(targetUser.id);

            await syncMemberRobloxRoles(targetMember, rankNumber, rankName);
            try {
                await targetMember.setNickname(`${robloxUsername} (${rankName})`);
            } catch (e) {
                console.warn('[MANUAL-VERIFY] Nickname update skipped:', e.message);
            }

            const hierarchyData = require('../utils/robloxSync').hierarchyData;
            const assignedRoleMentions = [];
            if (hierarchyData && hierarchyData.rankToRoleId && hierarchyData.rankToRoleId[String(rankNumber)]) {
                assignedRoleMentions.push(`<@&${hierarchyData.rankToRoleId[String(rankNumber)]}>`);
            }
            if (rankNumber >= 250 && config.roles.cSuite) assignedRoleMentions.push(`<@&${config.roles.cSuite}>`);
            if (rankNumber >= 100 && config.roles.hr) assignedRoleMentions.push(`<@&${config.roles.hr}>`);
            if (rankNumber >= 30 && config.roles.mr) assignedRoleMentions.push(`<@&${config.roles.mr}>`);
            if (rankNumber >= 10 && config.roles.staff) assignedRoleMentions.push(`<@&${config.roles.staff}>`);
            if (config.roles.verified) assignedRoleMentions.push(`<@&${config.roles.verified}>`);
            if (config.roles.customer) assignedRoleMentions.push(`<@&${config.roles.customer}>`);

            const displayRolesText = assignedRoleMentions.length > 0
                ? [...new Set(assignedRoleMentions)].join(' • ')
                : `<@&${config.roles.verified}> • <@&${config.roles.customer}>`;

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Member Manually Verified')
                .setDescription(`Successfully linked <@${targetUser.id}> to Roblox account **${robloxUsername}**!`)
                .addFields(
                    { name: '👤 Discord Member', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                    { name: '🎮 Roblox Profile', value: `[${robloxUsername}](https://www.roblox.com/users/${robloxId}/profile) (\`${robloxId}\`)`, inline: true },
                    { name: '🏬 Group Rank', value: `**${rankName}** (Rank ${rankNumber})`, inline: true },
                    { name: '🏷️ Assigned Roles', value: displayRolesText, inline: false },
                    { name: '👮 Verified By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📝 Reason / Note', value: reason, inline: true }
                )
                .setColor(config.colors.primary)
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`)
                .setFooter({ text: 'Grandway Shopping Staff Verification Override' })
                .setTimestamp();

            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎉 You have been verified!')
                    .setDescription(`A staff member (<@${interaction.user.id}>) has manually verified your account in **${interaction.guild.name}**!`)
                    .addFields(
                        { name: '🎮 Linked Roblox Account', value: `**${robloxUsername}** (\`${robloxId}\`)`, inline: true },
                        { name: '🏬 Synced Group Rank', value: `**${rankName}** (Rank ${rankNumber})`, inline: true },
                        { name: '📝 Reason', value: reason, inline: false }
                    )
                    .setColor(config.colors.primary)
                    .setTimestamp();
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (_) {}

            return interaction.editReply({ embeds: [successEmbed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unverify')
            .setDescription('Staff Command: Remove Roblox verification link and remove verified roles from a member')
            .addUserOption(opt => opt.setName('user').setDescription('The Discord member to unverify').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Reason for unverification').setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
        async execute(interaction) {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (config.roles.mr && member.roles.cache.has(config.roles.mr)) ||
                                (config.roles.hr && member.roles.cache.has(config.roles.hr));

            if (!isAuthorized) {
                return interaction.reply({
                    content: '🚫 You do not have permission to unverify members. (Requires MR / HR / Manage Roles)',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply();
            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Unverified by staff';

            const db = getDb();
            const existing = await db.removeVerification(targetUser.id);
            if (!existing) {
                return interaction.editReply({ content: `⚠️ <@${targetUser.id}> is not currently verified in the database.` });
            }

            let targetMember = null;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (_) {}

            if (targetMember) {
                const rolesToRemove = [];
                if (config.roles.verified && targetMember.roles.cache.has(config.roles.verified)) rolesToRemove.push(config.roles.verified);
                if (config.roles.customer && targetMember.roles.cache.has(config.roles.customer)) rolesToRemove.push(config.roles.customer);

                if (config.roles.unverified && !targetMember.roles.cache.has(config.roles.unverified)) {
                    await targetMember.roles.add(config.roles.unverified).catch(() => null);
                }
                if (rolesToRemove.length > 0) {
                    await targetMember.roles.remove(rolesToRemove).catch(() => null);
                }
            }

            const unverifyEmbed = new EmbedBuilder()
                .setTitle('🔓 Member Unverified')
                .setDescription(`Successfully unlinked verification records for <@${targetUser.id}>.`)
                .addFields(
                    { name: 'Discord Member', value: `<@${targetUser.id}>`, inline: true },
                    { name: 'Previous Roblox', value: `**${existing.roblox_username}** (\`${existing.roblox_id}\`)`, inline: true },
                    { name: 'Staff Action By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setColor(config.colors.warning)
                .setTimestamp();

            return interaction.editReply({ embeds: [unverifyEmbed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('unverified')
            .setDescription('Staff Command: List all human members (non-bots) who have not verified with Roblox')
            .addIntegerOption(opt =>
                opt.setName('page')
                    .setDescription('Page number to display (10 members per page)')
                    .setMinValue(1)
                    .setRequired(false)
            )
            .addBooleanOption(opt =>
                opt.setName('ephemeral')
                    .setDescription('Whether to make this response visible only to you (default: false)')
                    .setRequired(false)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
        async execute(interaction) {
            const member = interaction.member;
            const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                                member.permissions.has(PermissionFlagsBits.Administrator) ||
                                (config.roles.staff && member.roles.cache.has(config.roles.staff)) ||
                                (config.roles.mr && member.roles.cache.has(config.roles.mr)) ||
                                (config.roles.hr && member.roles.cache.has(config.roles.hr));

            if (!isAuthorized) {
                return interaction.reply({
                    content: '🚫 You do not have permission to view unverified members. (Requires Staff / Manage Roles)',
                    flags: MessageFlags.Ephemeral
                });
            }

            const isEphemeral = interaction.options.getBoolean('ephemeral') ?? false;
            await interaction.deferReply({ flags: isEphemeral ? MessageFlags.Ephemeral : undefined });

            const page = interaction.options.getInteger('page') || 1;
            const renderData = await buildUnverifiedPage(interaction.guild, page);

            return interaction.editReply(renderData);
        }
    }
];

/**
 * Builds the embed and pagination action row for unverified members
 */
async function buildUnverifiedPage(guild, pageNumber = 1) {
    try {
        await guild.members.fetch();
    } catch (_) {}

    const db = getDb();
    const data = db.getData();
    const verifications = data.verifications || {};

    const unverifiedMembers = [];
    let totalHumans = 0;
    let totalBots = 0;

    for (const [, m] of guild.members.cache) {
        if (m.user.bot) {
            totalBots++;
            continue;
        }
        totalHumans++;

        const isVerified = (config.roles.verified && m.roles.cache.has(config.roles.verified)) ||
                           Boolean(verifications[m.id]);

        if (!isVerified) {
            unverifiedMembers.push(m);
        }
    }

    // Sort unverified members: newest joins first
    unverifiedMembers.sort((a, b) => (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0));

    const totalUnverified = unverifiedMembers.length;
    const verifiedCount = totalHumans - totalUnverified;
    const verifiedPct = totalHumans > 0 ? Math.round((verifiedCount / totalHumans) * 100) : 0;
    const unverifiedPct = totalHumans > 0 ? Math.round((totalUnverified / totalHumans) * 100) : 0;

    if (totalUnverified === 0) {
        const cleanEmbed = new EmbedBuilder()
            .setTitle('🎉 All Members Verified!')
            .setDescription(`Every single human member in **${guild.name}** has verified their Roblox account!`)
            .addFields(
                { name: '👥 Total Humans', value: `${totalHumans}`, inline: true },
                { name: '✅ Verified Rate', value: `100% (${verifiedCount}/${totalHumans})`, inline: true },
                { name: '🤖 Excluded Bots', value: `${totalBots}`, inline: true }
            )
            .setColor(config.colors.secondary || '#57F287')
            .setTimestamp();
        return { embeds: [cleanEmbed], components: [] };
    }

    const pageSize = 10;
    const totalPages = Math.ceil(totalUnverified / pageSize);
    const currentPage = Math.max(1, Math.min(pageNumber, totalPages));

    const startIndex = (currentPage - 1) * pageSize;
    const pageSlice = unverifiedMembers.slice(startIndex, startIndex + pageSize);

    const memberListText = pageSlice.map((m, i) => {
        const num = startIndex + i + 1;
        const joinedText = m.joinedTimestamp ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : 'Unknown';
        const createdText = `<t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`;
        const hasUnverifiedRole = config.roles.unverified && m.roles.cache.has(config.roles.unverified);
        const roleStatus = hasUnverifiedRole ? ' • `[Role: Unverified]`' : '';
        return `**#${num}** <@${m.id}> • \`@${m.user.username}\` (\`${m.id}\`)${roleStatus}\n` +
               `└ 📥 Joined: ${joinedText} • 🎂 Created: ${createdText}`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
        .setTitle(`📋 Unverified Members (Non-Bots) — ${guild.name}`)
        .setDescription(
            `Found **${totalUnverified}** unverified human member(s) out of **${totalHumans}** total humans.\n\n` +
            memberListText
        )
        .addFields(
            { name: '📊 Statistics', value: `👥 Total Humans: **${totalHumans}**\n✅ Verified: **${verifiedCount}** (${verifiedPct}%)\n⚠️ Unverified: **${totalUnverified}** (${unverifiedPct}%)`, inline: true },
            { name: '🤖 Filter', value: `**${totalBots}** Bots excluded\n📄 Page **${currentPage}** of **${totalPages}**`, inline: true }
        )
        .setColor(config.colors.warning || '#FFAB00')
        .setFooter({ text: `Grandway Shopping • Page ${currentPage}/${totalPages} • Use buttons to navigate` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`unverified_page_${currentPage - 1}`)
            .setLabel('Previous')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`unverified_page_info`)
            .setLabel(`Page ${currentPage} / ${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`unverified_page_${currentPage + 1}`)
            .setLabel('Next')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages),
        new ButtonBuilder()
            .setCustomId(`unverified_page_1`)
            .setLabel('First')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 1),
        new ButtonBuilder()
            .setCustomId(`unverified_refresh_${currentPage}`)
            .setLabel('Refresh')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [row] };
}

module.exports.buildUnverifiedPage = buildUnverifiedPage;
module.exports.pendingVerifications = pendingVerifications;
module.exports.fetchRobloxUserBio = fetchRobloxUserBio;
module.exports.fetchRobloxGroupRank = fetchRobloxGroupRank;
module.exports.startVerificationProcess = startVerificationProcess;
module.exports.resolveRobloxUser = resolveRobloxUser;
