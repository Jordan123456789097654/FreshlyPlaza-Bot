const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = [
    // 1. /poll - Interactive Community Poll with live bar display
    {
        data: new SlashCommandBuilder()
            .setName('poll')
            .setDescription('Create an interactive community poll with up to 5 options')
            .addStringOption(opt => opt.setName('question').setDescription('The poll question').setRequired(true))
            .addStringOption(opt => opt.setName('option1').setDescription('Option 1').setRequired(true))
            .addStringOption(opt => opt.setName('option2').setDescription('Option 2').setRequired(true))
            .addStringOption(opt => opt.setName('option3').setDescription('Option 3 (Optional)').setRequired(false))
            .addStringOption(opt => opt.setName('option4').setDescription('Option 4 (Optional)').setRequired(false))
            .addStringOption(opt => opt.setName('option5').setDescription('Option 5 (Optional)').setRequired(false)),
        async execute(interaction) {
            const question = interaction.options.getString('question');
            const options = [
                interaction.options.getString('option1'),
                interaction.options.getString('option2'),
                interaction.options.getString('option3'),
                interaction.options.getString('option4'),
                interaction.options.getString('option5')
            ].filter(Boolean);

            const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
            const optionLines = options.map((opt, i) => `${emojis[i]} **${opt}**`).join('\n\n');

            const pollEmbed = new EmbedBuilder()
                .setTitle(`📊 Community Poll: ${question}`)
                .setDescription(optionLines)
                .setColor(config.colors.secondary)
                .setFooter({ text: `Polled by ${interaction.user.tag} • React below to cast your vote!`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            const pollMsg = await interaction.reply({ embeds: [pollEmbed], fetchReply: true });
            for (let i = 0; i < options.length; i++) {
                await pollMsg.react(emojis[i]).catch(() => {});
            }
        }
    },

    // 2. /rep - Reputation & Vouch System (Give & Check)
    {
        data: new SlashCommandBuilder()
            .setName('rep')
            .setDescription('Community Reputation & Vouch System')
            .addSubcommand(sub =>
                sub.setName('give')
                    .setDescription('Give positive reputation to a staff member or helpful customer')
                    .addUserOption(opt => opt.setName('user').setDescription('Target user to give reputation to').setRequired(true))
                    .addStringOption(opt => opt.setName('comment').setDescription('Why are you giving them rep? (e.g. Great checkout service)').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('check')
                    .setDescription('View the community reputation and vouches of a user')
                    .addUserOption(opt => opt.setName('user').setDescription('User to check (defaults to yourself)').setRequired(false))
            ),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();

            if (sub === 'give') {
                const targetUser = interaction.options.getUser('user');
                const comment = interaction.options.getString('comment');

                if (targetUser.id === interaction.user.id) {
                    return interaction.reply({ content: '❌ You cannot give reputation to yourself!', flags: MessageFlags.Ephemeral });
                }
                if (targetUser.bot) {
                    return interaction.reply({ content: '❌ You cannot give reputation to a bot.', flags: MessageFlags.Ephemeral });
                }

                const db = getDb();
                const data = db.getData();
                if (!data.user_reputation) data.user_reputation = {};
                if (!data.user_reputation[targetUser.id]) {
                    data.user_reputation[targetUser.id] = { points: 0, reviews: [] };
                }

                data.user_reputation[targetUser.id].points += 1;
                data.user_reputation[targetUser.id].reviews.push({
                    from_id: interaction.user.id,
                    from_tag: interaction.user.tag,
                    comment,
                    timestamp: new Date().toISOString()
                });
                db.save();

                const total = data.user_reputation[targetUser.id].points;

                const repEmbed = new EmbedBuilder()
                    .setTitle('⭐ Reputation Awarded!')
                    .setDescription(`<@${interaction.user.id}> gave positive reputation to <@${targetUser.id}>!`)
                    .addFields(
                        { name: '💬 Review', value: `*"${comment}"*`, inline: false },
                        { name: '🏆 Total Reputation', value: `**+${total} Rep**`, inline: true }
                    )
                    .setColor(config.colors.primary)
                    .setTimestamp();

                return interaction.reply({ embeds: [repEmbed] });
            } else if (sub === 'check') {
                const targetUser = interaction.options.getUser('user') || interaction.user;
                const db = getDb();
                const data = db.getData();
                const repData = (data.user_reputation || {})[targetUser.id] || { points: 0, reviews: [] };

                const latestReviews = repData.reviews.slice(-3).reverse().map(r => `• <@${r.from_id}>: *"${r.comment}"* (<t:${Math.floor(new Date(r.timestamp).getTime()/1000)}:R>)`).join('\n') || '*No reviews yet.*';

                const repEmbed = new EmbedBuilder()
                    .setTitle(`⭐ Reputation Profile — ${targetUser.username}`)
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: '🏆 Total Rep Score', value: `\`+${repData.points} Rep\``, inline: true },
                        { name: '📝 Recent Reviews', value: latestReviews, inline: false }
                    )
                    .setColor(config.colors.secondary)
                    .setTimestamp();

                return interaction.reply({ embeds: [repEmbed] });
            }
        }
    }
];
