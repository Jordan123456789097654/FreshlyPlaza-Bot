const { EmbedBuilder } = require('discord.js');
const config = require('../config');

/**
 * Generates and posts the welcome embed for a newly joined member
 * @param {import('discord.js').GuildMember} member
 */
async function sendWelcomeCard(member) {
    if (!member || !member.guild) return;
    if (member.guild.id !== config.guildId) return;

    const welcomeChannelId = config.channels.welcome;
    if (!welcomeChannelId) return;

    const channel = member.guild.channels.cache.get(welcomeChannelId);
    if (!channel || !channel.isTextBased()) return;

    const memberCount = member.guild.memberCount;
    const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
    const userAvatar = member.user.displayAvatarURL({ extension: 'png', size: 256 });

    // Dynamic clean supermarket banner with customized text
    const cleanUsername = encodeURIComponent(member.user.username.slice(0, 15));
    const bannerUrl = `https://dummyimage.com/1000x260/1e293b/2ecc71&text=Welcome+to+Grandway+Shopping,+${cleanUsername}!`;

    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${member.user.tag} just entered the supermarket!`,
            iconURL: userAvatar
        })
        .setTitle('👋 Welcome to Grandway Shopping!')
        .setDescription(
            `Hey <@${member.id}>! We are delighted to welcome you to **Grandway Shopping** — the premier virtual supermarket experience on Roblox!\n\n` +
            `🛒 You are customer **#${memberCount}** to walk through our automatic sliding doors!\n\n` +
            `### 🏁 Quick Start Checklist:\n` +
            `• 🔐 **Verify Account:** Head to <#${config.channels.verification}> to link your Roblox account.\n` +
            `• 📌 **Store Rules:** Check out <#${config.channels.informationRules}> to stay safe and informed.\n` +
            `• 📢 **Announcements:** Check <#${config.channels.announcements}> for official store updates.\n` +
            `• 💬 **Customer Chat:** Introduce yourself in <#${config.channels.generalChat}>!\n` +
            `• 🛒 **Store Shifts:** Attend register shifts in <#${config.channels.shifts}>.\n\n` +
            `Have questions or need help? Visit our ModMail help desk in <#${config.channels.supportCenter}>!`
        )
        .addFields(
            { name: '👤 Member', value: `${member.user.username}`, inline: true },
            { name: '📅 Account Age', value: `${accountAgeDays} days old`, inline: true },
            { name: '🛍️ Member Count', value: `#${memberCount}`, inline: true }
        )
        .setThumbnail(userAvatar)
        .setImage(bannerUrl)
        .setColor(config.colors.primary)
        .setFooter({ text: 'Grandway Shopping Welcoming Committee • Happy Shopping!' })
        .setTimestamp();

    await channel.send({ content: `👋 Welcome <@${member.id}> to **Grandway Shopping**!`, embeds: [embed] }).catch(err => {
        console.warn('[WELCOME] Could not send welcome embed:', err.message);
    });
}

module.exports = { sendWelcomeCard };
