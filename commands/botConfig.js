const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Bot configuration controls (admins only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
                    { name: '🔑 Ticket Override User', value: `<@${config.ticketOverride.userId}>`, inline: true }
                )
                .setColor(config.colors.secondary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};
