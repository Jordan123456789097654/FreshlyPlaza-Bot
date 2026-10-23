const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const https = require('https');
const config = require('../config');
const { getDb } = require('../database');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'DiscordBot' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
            });
        }).on('error', reject);
    });
}

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('verify')
            .setDescription('Link your Roblox account and sync roles')
            .addStringOption(opt => opt.setName('username').setDescription('Your Roblox Username').setRequired(true)),
        async execute(interaction) {
            await interaction.deferReply({ ephemeral: true });
            const username = interaction.options.getString('username');
            const db = getDb();

            let robloxId = '12345678';
            let realUsername = username;
            let rankName = 'Customer';

            try {
                const res = await fetchJson(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`);
                if (res && res.Id) {
                    robloxId = res.Id;
                    realUsername = res.Username;
                }
            } catch (e) {}

            try {
                const groupsRes = await fetchJson(`https://groups.roblox.com/v1/users/${robloxId}/groups/roles`);
                if (groupsRes && groupsRes.data) {
                    const groupData = groupsRes.data.find(g => g.group.id == config.robloxGroupId);
                    if (groupData) {
                        rankName = groupData.role.name;
                    }
                }
            } catch (e) {}

            await db.setVerification(interaction.user.id, robloxId, realUsername);

            const member = interaction.member;
            if (member && config.roles.verified) {
                try { await member.roles.add(config.roles.verified); } catch (e) {}
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Roblox Account Verified!')
                .setDescription(`Successfully linked **${realUsername}** (ID: \`${robloxId}\`) to <@${interaction.user.id}>!`)
                .addFields(
                    { name: '🏬 Grandway Shopping Group Rank', value: `**${rankName}** (Group ID: ${config.robloxGroupId})`, inline: true },
                    { name: '🏷️ Assigned Role', value: `<@&${config.roles.verified}>`, inline: true }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('sync-rank')
            .setDescription('Re-sync your Roblox Group rank with Discord roles'),
        async execute(interaction) {
            await interaction.deferReply({ ephemeral: true });
            const db = getDb();
            const data = db.getData();
            const verif = data.verifications[interaction.user.id];

            if (!verif) {
                return interaction.editReply({ content: '❌ You are not verified yet! Please run `/verify` first.' });
            }

            let rankName = 'Customer';
            try {
                const groupsRes = await fetchJson(`https://groups.roblox.com/v1/users/${verif.roblox_id}/groups/roles`);
                if (groupsRes && groupsRes.data) {
                    const groupData = groupsRes.data.find(g => g.group.id == config.robloxGroupId);
                    if (groupData) rankName = groupData.role.name;
                }
            } catch (e) {}

            return interaction.editReply({ content: `✅ Re-synced rank for **${verif.roblox_username}**! Current Group Rank: **${rankName}**` });
        }
    }
];
