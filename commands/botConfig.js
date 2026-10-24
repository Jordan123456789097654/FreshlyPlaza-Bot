const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getDb } = require('../database');
const { refreshAllEmbedsWithNewGameLink } = require('../utils/embedSync');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Bot and server configuration controls (admins only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('game-link')
                .setDescription('Update the official Roblox game link and auto-edit all server embeds & buttons')
                .addStringOption(opt =>
                    opt.setName('url')
                        .setDescription('The new Roblox game link (e.g. https://www.roblox.com/games/...)')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('ai')
                .setDescription('Turn the AI ticket assistant on or off everywhere')
                .addBooleanOption(opt =>
                    opt.setName('enabled')
                        .setDescription('true = AI on, false = AI off (tickets go straight to staff)')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Show the current bot configuration')
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ Only server administrators can change bot configuration.',
                flags: MessageFlags.Ephemeral
            });
        }

        const db = getDb();
        const sub = interaction.options.getSubcommand();

        if (sub === 'game-link') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const newLink = interaction.options.getString('url').trim();

            if (!newLink.startsWith('https://www.roblox.com/games/') && !newLink.startsWith('https://roblox.com/games/')) {
                return interaction.editReply({
                    content: '❌ Invalid Roblox game link format! It must start with `https://www.roblox.com/games/...`'
                });
            }

            // 1. Update in runtime config
            config.robloxGameLink = newLink;

            // 2. Persist in config.js
            try {
                const configPath = path.join(__dirname, '../config.js');
                let content = fs.readFileSync(configPath, 'utf8');
                content = content.replace(/robloxGameLink:\s*'[^']+'/, `robloxGameLink: '${newLink}'`);
                fs.writeFileSync(configPath, content, 'utf8');
            } catch (err) {
                console.error('[CONFIG GAME LINK] Error saving config.js:', err);
            }

            // 3. Scan and auto-update all bot embeds and button links across channels
            const editedCount = await refreshAllEmbedsWithNewGameLink(interaction.client, newLink);

            const embed = new EmbedBuilder()
                .setTitle('🎮 Supermarket Game Link Updated!')
                .setDescription(
                    `Successfully updated the official Roblox game link to:\n` +
                    `[**${newLink}**](${newLink})\n\n` +
                    `✅ **Auto-Updated Embeds:** Edited **${editedCount}** existing announcement & verification embeds/buttons across server channels.`
                )
                .setColor(config.colors.primary)
                .setFooter({ text: `Updated by ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'ai') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setAiEnabled(enabled, interaction.user.id);
            console.log(`[CONFIG] AI ${enabled ? 'ENABLED' : 'DISABLED'} by ${interaction.user.tag} (${interaction.user.id})`);

            const embed = new EmbedBuilder()
                .setTitle(enabled ? '🤖 AI Assistant Enabled' : '🛑 AI Assistant Disabled')
                .setDescription(
                    enabled
                        ? 'The AI ticket assistant is back on. New and existing tickets will receive AI support again.'
                        : 'The AI ticket assistant is now off. Tickets are handled by human staff only: no AI replies, translations, screenshot analysis, or AI QA grading.'
                )
                .setColor(enabled ? config.colors.primary : config.colors.warning)
                .setFooter({ text: `Changed by ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        if (sub === 'status') {
            const aiOn = db.isAiEnabled();
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Bot Configuration Status')
                .addFields(
                    { name: '🤖 AI Assistant', value: aiOn ? '🟢 Enabled' : '🔴 Disabled', inline: true },
                    { name: '🎮 Current Game Link', value: `[Link](${config.robloxGameLink})`, inline: true },
                    { name: '🔑 Ticket Override User', value: `<@${config.ticketOverride.userId}>`, inline: true }
                )
                .setColor(config.colors.secondary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};
