const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('bug-report')
            .setDescription('Submit a bug report to FreshlyPlaza developers')
            .addStringOption(opt => opt.setName('title').setDescription('Short bug title').setRequired(true))
            .addStringOption(opt => opt.setName('details').setDescription('Detailed description of the bug').setRequired(true))
            .addStringOption(opt => opt.setName('steps').setDescription('Steps to reproduce (Optional)').setRequired(false)),
        async execute(interaction) {
            const db = getDb();
            const title = interaction.options.getString('title');
            const details = interaction.options.getString('details');
            const steps = interaction.options.getString('steps') || 'None provided';

            const res = await db.run(
                `INSERT INTO bugs (user_id, title, details, steps, status) VALUES (?, ?, ?, ?, 'PENDING')`,
                [interaction.user.id, title, details, steps]
            );

            const bugEmbed = new EmbedBuilder()
                .setTitle(`🐛 Bug Report #${res.lastID} — ${title}`)
                .setDescription(details)
                .addFields(
                    { name: '👤 Reporter', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '📌 Status', value: '⏳ Pending Review', inline: true },
                    { name: '🆔 Bug ID', value: `#${res.lastID}`, inline: true },
                    { name: '🔄 Steps to Reproduce', value: steps, inline: false }
                )
                .setColor(config.colors.warning)
                .setTimestamp()
                .setFooter({ text: 'FreshlyPlaza Bug Tracker', iconURL: interaction.guild.iconURL() });

            const bugsChannel = interaction.guild.channels.cache.get(config.channels.bugsReport);
            if (bugsChannel) {
                const msg = await bugsChannel.send({ embeds: [bugEmbed] });
                await db.run(`UPDATE bugs SET message_id = ? WHERE id = ?`, [msg.id, res.lastID]);
            }

            return interaction.reply({ content: `✅ Bug report **#${res.lastID}** submitted to <#${config.channels.bugsReport}>!`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('bug-resolve')
            .setDescription('Mark a bug report as resolved')
            .addIntegerOption(opt => opt.setName('id').setDescription('Bug Report ID').setRequired(true)),
        async execute(interaction) {
            const db = getDb();
            const bugId = interaction.options.getInteger('id');
            const bug = await db.get(`SELECT * FROM bugs WHERE id = ?`, [bugId]);
            if (!bug) return interaction.reply({ content: '❌ Bug report not found.', ephemeral: true });

            await db.run(`UPDATE bugs SET status = 'RESOLVED' WHERE id = ?`, [bugId]);

            const bugsChannel = interaction.guild.channels.cache.get(config.channels.bugsReport);
            if (bugsChannel && bug.message_id) {
                try {
                    const msg = await bugsChannel.messages.fetch(bug.message_id);
                    const embed = EmbedBuilder.from(msg.embeds[0]).setColor(config.colors.primary);
                    embed.setFields(
                        { name: '👤 Reporter', value: `<@${bug.user_id}>`, inline: true },
                        { name: '📌 Status', value: '✅ Resolved', inline: true },
                        { name: '🆔 Bug ID', value: `#${bugId}`, inline: true },
                        { name: '🔄 Steps to Reproduce', value: bug.steps || 'N/A', inline: false }
                    );
                    await msg.edit({ embeds: [embed] });
                } catch (e) {}
            }

            return interaction.reply({ content: `✅ Marked Bug Report **#${bugId}** as Resolved!`, ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('bug-known')
            .setDescription('Add a bug report to #known-bugs channel')
            .addIntegerOption(opt => opt.setName('id').setDescription('Bug Report ID').setRequired(true)),
        async execute(interaction) {
            const db = getDb();
            const bugId = interaction.options.getInteger('id');
            const bug = await db.get(`SELECT * FROM bugs WHERE id = ?`, [bugId]);
            if (!bug) return interaction.reply({ content: '❌ Bug report not found.', ephemeral: true });

            const knownBugsChannel = interaction.guild.channels.cache.get(config.channels.knownBugs);
            if (knownBugsChannel) {
                const knownEmbed = new EmbedBuilder()
                    .setTitle(`📌 Known Bug #${bug.id} — ${bug.title}`)
                    .setDescription(bug.details)
                    .addFields(
                        { name: '📌 Status', value: '⚠️ Known Issue / Under Repair', inline: true },
                        { name: '🔄 Steps to Reproduce', value: bug.steps || 'N/A', inline: false }
                    )
                    .setColor(config.colors.warning)
                    .setTimestamp();

                const knownMsg = await knownBugsChannel.send({ embeds: [knownEmbed] });
                await db.run(`UPDATE bugs SET status = 'KNOWN_BUG', known_bug_msg_id = ? WHERE id = ?`, [knownMsg.id, bugId]);

                return interaction.reply({ content: `✅ Bug **#${bugId}** added to <#${config.channels.knownBugs}>!`, ephemeral: true });
            }
        }
    }
];
