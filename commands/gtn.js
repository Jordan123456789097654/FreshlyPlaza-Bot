const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');
const { startGame, getActiveGame, endGame, processGuess, generateHint, requestHint, isStaffMember } = require('../handlers/gtnHandler');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('gtn-start')
            .setDescription('Start a new Guess The Number game in this channel')
            .addIntegerOption(opt =>
                opt.setName('max')
                    .setDescription('Maximum number to guess up to (Default: 100)')
                    .setRequired(false)
                    .setMinValue(2)
                    .setMaxValue(1000000)
            )
            .addIntegerOption(opt =>
                opt.setName('min')
                    .setDescription('Minimum number to guess from (Default: 1)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(999999)
            )
            .addStringOption(opt =>
                opt.setName('mode')
                    .setDescription('Reaction feedback mode (Default: Combo Direction + Hot & Cold)')
                    .setRequired(false)
                    .addChoices(
                        { name: '🔥 Combo: Higher/Lower + Hot & Cold (Recommended)', value: 'both' },
                        { name: '🌡️ Hot & Cold Reactions Only (🔥/♨️/❄️/🧊)', value: 'hot_cold' },
                        { name: '⬆️ Higher & Lower Reactions Only (⬆️/⬇️)', value: 'higher_lower' }
                    )
            )
            .addBooleanOption(opt =>
                opt.setName('hints')
                    .setDescription('Enable reaction hints? (Default: True)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('prize')
                    .setDescription('Prize or reward description for the winner (Optional)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const min = interaction.options.getInteger('min') || 1;
            const max = interaction.options.getInteger('max') || 100;
            const mode = interaction.options.getString('mode') || 'both';
            const hints = interaction.options.getBoolean('hints') !== false;
            const prize = interaction.options.getString('prize') || null;

            const res = startGame(interaction.channelId, interaction.guildId, interaction.user.id, min, max, hints, prize, mode);
            if (!res.success) {
                return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
            }

            const modeLabels = {
                both: 'Combo: Direction + Hot & Cold (⬆️/⬇️ + 🔥/♨️/❄️/🧊)',
                hot_cold: 'Hot & Cold Reactions (🔥 Boiling, ♨️ Warm, ❄️ Cold, 🧊 Freezing)',
                higher_lower: 'Direction Reactions (⬆️ Higher, ⬇️ Lower)'
            };

            const embed = new EmbedBuilder()
                .setTitle('🎲 Guess The Number — Game Started!')
                .setDescription(
                    `A secret number has been chosen between **${min}** and **${max}**!\n` +
                    `Can you be the first to guess it correctly?`
                )
                .addFields(
                    { name: '🔢 Number Range', value: `\`${min}\` ➔ \`${max}\``, inline: true },
                    { name: '🌡️ Reaction Mode', value: `\`${modeLabels[mode]}\``, inline: false },
                    { name: '💡 Hints & Clues', value: hints ? '`Enabled (Staff Approval for Clues)`' : '`Disabled ❌`', inline: true },
                    { name: '🏆 Winner Reward', value: prize ? `**${prize}**` : '`Leaderboard Win Score`', inline: true },
                    {
                        name: '🎮 How to Play',
                        value: 
                            `• **Type any number directly in this channel** (e.g. \`42\`)!\n` +
                            `• Watch emoji reactions on your message to see if you are hot or cold!\n` +
                            `• Need a clue? Click **[ 💡 Request Hint ]** below (staff approval required)!`
                    }
                )
                .setColor(config.colors.secondary)
                .setFooter({ text: `Hosted by ${interaction.user.username} • FreshlyPlaza Mini-Games` })
                .setTimestamp();

            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('gtn_req_hint')
                    .setLabel('Request Hint')
                    .setEmoji('💡')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('gtn_stats')
                    .setLabel('Round Stats')
                    .setEmoji('📊')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('gtn_end')
                    .setLabel('End Game')
                    .setEmoji('🛑')
                    .setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({ embeds: [embed], components: [actionRow] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('gtn-guess')
            .setDescription('Submit a guess for the active Guess The Number game')
            .addIntegerOption(opt =>
                opt.setName('number')
                    .setDescription('Your number guess')
                    .setRequired(true)
            ),
        async execute(interaction) {
            const guess = interaction.options.getInteger('number');
            const game = getActiveGame(interaction.channelId);

            if (!game) {
                return interaction.reply({
                    content: '❌ There is no active Guess The Number game in this channel! Start one with `/gtn-start`.',
                    ephemeral: true
                });
            }

            const result = await processGuess(interaction.channelId, interaction.user, guess);

            if (result.status === 'OUT_OF_BOUNDS') {
                return interaction.reply({
                    content: `⚠️ Your guess **${guess}** is outside the game range (\`${result.min}\` to \`${result.max}\`).`,
                    ephemeral: true
                });
            }

            if (result.status === 'WIN') {
                const mins = Math.floor(result.durationSeconds / 60);
                const secs = result.durationSeconds % 60;
                const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                const winEmbed = new EmbedBuilder()
                    .setTitle('🎉 WINNER! The Number Has Been Guessed!')
                    .setDescription(`Congratulations <@${interaction.user.id}>! You correctly cracked the secret number!`)
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .addFields(
                        { name: '👤 Champion', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: true },
                        { name: '🎯 Secret Number', value: `**${result.targetNumber}**`, inline: true },
                        { name: '📊 Total Guesses', value: `**${result.totalGuesses}** attempts`, inline: true },
                        { name: '🎯 Player Attempts', value: `**${result.userGuessesCount}** guesses`, inline: true },
                        { name: '⏱️ Time Taken', value: `**${timeStr}**`, inline: true },
                        { name: '🏆 Reward', value: `${result.game.prize || '1 Win added to `/gtn-leaderboard`'}`, inline: true }
                    )
                    .setColor(config.colors.primary)
                    .setFooter({ text: 'FreshlyPlaza Mini-Games • Run /gtn-start to play again!' })
                    .setTimestamp();

                return interaction.reply({ content: `🎊 <@${interaction.user.id}> guessed correctly!`, embeds: [winEmbed] });
            }

            if (!result.hintsEnabled) {
                return interaction.reply({
                    content: `❌ **${guess} is incorrect!** (Hints are disabled for this game)`,
                    ephemeral: false
                });
            }

            const tempTag = `${result.proximity.emoji} **${result.proximity.label}**`;
            if (result.status === 'TOO_HIGH') {
                const directionText = result.mode === 'hot_cold'
                    ? tempTag
                    : `📉 **${guess} is Too High!** (${tempTag})`;
                return interaction.reply({ content: directionText, ephemeral: false });
            }

            if (result.status === 'TOO_LOW') {
                const directionText = result.mode === 'hot_cold'
                    ? tempTag
                    : `📈 **${guess} is Too Low!** (${tempTag})`;
                return interaction.reply({ content: directionText, ephemeral: false });
            }
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('gtn-end')
            .setDescription('End the active Guess The Number game in this channel'),
        async execute(interaction) {
            const game = getActiveGame(interaction.channelId);
            if (!game) {
                return interaction.reply({
                    content: '❌ There is no active Guess The Number game in this channel.',
                    ephemeral: true
                });
            }

            const isAuthorized = isStaffMember(interaction.member, game.hostId);
            if (!isAuthorized) {
                return interaction.reply({
                    content: '❌ Only the host of this game or a staff member can end it early.',
                    ephemeral: true
                });
            }

            const endedGame = endGame(interaction.channelId);

            const embed = new EmbedBuilder()
                .setTitle('🛑 Guess The Number Game Ended')
                .setDescription('The active game in this channel has been concluded early.')
                .addFields(
                    { name: '🎯 Secret Number Was', value: `**${endedGame.targetNumber}**`, inline: true },
                    { name: '📊 Total Guesses Made', value: `**${endedGame.guessesCount}** attempts`, inline: true },
                    { name: '🛑 Ended By', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setColor(config.colors.danger)
                .setFooter({ text: 'FreshlyPlaza Mini-Games' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('gtn-hint')
            .setDescription('Request a hint (players require staff approval; staff can reveal instantly)'),
        async execute(interaction) {
            const game = getActiveGame(interaction.channelId);
            if (!game) {
                return interaction.reply({
                    content: '❌ There is no active Guess The Number game in this channel.',
                    ephemeral: true
                });
            }

            if (!game.hints) {
                return interaction.reply({
                    content: '❌ Hints are disabled for this game session!',
                    ephemeral: true
                });
            }

            const isStaff = isStaffMember(interaction.member, game.hostId);

            // If a staff member or the host runs this, reveal hint immediately
            if (isStaff) {
                const hintText = generateHint(interaction.channelId);
                const embed = new EmbedBuilder()
                    .setTitle('💡 Guess The Number — Clue Revealed by Staff')
                    .setDescription(`> 🔍 **${hintText}**`)
                    .addFields(
                        { name: '🔢 Range', value: `\`${game.min}\` ➔ \`${game.max}\``, inline: true },
                        { name: '📊 Guesses So Far', value: `**${game.guessesCount}**`, inline: true },
                        { name: '🛡️ Revealed By', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setColor(config.colors.primary)
                    .setFooter({ text: `Hint #${game.hintsGiven}` })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // For regular players: trigger the staff approval workflow
            if (game.pendingHintRequest) {
                return interaction.reply({
                    content: '⏳ A hint request is already pending staff approval! Please wait for a staff member to review it.',
                    ephemeral: true
                });
            }

            requestHint(interaction.channelId, interaction.user.id);

            const hintApprovalRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('gtn_approve_hint')
                    .setLabel('Approve Hint')
                    .setEmoji('✅')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('gtn_deny_hint')
                    .setLabel('Deny Hint')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Danger)
            );

            const reviewEmbed = new EmbedBuilder()
                .setTitle('💡 Hint Requested — Awaiting Staff Approval')
                .setDescription(
                    `<@${interaction.user.id}> has requested a clue for the active Guess The Number game!\n\n` +
                    `🛡️ **Staff Approval Required:**\n` +
                    `A FreshlyPlaza Staff Member (MR/HR) or the Game Host (<@${game.hostId}>) must approve this request before the hint is posted.`
                )
                .addFields(
                    { name: '🔢 Game Range', value: `\`${game.min}\` ➔ \`${game.max}\``, inline: true },
                    { name: '📊 Guesses Attempted', value: `**${game.guessesCount}** attempts`, inline: true },
                    { name: '👤 Requester', value: `<@${interaction.user.id}>`, inline: true }
                )
                .setColor(config.colors.warning)
                .setFooter({ text: 'FreshlyPlaza Staff Moderation' })
                .setTimestamp();

            await interaction.channel.send({ embeds: [reviewEmbed], components: [hintApprovalRow] });
            return interaction.reply({ content: '✅ Your hint request has been submitted! A staff member must approve it before it is revealed.', ephemeral: true });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('gtn-leaderboard')
            .setDescription('View the Top Guess The Number Champions at FreshlyPlaza'),
        async execute(interaction) {
            const db = getDb();
            const topPlayers = await db.getGtnLeaderboard(10);

            const embed = new EmbedBuilder()
                .setTitle('🏆 FreshlyPlaza — Guess The Number Leaderboard')
                .setDescription('The master number-crackers of the FreshlyPlaza community!')
                .setColor(config.colors.primary)
                .setTimestamp();

            if (topPlayers.length === 0) {
                embed.addFields({
                    name: '📊 No Games Won Yet',
                    value: 'Be the first champion! Start a game with `/gtn-start`.'
                });
            } else {
                const list = topPlayers.map((p, idx) => {
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `**#${idx + 1}**`;
                    const bestText = p.best_guesses ? ` (Best: ${p.best_guesses} guesses)` : '';
                    return `${medal} <@${p.user_id}> — **${p.wins} ${p.wins === 1 ? 'Win' : 'Wins'}**${bestText} • ${p.total_guesses} total guesses`;
                }).join('\n');

                embed.addFields({ name: '🌟 Top 10 Champions', value: list });
            }

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('gtn-stats')
            .setDescription('View personal Guess The Number career statistics')
            .addUserOption(opt =>
                opt.setName('user')
                    .setDescription('User to view stats for (Defaults to yourself)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const target = interaction.options.getUser('user') || interaction.user;
            const db = getDb();
            const stats = await db.getGtnUserStats(target.id);

            const embed = new EmbedBuilder()
                .setTitle(`📊 GTN Career Profile — ${target.username}`)
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: '🏆 Total Games Won', value: `**${stats.wins || 0}** wins`, inline: true },
                    { name: '🎯 Total Guesses', value: `**${stats.total_guesses || 0}** attempts`, inline: true },
                    { name: '⚡ Best Game', value: stats.best_guesses ? `**${stats.best_guesses}** guesses` : '`N/A`', inline: true },
                    { name: '🕒 Last Victory', value: stats.last_win ? `<t:${Math.floor(new Date(stats.last_win).getTime() / 1000)}:R>` : '`None yet`', inline: true }
                )
                .setColor(stats.wins > 0 ? config.colors.primary : config.colors.neutral)
                .setFooter({ text: 'FreshlyPlaza Mini-Games' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
];
