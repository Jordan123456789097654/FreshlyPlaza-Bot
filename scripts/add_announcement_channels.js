require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`[Announcement Channels] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    const channels = await guild.channels.fetch();
    const catWelcome = channels.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('WELCOME'));
    const catStaff = channels.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('STAFF'));
    const catMgmt = channels.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('MANAGEMENT'));
    const catOperations = channels.find(c => c && c.type === ChannelType.GuildCategory && c.name.includes('STORE OPERATIONS'));

    const created = {};

    // In WELCOME:
    // 1. #📢・community-updates
    if (!channels.some(c => c && c.name.includes('community-updates'))) {
        created.communityUpdates = await guild.channels.create({
            name: '📢・community-updates',
            type: ChannelType.GuildText,
            parent: catWelcome ? catWelcome.id : null,
            topic: 'Community announcements, milestones, and customer notices.'
        });
        console.log('Created #community-updates');
    }

    // 2. #📢・giveaways
    if (!channels.some(c => c && c.name.includes('giveaways'))) {
        created.giveaways = await guild.channels.create({
            name: '🎉・giveaways',
            type: ChannelType.GuildText,
            parent: catWelcome ? catWelcome.id : null,
            topic: 'Official store giveaways, Robux rewards, and competitions.'
        });
        console.log('Created #giveaways');
    }

    // In STORE OPERATIONS:
    // 3. #📢・store-specials
    if (!channels.some(c => c && c.name.includes('store-specials'))) {
        created.storeSpecials = await guild.channels.create({
            name: '🛍️・store-specials',
            type: ChannelType.GuildText,
            parent: catOperations ? catOperations.id : null,
            topic: 'Weekly in-game product discounts, department specials, and new stock.'
        });
        console.log('Created #store-specials');
    }

    // In STAFF HEADQUARTERS:
    // 4. #📢・staff-promotions
    if (!channels.some(c => c && c.name.includes('staff-promotions'))) {
        created.staffPromotions = await guild.channels.create({
            name: '🎖️・staff-promotions',
            type: ChannelType.GuildText,
            parent: catStaff ? catStaff.id : null,
            topic: 'Official promotions, colleague graduations, and staff awards.'
        });
        console.log('Created #staff-promotions');
    }

    // In MANAGEMENT HQ:
    // 5. #📢・management-bulletins
    if (!channels.some(c => c && c.name.includes('management-bulletins'))) {
        created.managementBulletins = await guild.channels.create({
            name: '📋・management-bulletins',
            type: ChannelType.GuildText,
            parent: catMgmt ? catMgmt.id : null,
            topic: 'Management briefings, supervisor shift directives, and leadership notices.'
        });
        console.log('Created #management-bulletins');
    }

    console.log('[Announcement Channels] Created announcement channels successfully!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
