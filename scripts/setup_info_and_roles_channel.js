require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`[Roles Channel] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    const channels = await guild.channels.fetch();

    // 1. Check or create "━━━ 📌 SERVER INFO ━━━" category for rules & faq
    let catInfo = channels.find(c => c && c.type === ChannelType.GuildCategory && (c.name.includes('SERVER INFO') || c.name.includes('INFORMATION')));
    if (!catInfo) {
        catInfo = await guild.channels.create({
            name: '━━━ 📌 SERVER INFO ━━━',
            type: ChannelType.GuildCategory,
            position: 1
        });
        console.log('Created Category: ━━━ 📌 SERVER INFO ━━━');
    }

    // Move rules and faq into SERVER INFO
    const rulesChan = channels.find(c => c && c.name.includes('information-rules'));
    const faqChan = channels.find(c => c && c.name.includes('faq'));

    if (rulesChan) {
        await rulesChan.setParent(catInfo.id, { lockPermissions: false });
        console.log('Moved rules into ━━━ 📌 SERVER INFO ━━━');
    }
    if (faqChan) {
        await faqChan.setParent(catInfo.id, { lockPermissions: false });
        console.log('Moved faq into ━━━ 📌 SERVER INFO ━━━');
    }

    // 2. Create #🎭・reaction-roles in Welcome or Server Info
    let rolesChan = channels.find(c => c && c.name.includes('reaction-roles'));
    if (!rolesChan) {
        rolesChan = await guild.channels.create({
            name: '🎭・reaction-roles',
            type: ChannelType.GuildText,
            parent: catInfo.id,
            topic: 'Pick and toggle your notification roles and store pings!'
        });
        console.log('Created #reaction-roles');
    }

    // Update config channels if needed
    const configPath = path.join(__dirname, '../config.js');
    let configContent = fs.readFileSync(configPath, 'utf8');
    if (!configContent.includes('reactionRoles:')) {
        configContent = configContent.replace(/channels:\s*\{/, `channels: {\n        "reactionRoles": "${rolesChan.id}",`);
        fs.writeFileSync(configPath, configContent, 'utf8');
        console.log('Updated config.channels with reactionRoles channel ID');
    }

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
