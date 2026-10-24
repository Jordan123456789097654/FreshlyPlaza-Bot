require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
    console.log(`[Deploy Verification Panel] Logged in as ${client.user.tag}`);
    const chan = await client.channels.fetch(config.channels.verification).catch(() => null);

    if (chan) {
        // Clear previous messages
        try {
            const fetched = await chan.messages.fetch({ limit: 10 });
            for (const m of fetched.values()) {
                if (m.author.id === client.user.id) await m.delete().catch(() => {});
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setTitle('🔐 Grandway Shopping Account Verification')
            .setDescription(
                'Welcome to **Grandway Shopping**!\n\n' +
                'To unlock full customer privileges, talk in community channels, participate in store shifts, and sync your Roblox group rank, you must link your Roblox profile.\n\n' +
                '### 📌 How It Works:\n' +
                '1️⃣ Click the green **Verify Account** button below (or type `/verify`).\n' +
                '2️⃣ Enter your Roblox username.\n' +
                '3️⃣ The bot will generate a **100% Roblox-safe** word phrase (e.g. `grandway apple bread 482`).\n' +
                '4️⃣ Paste that code into your **Roblox Profile About / Bio** section.\n' +
                '5️⃣ Click **Confirm Verification** to finish!\n\n' +
                '### 🎁 Perks of Verifying:\n' +
                '• Instant **Verified Member** role & access to all customer text & voice lounges\n' +
                '• Automatic synchronization of your exact **Roblox Group Staff / Management Rank**\n' +
                '• Ability to apply for Grandway Shopping careers, submit suggestions, and attend shifts\n\n' +
                '🔄 *Already verified and ranked up in group? Run `/sync-rank` anytime!*'
            )
            .setColor(config.colors.primary)
            .setImage('https://dummyimage.com/900x250/27ae60/ffffff&text=Roblox+Account+Verification+Center')
            .setFooter({ text: 'Grandway Shopping Security • Fast & Safe Bio Verification' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_start_verification')
                .setLabel('Verify Account')
                .setEmoji('🔐')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setLabel('Grandway Roblox Group')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/groups/${config.robloxGroupId}`),
            new ButtonBuilder()
                .setLabel('Play Grandway Shopping')
                .setStyle(ButtonStyle.Link)
                .setURL(config.robloxGameLink)
        );

        await chan.send({ embeds: [embed], components: [row] });
        console.log('[Deploy Verification Panel] Verification embed with button deployed!');
    }

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
