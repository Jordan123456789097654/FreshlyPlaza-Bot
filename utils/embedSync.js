const { Client, ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');

/**
 * Searches and edits previous bot embeds to update the Roblox game link
 * @param {Client} client
 * @param {string} newGameLink
 */
async function refreshAllEmbedsWithNewGameLink(client, newGameLink) {
    if (!client || !client.isReady()) return 0;
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return 0;

    let updatedCount = 0;
    const channelsToScan = [
        config.channels.informationRules,
        config.channels.verification,
        config.channels.supportCenter,
        config.channels.welcome
    ].filter(Boolean);

    for (const channelId of channelsToScan) {
        try {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) continue;

            const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
            if (!messages) continue;

            for (const msg of messages.values()) {
                if (msg.author.id !== client.user.id) continue;

                let needsUpdate = false;
                const newEmbeds = [];
                const newComponents = [];

                // 1. Check Embeds
                for (const emb of msg.embeds) {
                    let desc = emb.description || '';
                    if (desc.includes('roblox.com/games/')) {
                        desc = desc.replace(/https:\/\/www\.roblox\.com\/games\/\d+\/[A-Za-z0-9_-]+/g, newGameLink);
                        needsUpdate = true;
                    }

                    const newEmb = EmbedBuilder.from(emb).setDescription(desc);
                    newEmbeds.push(newEmb);
                }

                // 2. Check ActionRow Link Buttons
                for (const row of msg.components) {
                    const newRow = ActionRowBuilder.from(row);
                    for (const comp of newRow.components) {
                        if (comp.data && comp.data.url && comp.data.url.includes('roblox.com/games/')) {
                            comp.setURL(newGameLink);
                            needsUpdate = true;
                        }
                    }
                    newComponents.push(newRow);
                }

                if (needsUpdate) {
                    await msg.edit({
                        embeds: newEmbeds.length > 0 ? newEmbeds : undefined,
                        components: newComponents.length > 0 ? newComponents : undefined
                    }).catch(() => {});
                    updatedCount++;
                }
            }
        } catch (err) {
            console.warn(`[REFRESH EMBEDS] Error updating channel ${channelId}:`, err.message);
        }
    }

    return updatedCount;
}

module.exports = { refreshAllEmbedsWithNewGameLink };
