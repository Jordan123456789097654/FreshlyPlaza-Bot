const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('honeypot-stats')
            .setDescription('View honeypot security triggers and caught spambot count'),
        async execute(interaction) {
            const db = getDb();
            const logs = await db.all(`SELECT COUNT(*) as total FROM honeypot_logs`);
            const totalTriggers = logs[0] ? logs[0].total : 0;
            const recent = await db.all(`SELECT * FROM honeypot_logs ORDER BY id DESC LIMIT 5`);

            const embed = new EmbedBuilder()
                .setTitle('🛡️ Honeypot Security Statistics')
                .addFields(
                    { name: '🚨 Total Spammers/Bots Caught', value: `**${totalTriggers}** caught`, inline: true },
                    { name: '📍 Target Trap Channel', value: `<#${config.channels.honeypot}>`, inline: true }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            if (recent.length > 0) {
                const recentList = recent.map(r => `• **${r.username}** (<@${r.user_id}>) — ${r.trigger_reason} [${r.action_taken}]`).join('\n');
                embed.addFields({ name: '📋 Recent Captures', value: recentList });
            }

            return interaction.reply({ embeds: [embed] });
        }
    }
];
