require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
    console.log(`[Post Announcement] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    const announceChan = await guild.channels.fetch(config.channels.announcements).catch(() => null);
    if (!announceChan) {
        console.error('Could not find announcements channel!');
        process.exit(1);
    }

    const embed = new EmbedBuilder()
        .setTitle('🔐 Mandatory Account Verification — Grandway Shopping')
        .setDescription(
            'Hello @everyone & <@&' + config.roles.announcementsPing + '>!\n\n' +
            'As part of our server overhaul and security upgrade, **all community members and staff must link and verify their Roblox account** to access customer channels, shifts, and staff perks!\n\n' +
            '### ⚡ How to Verify (Takes 30 Seconds):\n' +
            '1️⃣ Head over to <#' + config.channels.verification + '>.\n' +
            '2️⃣ Click the green **`Verify Account`** button.\n' +
            '3️⃣ Enter your exact Roblox username.\n' +
            '4️⃣ Copy the **100% Roblox-safe phrase** (e.g. `grandway apple bread 482`) and paste it into your **About / Bio** section on Roblox.\n' +
            '5️⃣ Click **Confirm Verification** to finish!\n\n' +
            '### 🎁 What You Unlock:\n' +
            '• **Verified Member** role & full access to customer chat and voice lounges\n' +
            '• **Automatic Group Rank Sync**: Automatically receives your exact **Grandway Shopping Group Rank** in Discord!\n' +
            '• Eligibility to attend in-game store shifts, apply for staff positions, and submit community suggestions.\n\n' +
            '👉 **Get verified right now in <#' + config.channels.verification + '>!**\n' +
            '*(Already verified and ranked up in group? Run `/sync-rank` anytime!)*'
        )
        .setColor(config.colors.primary)
        .setImage('https://dummyimage.com/950x260/2ecc71/ffffff&text=Mandatory+Account+Verification+Center')
        .setFooter({ text: 'Grandway Shopping Leadership • Server Security Protocol' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Go to Verification Channel')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${config.guildId}/${config.channels.verification}`),
        new ButtonBuilder()
            .setLabel('Roblox Group')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.roblox.com/groups/${config.robloxGroupId}`)
    );

    await announceChan.send({
        content: `📢 <@&${config.roles.announcementsPing}> @everyone — **Please Verify Your Roblox Account!**`,
        embeds: [embed],
        components: [row]
    });

    console.log('[Post Announcement] Verification announcement posted successfully!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
