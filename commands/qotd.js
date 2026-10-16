const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const config = require('../config');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('qotd-post')
            .setDescription('Post a new Question of the Day in #qotd')
            .addStringOption(opt => opt.setName('question').setDescription('The question to ask community members').setRequired(true)),
        async execute(interaction) {
            const question = interaction.options.getString('question');

            const embed = new EmbedBuilder()
                .setTitle('❓ FreshlyPlaza — Question of the Day (QOTD)')
                .setDescription(`**${question}**\n\n*Reply in this channel or in the discussion thread below to share your thoughts!*`)
                .setColor(config.colors.secondary)
                .setTimestamp();

            const qotdChannel = interaction.guild.channels.cache.get(config.channels.qotd) || interaction.channel;
            if (qotdChannel) {
                const msg = await qotdChannel.send({ embeds: [embed] });
                try {
                    await msg.startThread({
                        name: `QOTD Discussion — ${new Date().toLocaleDateString()}`,
                        autoArchiveDuration: 1440
                    });
                } catch (e) {}
            }

            return interaction.reply({ content: `✅ Posted QOTD in <#${qotdChannel.id}>!`, ephemeral: true });
        }
    }
];
