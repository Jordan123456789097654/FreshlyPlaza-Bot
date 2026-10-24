const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
];

module.exports.pendingVerifications = pendingVerifications;
module.exports.fetchRobloxUserBio = fetchRobloxUserBio;
module.exports.fetchRobloxGroupRank = fetchRobloxGroupRank;
module.exports.startVerificationProcess = startVerificationProcess;
