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
    }
];

module.exports.pendingVerifications = pendingVerifications;
module.exports.fetchRobloxUserBio = fetchRobloxUserBio;
module.exports.fetchRobloxGroupRank = fetchRobloxGroupRank;
module.exports.startVerificationProcess = startVerificationProcess;
module.exports.resolveRobloxUser = resolveRobloxUser;
