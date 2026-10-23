const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('event-create')
            .setDescription('Create a community event')
            .addStringOption(opt => opt.setName('title').setDescription('Event Title').setRequired(true))
            .addStringOption(opt => opt.setName('description').setDescription('Event Details').setRequired(true))
            .addStringOption(opt => opt.setName('time').setDescription('Scheduled Date & Time').setRequired(true))
            .addStringOption(opt => opt.setName('link').setDescription('Roblox Place / Game link').setRequired(false)),
        async execute(interaction) {
            const db = getDb();
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const time = interaction.options.getString('time');
            const link = interaction.options.getString('link') || config.robloxGameLink;

            const res = await db.run(
                `INSERT INTO events (title, description, host_id, game_link, event_time, status) VALUES (?, ?, ?, ?, ?, 'UPCOMING')`,
                [title, description, interaction.user.id, link, time]
            );

            const { formatWorldTime } = require('../utils/timeFormat');
            const now = new Date();
            const worldTime = formatWorldTime(now);

            const embed = new EmbedBuilder()
                .setTitle(`🎊 Grandway Shopping Event — ${title}`)
                .setDescription(description)
                .addFields(
                    { name: '👤 Host', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏰ Stated Time', value: time, inline: true },
                    { name: '🆔 Event ID', value: `#${res.lastID}`, inline: true },
                    { name: '👥 Attendees (RSVP)', value: '0 Members', inline: false }
                );

            if (worldTime && worldTime.worldTimesList) {
                embed.addFields({
                    name: '🌐 Global Timezones (Announced At)',
                    value: worldTime.worldTimesList,
                    inline: false
                });
            }

            embed.setColor(config.colors.primary)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`rsvp_event_${res.lastID}`).setLabel('✅ I will attend! (RSVP)').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setLabel('🎮 Join Event Game').setStyle(ButtonStyle.Link).setURL(link)
            );

            const eventsChannel = interaction.guild.channels.cache.get(config.channels.events);
            if (eventsChannel) {
                const msg = await eventsChannel.send({
                    content: `<@&${config.roles.eventsPing}> 🎉 **NEW COMMUNITY EVENT ANNOUNCED!**`,
                    embeds: [embed],
                    components: [row]
                });
                await db.run(`UPDATE events SET message_id = ? WHERE id = ?`, [msg.id, res.lastID]);
            }

            return interaction.reply({ content: `✅ Event **"${title}"** posted in <#${config.channels.events}>!`, ephemeral: true });
        }
    }
];
