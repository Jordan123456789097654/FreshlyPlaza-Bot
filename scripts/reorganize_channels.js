require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Complete Master Channel Layout Hierarchy
const STRUCTURE = [
    {
        category: '━━━ 🟢 WELCOME & INFO ━━━',
        channels: [
            '👋・welcome',
            '✅・verification',
            '📌・information-rules',
            '❓・faq',
            '📢・announcements',
            '📢・community-updates',
            '🎉・events',
            '🎉・giveaways'
        ]
    },
    {
        category: '━━━ 🛒 STORE OPERATIONS ━━━',
        channels: [
            '🛒・store-shifts',
            '🎓・training-sessions',
            '🥐・bakery-operations',
            '🛒・register-guide',
            '🛍️・store-specials',
            '🎫・support-center'
        ]
    },
    {
        category: '━━━ 💬 COMMUNITY ━━━',
        channels: [
            '💬・general-chat',
            '🤖・bot-commands',
            '📷・media',
            '🎬・clips-highlights',
            '🔢・counting-gtn',
            '❓・qotd',
            '🔊・Customer Lounge 1',
            '🔊・Customer Lounge 2'
        ]
    },
    {
        category: '━━━ 💡 SUGGESTIONS & BUGS ━━━',
        channels: [
            '💡・suggestions',
            '🐛・bug-reports',
            '📌・known-bugs'
        ]
    },
    {
        category: '━━━ 🛡️ STAFF HEADQUARTERS ━━━',
        channels: [
            '🛡️・staff-announcements',
            '🎖️・staff-promotions',
            '💬・staff-chat',
            '📖・staff-handbook',
            '🏝️・loa-requests',
            '📝・punishment-formats',
            '🔊・Staff Lounge'
        ]
    },
    {
        category: '━━━ 👔 MANAGEMENT HQ ━━━',
        channels: [
            '💼・management-chat',
            '📋・management-bulletins',
            '📋・data-entries',
            '📢・corporate-briefings'
        ]
    },
    {
        category: '━━━ 📊 AUDIT & BOT LOGS ━━━',
        channels: [
            '📜・mod-logs',
            '⚠️・punishment-logs',
            '🛒・shift-logs',
            '🎓・training-logs',
            '📉・demote-logs',
            '🎫・modmail-transcripts',
            '💻・dev-updates',
            '⚠️・honeypot-trap'
        ]
    },
    {
        category: '━━━ 📬 MODMAIL THREADS ━━━',
        channels: []
    }
];

client.once('ready', async () => {
    console.log(`[Reorganize] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);
    const allChannels = await guild.channels.fetch();

    console.log(`Reorganizing ${allChannels.size} channels...`);

    // 1. Arrange Categories in order
    const categoriesInGuild = allChannels.filter(c => c && c.type === ChannelType.GuildCategory);
    const categoryPositions = [];

    for (let catIdx = 0; catIdx < STRUCTURE.length; catIdx++) {
        const item = STRUCTURE[catIdx];
        const foundCat = categoriesInGuild.find(c => c.name === item.category);
        if (foundCat) {
            categoryPositions.push({
                channel: foundCat.id,
                position: catIdx
            });
        }
    }

    if (categoryPositions.length > 0) {
        try {
            await guild.channels.setPositions(categoryPositions);
            console.log('Categories ordered successfully!');
            await sleep(500);
        } catch (e) {
            console.warn('Category positioning notice:', e.message);
        }
    }

    // 2. Set Channels into their exact categories and positions
    for (const group of STRUCTURE) {
        const cat = categoriesInGuild.find(c => c.name === group.category);
        if (!cat) continue;

        console.log(`Organizing category: ${group.category}...`);
        const channelPositions = [];

        for (let chIdx = 0; chIdx < group.channels.length; chIdx++) {
            const expectedName = group.channels[chIdx];
            const matchingChan = allChannels.find(c => c && c.type !== ChannelType.GuildCategory && c.name === expectedName);

            if (matchingChan) {
                // Ensure parent is correct
                if (matchingChan.parentId !== cat.id) {
                    await matchingChan.setParent(cat.id, { lockPermissions: false }).catch(err => console.warn(`Error setting parent for ${matchingChan.name}:`, err.message));
                    await sleep(250);
                }

                channelPositions.push({
                    channel: matchingChan.id,
                    position: chIdx
                });
            }
        }

        if (channelPositions.length > 0) {
            try {
                await guild.channels.setPositions(channelPositions);
                console.log(`  Set order for ${channelPositions.length} channels in ${group.category}`);
                await sleep(350);
            } catch (err) {
                console.warn(`  Position notice for ${group.category}:`, err.message);
            }
        }
    }

    console.log('[Reorganize] All channels and categories reorganized successfully!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
