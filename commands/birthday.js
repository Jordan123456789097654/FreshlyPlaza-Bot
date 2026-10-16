const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('birthday-set')
            .setDescription('Register your birthday')
            .addIntegerOption(opt => opt.setName('month').setDescription('Birth Month (1-12)').setRequired(true))
            .addIntegerOption(opt => opt.setName('day').setDescription('Birth Day (1-31)').setRequired(true)),
        async execute(interaction) {
            const month = interaction.options.getInteger('month');
            const day = interaction.options.getInteger('day');
            const db = getDb();

            if (month < 1 || month > 12 || day < 1 || day > 31) {
                return interaction.reply({ content: '❌ Invalid month or day. Please provide a valid birth date.', ephemeral: true });
            }

            await db.setBirthday(interaction.user.id, month, day);

            const embed = new EmbedBuilder()
                .setTitle('🎂 Birthday Registered!')
                .setDescription(`Your birthday has been set to **${month}/${day}**!\nOn your special day, the bot will grant you the <@&${config.roles.birthday}> role and announce your birthday!`)
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
];
