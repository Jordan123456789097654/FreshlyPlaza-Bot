require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`[Split Categories] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    const channels = await guild.channels.fetch();

    // 1. Create or find "━━━ 📢 ANNOUNCEMENTS ━━━" category
    let catAnnouncements = channels.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('ANNOUNCEMENTS'));
    if (!catAnnouncements) {
        catAnnouncements = await guild.channels.create({
            name: '━━━ 📢 ANNOUNCEMENTS ━━━',
            type: ChannelType.GuildCategory,
            position: 1
        });
        console.log('Created Category: ━━━ 📢 ANNOUNCEMENTS ━━━');
    }

    // 2. Find channels that belong to Announcements category
    const announcementNames = [
        '📢・announcements',
        '📢・community-updates',
        '🎉・events',
        '🎉・giveaways'
    ];

    for (const ch of channels.values()) {
        if (!ch || ch.type === ChannelType.GuildCategory) continue;
        if (announcementNames.includes(ch.name)) {
            await ch.setParent(catAnnouncements.id, { lockPermissions: false });
            console.log(`Moved ${ch.name} to ━━━ 📢 ANNOUNCEMENTS ━━━`);
        }
    }

    // 3. Ensure Welcome category only holds welcome & onboarding info
    let catWelcome = channels.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('WELCOME'));
    if (catWelcome) {
        await catWelcome.setName('━━━ 🟢 WELCOME & VERIFY ━━━').catch(() => {});
    }

    // 4. Re-run complete order
    const orderedCategories = [
        '━━━ 🟢 WELCOME & VERIFY ━━━',
        '━━━ 📢 ANNOUNCEMENTS ━━━',
        '━━━ 🛒 STORE OPERATIONS ━━━',
        '━━━ 💬 COMMUNITY ━━━',
        '━━━ 💡 SUGGESTIONS & BUGS ━━━',
        '━━━ 🛡️ STAFF HEADQUARTERS ━━━',
        '━━━ 👔 MANAGEMENT HQ ━━━',
        '━━━ 📊 AUDIT & BOT LOGS ━━━',
        '━━━ 📬 MODMAIL THREADS ━━━'
    ];

    const updatedCategories = await guild.channels.fetch();
    const catPositions = [];
    for (let i = 0; i < orderedCategories.length; i++) {
        const name = orderedCategories[i];
        const cat = updatedCategories.find(c => c && c.type === ChannelType.GuildCategory && (c.name === name || c.name.includes(name.slice(4, 15))));
        if (cat) {
            catPositions.push({ channel: cat.id, position: i });
        }
    }

    if (catPositions.length > 0) {
        await guild.channels.setPositions(catPositions).catch(() => {});
        console.log('Categories re-ordered with Announcements separated!');
    }

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
