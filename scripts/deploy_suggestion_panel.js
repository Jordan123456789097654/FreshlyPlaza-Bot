require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

client.once('ready', async () => {
    console.log(`[Deploy Suggestion Panel] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    const sugChan = await guild.channels.fetch(config.channels.suggestions).catch(() => null);
    if (sugChan) {
        console.log('Purging previous bot messages in #suggestions...');
        try {
            const fetched = await sugChan.messages.fetch({ limit: 50 });
            for (const m of fetched.values()) {
                if (m.author.id === client.user.id && !m.pinned) {
                    await m.delete().catch(() => {});
                    await sleep(250);
                }
            }
        } catch (e) {}

        const panelEmbed = new EmbedBuilder()
            .setTitle('💡 Grandway Shopping Community Suggestions Center')
            .setDescription(
                'Have a fantastic idea for Grandway Shopping?\n\n' +
                'Whether it is a new grocery department, Greggs bakery items, store vehicles, cashier uniforms, or bot features, ' +
                'our management and development teams review every idea submitted by our community!\n\n' +
                '### 🗳️ How Suggestions Work:\n' +
                '1️⃣ Click the **Submit Suggestion** button below (or type `/suggest`).\n' +
                '2️⃣ Give your idea a clear title and detailed description.\n' +
                '3️⃣ Community members vote using the **👍 Upvote** and **👎 Downvote** buttons with live visual progress bars.\n' +
                '4️⃣ Store Management reviews ideas with one-click decision buttons (**Accept**, **In Progress**, **Implemented**, or **Deny**).\n' +
                '5️⃣ You receive automated private DM updates whenever your suggestion status changes!\n\n' +
                '*Every suggestion automatically receives its own discussion thread for community feedback.*'
            )
            .setColor(0x3498DB)
            .setImage('https://dummyimage.com/950x260/2980b9/ffffff&text=Grandway+Shopping+Suggestions+Desk')
            .setFooter({ text: 'Grandway Shopping Community Ideas • Driven by Players' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_open_suggestion_modal')
                .setLabel('Submit Suggestion')
                .setEmoji('💡')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setLabel('Roblox Group')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/groups/${config.robloxGroupId}`),
            new ButtonBuilder()
                .setLabel('Play Supermarket')
                .setStyle(ButtonStyle.Link)
                .setURL(config.robloxGameLink)
        );

        await sugChan.send({ embeds: [panelEmbed], components: [row] });
        console.log('[Deploy Suggestion Panel] Suggestion interactive panel deployed to #suggestions!');
    }

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
