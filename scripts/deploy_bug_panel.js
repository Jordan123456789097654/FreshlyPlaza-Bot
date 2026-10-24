require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

client.once('ready', async () => {
    console.log(`[Deploy Bug Panel] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    const bugsChan = await guild.channels.fetch(config.channels.bugsReport).catch(() => null);
    if (bugsChan) {
        console.log('Purging previous bot messages in #bug-reports...');
        try {
            const fetched = await bugsChan.messages.fetch({ limit: 50 });
            for (const m of fetched.values()) {
                if (m.author.id === client.user.id && !m.pinned) {
                    await m.delete().catch(() => {});
                    await sleep(250);
                }
            }
        } catch (e) {}

        const panelEmbed = new EmbedBuilder()
            .setTitle('🐛 Grandway Shopping Bug Tracking & QA Desk')
            .setDescription(
                'Found a glitch, physics bug, register error, or bakery issue in Grandway Shopping?\n\n' +
                'Help our developer team squash bugs quickly by submitting a detailed report below!\n\n' +
                '### 📋 What to Include in Your Report:\n' +
                '• **Clear Summary**: State exactly what broke (e.g. *Scanner freeze on item swipe*)\n' +
                '• **Steps to Reproduce**: How can our developers recreate the issue?\n' +
                '• **Evidence**: Screenshots or Medal/YouTube clip links\n\n' +
                '### 🛠️ What Happens Next?\n' +
                '• An automatic discussion thread is created for extra repro steps\n' +
                '• Developers review, investigate, and mark it as a Known Issue\n' +
                '• You receive automated direct message (DM) notifications when your bug is resolved!\n\n' +
                '*Click the button below to open the submission form, or run `/bug`.*'
            )
            .setColor(0xE74C3C)
            .setImage('https://dummyimage.com/950x260/c0392b/ffffff&text=Grandway+Shopping+Bug+Reporting')
            .setFooter({ text: 'Grandway Shopping QA & Engineering Desk • Quality First' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_open_bug_modal')
                .setLabel('Submit Bug Report')
                .setEmoji('🐛')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setLabel('Known Bugs Channel')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${config.guildId}/${config.channels.knownBugs}`),
            new ButtonBuilder()
                .setLabel('Play Supermarket')
                .setStyle(ButtonStyle.Link)
                .setURL(config.robloxGameLink)
        );

        await bugsChan.send({ embeds: [panelEmbed], components: [row] });
        console.log('[Deploy Bug Panel] Bug report interactive panel deployed to #bug-reports!');
    }

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
