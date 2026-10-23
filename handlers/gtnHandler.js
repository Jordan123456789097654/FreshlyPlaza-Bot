const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

// In-memory active Guess The Number games, mapped by channelId
const activeGames = new Map();

/**
 * Calculate proximity / temperature to target number
 */
function getProximity(guess, target, min, max) {
    const diff = Math.abs(guess - target);
    const range = Math.max(1, max - min);

    const boilingThreshold = Math.max(3, Math.round(range * 0.03));
    const warmThreshold = Math.max(8, Math.round(range * 0.10));
    const coldThreshold = Math.max(22, Math.round(range * 0.25));

    if (diff <= boilingThreshold) {
        return { temp: 'BOILING', emoji: '🔥', label: 'Boiling Hot!' };
    } else if (diff <= warmThreshold) {
        return { temp: 'WARM', emoji: '♨️', label: 'Warm' };
    } else if (diff <= coldThreshold) {
        return { temp: 'COLD', emoji: '❄️', label: 'Cold' };
    } else {
        return { temp: 'FREEZING', emoji: '🧊', label: 'Freezing Cold' };
    }
}

/**
 * Start a new Guess The Number game in a channel
 */
function startGame(channelId, guildId, hostId, min = 1, max = 100, hints = true, prize = null, mode = 'both') {
    if (activeGames.has(channelId)) {
        return { success: false, error: 'A game is already active in this channel! Finish it or run `/gtn-end` first.' };
    }

    if (min >= max) {
        return { success: false, error: 'The minimum number must be strictly less than the maximum number!' };
    }

    const targetNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    const game = {
        channelId,
        guildId,
        hostId,
        targetNumber,
        min,
        max,
        hints,
        mode: mode || 'both', // 'hot_cold', 'higher_lower', or 'both'
        prize: prize || null,
        guessesCount: 0,
        startedAt: Date.now(),
        userGuesses: {},
        hintsGiven: 0,
        pendingHintRequest: null // { requestedBy, requestedAt }
    };

    activeGames.set(channelId, game);
    return { success: true, game };
}

/**
 * Get the active game for a channel
 */
function getActiveGame(channelId) {
    return activeGames.get(channelId) || null;
}

/**
 * End an active game manually
 */
function endGame(channelId) {
    if (!activeGames.has(channelId)) {
        return null;
    }
    const game = activeGames.get(channelId);
    activeGames.delete(channelId);
    return game;
}

/**
 * Process a guess (shared between chat message and /gtn-guess command)
 */
async function processGuess(channelId, user, guessNumber) {
    const game = activeGames.get(channelId);
    if (!game) return { status: 'NO_GAME' };

    if (guessNumber < game.min || guessNumber > game.max) {
        return { status: 'OUT_OF_BOUNDS', min: game.min, max: game.max };
    }

    game.guessesCount++;
    game.userGuesses[user.id] = (game.userGuesses[user.id] || 0) + 1;

    if (guessNumber === game.targetNumber) {
        const durationSeconds = Math.max(1, Math.floor((Date.now() - game.startedAt) / 1000));
        const totalGuesses = game.guessesCount;
        const userGuessesCount = game.userGuesses[user.id];

        // Save win in database
        const db = getDb();
        await db.recordGtnWin(user.id, game.targetNumber, totalGuesses, userGuessesCount, durationSeconds, game.prize);

        // Remove active game
        activeGames.delete(channelId);

        return {
            status: 'WIN',
            game,
            targetNumber: game.targetNumber,
            totalGuesses,
            userGuessesCount,
            durationSeconds
        };
    }

    const isTooLow = guessNumber < game.targetNumber;
    const proximity = getProximity(guessNumber, game.targetNumber, game.min, game.max);

    return {
        status: isTooLow ? 'TOO_LOW' : 'TOO_HIGH',
        directionEmoji: isTooLow ? '⬆️' : '⬇️',
        proximity,
        hintsEnabled: game.hints,
        mode: game.mode,
        guess: guessNumber,
        totalGuesses: game.guessesCount
    };
}

/**
 * Generate a smart hint for the active game
 */
function generateHint(channelId) {
    const game = activeGames.get(channelId);
    if (!game) return null;

    game.hintsGiven = (game.hintsGiven || 0) + 1;
    const target = game.targetNumber;
    const range = game.max - game.min;

    const hintPool = [
        `The secret number is **${target % 2 === 0 ? 'EVEN 🔢' : 'ODD 🔢'}**.`,
        `The secret number **${target % 5 === 0 ? 'IS' : 'is NOT'}** a multiple of 5.`,
        `The secret number ends with the digit **${target % 10}**.`,
        `The secret number is between **${Math.max(game.min, target - Math.max(5, Math.floor(range * 0.15)))}** and **${Math.min(game.max, target + Math.max(5, Math.floor(range * 0.15)))}**.`
    ];

    const hintIndex = (game.hintsGiven - 1) % hintPool.length;
    return hintPool[hintIndex];
}

/**
 * Hint request workflow methods
 */
function requestHint(channelId, userId) {
    const game = activeGames.get(channelId);
    if (!game) return { status: 'NO_GAME' };
    if (!game.hints) return { status: 'HINTS_DISABLED' };
    if (game.pendingHintRequest) return { status: 'ALREADY_PENDING', pending: game.pendingHintRequest };

    game.pendingHintRequest = {
        requestedBy: userId,
        requestedAt: Date.now()
    };
    return { status: 'SUBMITTED', game };
}

function approveHint(channelId, staffId) {
    const game = activeGames.get(channelId);
    if (!game) return { status: 'NO_GAME' };
    if (!game.pendingHintRequest) return { status: 'NOT_PENDING' };

    const requesterId = game.pendingHintRequest.requestedBy;
    game.pendingHintRequest = null;
    const hintText = generateHint(channelId);

    return {
        status: 'APPROVED',
        hintText,
        requesterId,
        staffId,
        game
    };
}

function denyHint(channelId, staffId) {
    const game = activeGames.get(channelId);
    if (!game) return { status: 'NO_GAME' };
    if (!game.pendingHintRequest) return { status: 'NOT_PENDING' };

    const requesterId = game.pendingHintRequest.requestedBy;
    game.pendingHintRequest = null;

    return {
        status: 'DENIED',
        requesterId,
        staffId,
        game
    };
}

/**
 * Check staff authorization
 */
function isStaffMember(member, hostId = null) {
    if (!member) return false;
    return member.roles.cache.has(config.roles.hr) ||
           member.roles.cache.has(config.roles.mr) ||
           member.roles.cache.has(config.roles.staff) ||
           member.permissions.has(PermissionFlagsBits.ManageMessages) ||
           member.permissions.has(PermissionFlagsBits.Administrator) ||
           (hostId && member.id === hostId) ||
           (config.ignoredUserIds || []).includes(member.id);
}

/**
 * Listener for plain chat messages (supports Hot & Cold and Direction reactions)
 */
async function handleGtnMessage(message) {
    if (message.author.bot || !message.guild) return;

    const game = activeGames.get(message.channel.id);
    if (!game) return;

    const content = message.content.trim();
    if (!/^\d+$/.test(content)) return;

    const guess = parseInt(content, 10);
    if (isNaN(guess) || guess < game.min || guess > game.max) return;

    const result = await processGuess(message.channel.id, message.author, guess);

    if (result.status === 'WIN') {
        try {
            await message.react('🎉');
            await message.react('🏆');
        } catch (e) {}

        const mins = Math.floor(result.durationSeconds / 60);
        const secs = result.durationSeconds % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        const winEmbed = new EmbedBuilder()
            .setTitle('🎉 WINNER! The Number Has Been Guessed!')
            .setDescription(
                `Congratulations to <@${message.author.id}> for cracking the Grandway Shopping secret number!`
            )
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: '👤 Champion', value: `<@${message.author.id}> (${message.author.username})`, inline: true },
                { name: '🎯 Secret Number', value: `**${result.targetNumber}**`, inline: true },
                { name: '📊 Total Guesses', value: `**${result.totalGuesses}** attempts`, inline: true },
                { name: '🎯 Winner Attempts', value: `**${result.userGuessesCount}** guesses`, inline: true },
                { name: '⏱️ Time Taken', value: `**${timeStr}**`, inline: true },
                { name: '🏆 Reward', value: `${result.game.prize || '1 Win added to `/gtn-leaderboard`'}`, inline: true }
            )
            .setColor(config.colors.primary)
            .setFooter({ text: 'Grandway Shopping Mini-Games • Run /gtn-start to play again!' })
            .setTimestamp();

        return message.channel.send({ content: `🎊 <@${message.author.id}> has won **Guess The Number**!`, embeds: [winEmbed] });
    }

    if (result.hintsEnabled) {
        try {
            if (result.mode === 'hot_cold') {
                // Hot & Cold Proximity Reactions: 🔥 (Boiling), ♨️ (Warm), ❄️ (Cold), 🧊 (Freezing)
                await message.react(result.proximity.emoji);
            } else if (result.mode === 'higher_lower') {
                // Directional Reactions: ⬆️ (Higher), ⬇️ (Lower)
                await message.react(result.directionEmoji);
            } else {
                // Combo Mode (Both direction AND proximity temperature!)
                await message.react(result.directionEmoji);
                await message.react(result.proximity.emoji);
            }
        } catch (e) {
            // Fallback text if emoji reactions cannot be placed
            const clue = result.mode === 'hot_cold'
                ? `${result.proximity.emoji} **${result.proximity.label}**`
                : `${result.directionEmoji} **${result.status === 'TOO_LOW' ? 'Higher!' : 'Lower!'}** (${result.proximity.emoji} ${result.proximity.label})`;
            await message.reply({ content: clue }).catch(() => {});
        }
    } else {
        try {
            await message.react('❌');
        } catch (e) {}
    }
}

/**
 * Handle button clicks for Guess The Number
 */
async function handleGtnButton(interaction) {
    const customId = interaction.customId;
    const channelId = interaction.channelId;
    const game = activeGames.get(channelId);

    // 1. REQUEST HINT BUTTON
    if (customId === 'gtn_req_hint') {
        if (!game) {
            return interaction.reply({ content: '❌ There is no active Guess The Number game in this channel.', ephemeral: true });
        }
        if (!game.hints) {
            return interaction.reply({ content: '❌ Hints are disabled for this game session.', ephemeral: true });
        }
        if (game.pendingHintRequest) {
            return interaction.reply({ content: '⏳ A hint request is already pending staff approval! Please wait for a staff member to review it.', ephemeral: true });
        }

        requestHint(channelId, interaction.user.id);

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
                `<@${interaction.user.id}> has requested a clue for the ongoing Guess The Number game!\n\n` +
                `🛡️ **Staff Review Required:**\n` +
                `A Grandway Shopping Staff Member (MR/HR) or the Game Host (<@${game.hostId}>) must approve this request before the hint is posted.`
            )
            .addFields(
                { name: '🔢 Game Range', value: `\`${game.min}\` ➔ \`${game.max}\``, inline: true },
                { name: '📊 Guesses Attempted', value: `**${game.guessesCount}** attempts`, inline: true },
                { name: '👤 Requester', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setColor(config.colors.warning)
            .setFooter({ text: 'Grandway Shopping Staff Moderation' })
            .setTimestamp();

        await interaction.channel.send({ embeds: [reviewEmbed], components: [hintApprovalRow] });
        return interaction.reply({ content: '✅ Your hint request has been submitted for staff review!', ephemeral: true });
    }

    // 2. APPROVE HINT BUTTON (Staff Only)
    if (customId === 'gtn_approve_hint') {
        if (!game) {
            return interaction.update({ content: '❌ This game session has already ended.', embeds: [], components: [] });
        }

        const isAuth = isStaffMember(interaction.member, game.hostId);
        if (!isAuth) {
            return interaction.reply({ content: '❌ Only Grandway Shopping Staff (MR/HR) or the Game Host can approve hint requests.', ephemeral: true });
        }

        const approval = approveHint(channelId, interaction.user.id);
        if (approval.status !== 'APPROVED') {
            return interaction.reply({ content: '⚠️ No hint request is currently pending.', ephemeral: true });
        }

        const approvedEmbed = new EmbedBuilder()
            .setTitle('💡 Hint Approved by Staff!')
            .setDescription(
                `A hint requested by <@${approval.requesterId}> was approved by <@${interaction.user.id}>!\n\n` +
                `> 🔍 **Clue:** ${approval.hintText}`
            )
            .addFields(
                { name: '🔢 Game Range', value: `\`${game.min}\` ➔ \`${game.max}\``, inline: true },
                { name: '📊 Guesses So Far', value: `**${game.guessesCount}** attempts`, inline: true }
            )
            .setColor(config.colors.primary)
            .setFooter({ text: `Grandway Shopping Clue #${game.hintsGiven}` })
            .setTimestamp();

        return interaction.update({ embeds: [approvedEmbed], components: [] });
    }

    // 3. DENY HINT BUTTON (Staff Only)
    if (customId === 'gtn_deny_hint') {
        if (!game) {
            return interaction.update({ content: '❌ This game session has already ended.', embeds: [], components: [] });
        }

        const isAuth = isStaffMember(interaction.member, game.hostId);
        if (!isAuth) {
            return interaction.reply({ content: '❌ Only Grandway Shopping Staff (MR/HR) or the Game Host can deny hint requests.', ephemeral: true });
        }

        const denial = denyHint(channelId, interaction.user.id);
        if (denial.status !== 'DENIED') {
            return interaction.reply({ content: '⚠️ No hint request is currently pending.', ephemeral: true });
        }

        const deniedEmbed = new EmbedBuilder()
            .setTitle('❌ Hint Request Denied')
            .setDescription(
                `Staff member <@${interaction.user.id}> has denied the hint request from <@${denial.requesterId}>.\n` +
                `Keep guessing the number!`
            )
            .setColor(config.colors.danger)
            .setTimestamp();

        return interaction.update({ embeds: [deniedEmbed], components: [] });
    }

    // 4. ROUND STATS BUTTON
    if (customId === 'gtn_stats') {
        if (!game) {
            return interaction.reply({ content: '❌ There is no active game in this channel.', ephemeral: true });
        }

        const userGuesses = game.userGuesses[interaction.user.id] || 0;
        const modeLabel = game.mode === 'hot_cold' ? 'Hot & Cold (🔥/♨️/❄️/🧊)' :
                          game.mode === 'higher_lower' ? 'Higher/Lower (⬆️/⬇️)' :
                          'Combo (Direction + Hot/Cold)';

        const embed = new EmbedBuilder()
            .setTitle('📊 Active Round Statistics')
            .addFields(
                { name: '🔢 Range', value: `\`${game.min}\` ➔ \`${game.max}\``, inline: true },
                { name: '🌡️ Reaction Mode', value: modeLabel, inline: true },
                { name: '📊 Total Guesses (All Players)', value: `**${game.guessesCount}** attempts`, inline: true },
                { name: '🎯 Your Attempts', value: `**${userGuesses}** guesses`, inline: true },
                { name: '💡 Hints Given', value: `**${game.hintsGiven}** clues`, inline: true },
                { name: '🏆 Reward', value: game.prize || 'Leaderboard Win', inline: true }
            )
            .setColor(config.colors.secondary)
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 5. END GAME BUTTON (Staff Only)
    if (customId === 'gtn_end') {
        if (!game) {
            return interaction.reply({ content: '❌ There is no active game in this channel.', ephemeral: true });
        }

        const isAuth = isStaffMember(interaction.member, game.hostId);
        if (!isAuth) {
            return interaction.reply({ content: '❌ Only the game host or a staff member can end the game early.', ephemeral: true });
        }

        const endedGame = endGame(channelId);

        const embed = new EmbedBuilder()
            .setTitle('🛑 Guess The Number Game Ended')
            .setDescription(`The game was ended early by <@${interaction.user.id}>.`)
            .addFields(
                { name: '🎯 Secret Number Was', value: `**${endedGame.targetNumber}**`, inline: true },
                { name: '📊 Total Guesses Made', value: `**${endedGame.guessesCount}** attempts`, inline: true }
            )
            .setColor(config.colors.danger)
            .setFooter({ text: 'Grandway Shopping Mini-Games' })
            .setTimestamp();

        await interaction.channel.send({ embeds: [embed] });
        return interaction.reply({ content: '✅ Game ended.', ephemeral: true });
    }
}

module.exports = {
    startGame,
    getActiveGame,
    endGame,
    processGuess,
    generateHint,
    requestHint,
    approveHint,
    denyHint,
    handleGtnMessage,
    handleGtnButton,
    isStaffMember
};
