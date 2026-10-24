require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`[Channels Builder] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    const categories = await guild.channels.fetch();
    const catWelcome = categories.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('WELCOME'));
    const catOperations = categories.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('STORE OPERATIONS'));
    const catCommunity = categories.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('COMMUNITY'));
    const catStaff = categories.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('STAFF'));

    const created = {};

    // 1. In WELCOME: FAQ channel
    if (catWelcome && !categories.some(c => c && c.name.includes('faq'))) {
        created.faq = await guild.channels.create({
            name: '❓・faq',
            type: ChannelType.GuildText,
            parent: catWelcome.id,
            topic: 'Frequently Asked Questions about Grandway Shopping on Roblox.'
        });
        console.log('Created #faq');
    }

    // 2. In STORE OPERATIONS: Register Guidelines
    if (catOperations && !categories.some(c => c && c.name.includes('register-guide'))) {
        created.registerGuide = await guild.channels.create({
            name: '🛒・register-guide',
            type: ChannelType.GuildText,
            parent: catOperations.id,
            topic: 'Supermarket checkout and register guidelines.'
        });
        console.log('Created #register-guide');
    }

    // 3. In COMMUNITY: Clips & Highlights & Voice Lounges
    if (catCommunity) {
        if (!categories.some(c => c && c.name.includes('clips-highlights'))) {
            created.clips = await guild.channels.create({
                name: '🎬・clips-highlights',
                type: ChannelType.GuildText,
                parent: catCommunity.id,
                topic: 'Share your best store clips, TikToks, and supermarket moments.'
            });
            console.log('Created #clips-highlights');
        }
        if (!categories.some(c => c && c.name.includes('Customer Lounge 1'))) {
            created.voice1 = await guild.channels.create({
                name: '🔊・Customer Lounge 1',
                type: ChannelType.GuildVoice,
                parent: catCommunity.id
            });
            console.log('Created Voice Lounge 1');
        }
        if (!categories.some(c => c && c.name.includes('Customer Lounge 2'))) {
            created.voice2 = await guild.channels.create({
                name: '🔊・Customer Lounge 2',
                type: ChannelType.GuildVoice,
                parent: catCommunity.id
            });
            console.log('Created Voice Lounge 2');
        }
    }

    // 4. In STAFF: Staff Guides
    if (catStaff && !categories.some(c => c && c.name.includes('staff-handbook'))) {
        created.handbook = await guild.channels.create({
            name: '📖・staff-handbook',
            type: ChannelType.GuildText,
            parent: catStaff.id,
            topic: 'Official Grandway Shopping Staff Handbook & Protocol.'
        });
        console.log('Created #staff-handbook');
    }

    console.log('[Channels Builder] Additional channels created!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
