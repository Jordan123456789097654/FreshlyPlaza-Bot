const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('crypto');
const config = require('../config');
const { getDb } = require('../database');
const { syncMemberRobloxRoles } = require('../utils/robloxSync');

// Random verification word generator for memorable bio codes
const CODE_WORDS = [
    'grandway', 'shopping', 'fresh', 'checkout', 'aisle', 'produce',
    'cart', 'market', 'grocer', 'bakery', 'organic', 'counter',
    'register', 'clerk', 'supermarket', 'basket', 'express', 'receipt'
];

function generateVerificationCode() {
    const word1 = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
    const word2 = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
    const randNum = Math.floor(1000 + Math.random() * 9000);
    return `grandway-${word1}-${word2}-${randNum}`;
}

// In-memory verification sessions: discordUserId -> { code, robloxId, robloxUsername, createdAt }
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
 * Fetch Roblox user description (bio)
 */
async function fetchRobloxUserBio(robloxId) {
    const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`, {
        headers: { 'User-Agent': 'DiscordBot' },
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
        description: data.description || '',
        name: data.name,
        displayName: data.displayName
    };
}

/**
 * Fetch Roblox Group rank info
 */
async function fetchRobloxGroupRank(robloxId, groupId) {
    try {
        const res = await fetch(`https://groups.roblox.com/v2/users/${robloxId}/groups/roles`, {
            headers: { 'User-Agent': 'DiscordBot' },
            signal: AbortSignal.timeout(5000)
        });
        if (!res.ok) return { rankNumber: 0, rankName: 'Guest' };
        const data = await res.json();
        if (data.data) {
            const grp = data.data.find(g => g.group && g.group.id == groupId);
            if (grp && grp.role) {
                return { rankNumber: grp.role.rank, rankName: grp.role.name };
            }
        }
    } catch (e) {}
    return { rankNumber: 0, rankName: 'Guest' };
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('verify')
            .setDescription('Verify your Roblox account with Grandway Shopping using your Roblox Profile Bio')
            .addStringOption(opt => opt.setName('username').setDescription('Your exact Roblox username').setRequired(true)),
        async execute(interaction) {
            await interaction.deferReply({ ephemeral: true });
            const usernameInput = interaction.options.getString('username');

            // 1. Resolve Roblox user
            const robloxUser = await resolveRobloxUser(usernameInput).catch(() => null);
            if (!robloxUser) {
                return interaction.editReply({
                    content: `❌ Could not find a Roblox account with the username **${usernameInput}**. Please verify your spelling and try again.`
                });
            }

            const robloxId = robloxUser.id;
            const robloxUsername = robloxUser.name;
            const code = generateVerificationCode();

            // Save pending verification session (expires after 15 minutes)
            pendingVerifications.set(interaction.user.id, {
                code,
                robloxId,
                robloxUsername,
                createdAt: Date.now()
            });

            const embed = new EmbedBuilder()
                .setTitle(`🔐 Grandway Shopping Roblox Verification`)
                .setDescription(
                    `Hello <@${interaction.user.id}>! To verify that you own the Roblox account **${robloxUsername}** (ID: \`${robloxId}\`), please follow these steps:\n\n` +
                    `### 📋 Step 1: Copy your unique verification code\n` +
                    `\`\`\`\n${code}\n\`\`\`\n` +
                    `### 📋 Step 2: Paste it into your Roblox Profile 'About' / Bio\n` +
                    `1. Visit your profile at: [Roblox Profile](https://www.roblox.com/users/${robloxId}/profile)\n` +
                    `2. Click **Edit Profile** or go to Account Settings.\n` +
                    `3. Paste the code anywhere in your **About Me** / Bio and click **Save**.\n\n` +
                    `### 📋 Step 3: Confirm Verification\n` +
                    `Once saved, click the green **Confirm Verification** button below. The bot will check your profile bio and assign your roles!`
                )
                .setColor(config.colors.secondary)
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=150&height=150&format=png`)
                .setFooter({ text: 'Code expires in 15 minutes • You can remove the code from your bio after verification' })
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

            return interaction.editReply({ embeds: [embed], components: [row] });
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
                    content: '❌ You are not verified yet! Please link your account first using `/verify`.'
                });
            }

            const { rankNumber, rankName } = await fetchRobloxGroupRank(verif.roblox_id, config.robloxGroupId);
            const member = interaction.member;

            if (member) {
                await syncMemberRobloxRoles(member, rankNumber, rankName);
                // Also update nickname if desired
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

// Export helpers for button listener
module.exports.pendingVerifications = pendingVerifications;
module.exports.fetchRobloxUserBio = fetchRobloxUserBio;
module.exports.fetchRobloxGroupRank = fetchRobloxGroupRank;
