require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.once('ready', async () => {
    console.log(`[Remake] Logged in as ${client.user.tag}`);
    const guildId = config.guildId;
    const guild = await client.guilds.fetch(guildId).catch(err => {
        console.error('Failed to fetch guild:', err);
        process.exit(1);
    });

    console.log(`[Remake] Target Guild: ${guild.name} (${guild.id})`);

    // 1. Fetch all existing channels
    const channels = await guild.channels.fetch();
    console.log(`[Remake] Found ${channels.size} existing channels.`);

    // Delete non-category channels first, then categories
    const nonCategories = [...channels.values()].filter(c => c && c.type !== ChannelType.GuildCategory);
    const categories = [...channels.values()].filter(c => c && c.type === ChannelType.GuildCategory);

    console.log(`[Remake] Deleting ${nonCategories.length} regular channels...`);
    for (const channel of nonCategories) {
        try {
            await channel.delete('Server Remake Overhaul');
            console.log(`Deleted: ${channel.name}`);
            await sleep(350);
        } catch (err) {
            console.warn(`Could not delete ${channel.name}: ${err.message}`);
        }
    }

    console.log(`[Remake] Deleting ${categories.length} categories...`);
    for (const cat of categories) {
        try {
            await cat.delete('Server Remake Overhaul');
            console.log(`Deleted Category: ${cat.name}`);
            await sleep(350);
        } catch (err) {
            console.warn(`Could not delete category ${cat.name}: ${err.message}`);
        }
    }

    console.log('[Remake] Channel cleanup complete. Beginning clean server recreation...');

    const everyoneRole = guild.roles.everyone;
    const staffRole = guild.roles.cache.get(config.roles.staff);
    const mrRole = guild.roles.cache.get(config.roles.mr);
    const hrRole = guild.roles.cache.get(config.roles.hr);
    const verifiedRole = guild.roles.cache.get(config.roles.verified);

    const createdChannels = {};

    // Helper to create category
    async function createCat(name, permissionOverwrites = []) {
        console.log(`Creating Category: ${name}`);
        const cat = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
            permissionOverwrites
        });
        await sleep(350);
        return cat;
    }

    // Helper to create channel
    async function createChan(name, type, parent, permissionOverwrites = [], topic = '') {
        console.log(`  Creating Channel: ${name}`);
        const ch = await guild.channels.create({
            name,
            type,
            parent: parent ? parent.id : null,
            permissionOverwrites,
            topic: topic || undefined
        });
        await sleep(350);
        return ch;
    }

    // 1. WELCOME & INFORMATION CATEGORY
    const catWelcome = await createCat('━━━ 🟢 WELCOME & INFO ━━━', [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
        }
    ]);

    createdChannels.welcome = await createChan('👋・welcome', ChannelType.GuildText, catWelcome, [], 'Welcome to Grandway Shopping! Check here upon arrival.');
    createdChannels.verification = await createChan('✅・verification', ChannelType.GuildText, catWelcome, [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
        }
    ], 'Verify your Roblox account with /verify to unlock full store access.');
    createdChannels.informationRules = await createChan('📌・information-rules', ChannelType.GuildText, catWelcome, [], 'Official Grandway Shopping rules and store guidelines.');
    createdChannels.announcements = await createChan('📢・announcements', ChannelType.GuildAnnouncement || ChannelType.GuildText, catWelcome, [], 'Official store announcements and corporate updates.');
    createdChannels.events = await createChan('🎉・events', ChannelType.GuildText, catWelcome, [], 'Community events, competitions, and store celebrations.');

    // 2. STORE OPERATIONS CATEGORY
    const catOperations = await createCat('━━━ 🛒 STORE OPERATIONS ━━━', [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages]
        }
    ]);

    createdChannels.shifts = await createChan('🛒・store-shifts', ChannelType.GuildText, catOperations, [], 'Live in-game store shifts and register openings.');
    createdChannels.trainingSessions = await createChan('🎓・training-sessions', ChannelType.GuildText, catOperations, [], 'Staff and trainee training session announcements.');
    createdChannels.greggsTraining = await createChan('🥐・bakery-operations', ChannelType.GuildText, catOperations, [], 'Bakery department sessions and shifts.');
    createdChannels.supportCenter = await createChan('🎫・support-center', ChannelType.GuildText, catOperations, [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages]
        }
    ], 'Need help? Click the interactive ModMail support buttons below to contact staff.');

    // 3. COMMUNITY CATEGORY
    const catCommunity = await createCat('━━━ 💬 COMMUNITY ━━━', [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles]
        }
    ]);

    createdChannels.generalChat = await createChan('💬・general-chat', ChannelType.GuildText, catCommunity, [], 'Main community discussion for Grandway Shopping customers.');
    createdChannels.botCommands = await createChan('🤖・bot-commands', ChannelType.GuildText, catCommunity, [], 'Execute bot commands and minigames here.');
    createdChannels.media = await createChan('📷・media', ChannelType.GuildText, catCommunity, [], 'Share photos, memes, and Roblox screenshots.');
    createdChannels.guessTheNumber = await createChan('🔢・counting-gtn', ChannelType.GuildText, catCommunity, [], 'Guess the number and community minigames.');
    createdChannels.qotd = await createChan('❓・qotd', ChannelType.GuildText, catCommunity, [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages]
        }
    ], 'Question of the Day!');

    // 4. FEEDBACK & SUGGESTIONS CATEGORY
    const catFeedback = await createCat('━━━ 💡 SUGGESTIONS & BUGS ━━━', [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages],
            deny: [PermissionFlagsBits.MentionEveryone]
        }
    ]);

    createdChannels.suggestions = await createChan('💡・suggestions', ChannelType.GuildText, catFeedback, [], 'Submit ideas and feedback for the store via /suggest.');
    createdChannels.bugsReport = await createChan('🐛・bug-reports', ChannelType.GuildText, catFeedback, [], 'Report store glitches and game bugs using /bug.');
    createdChannels.knownBugs = await createChan('📌・known-bugs', ChannelType.GuildText, catFeedback, [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages]
        }
    ], 'Currently tracked bugs being resolved by developers.');

    // 5. STAFF HEADQUARTERS CATEGORY (Staff Only)
    const staffPerms = [
        {
            id: everyoneRole.id,
            deny: [PermissionFlagsBits.ViewChannel]
        }
    ];
    if (staffRole) {
        staffPerms.push({
            id: staffRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks]
        });
    }

    const catStaff = await createCat('━━━ 🛡️ STAFF HEADQUARTERS ━━━', staffPerms);

    createdChannels.staffAnnouncements = await createChan('🛡️・staff-announcements', ChannelType.GuildText, catStaff, [
        {
            id: everyoneRole.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        ...(staffRole ? [{
            id: staffRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages]
        }] : [])
    ], 'Important operational announcements for Grandway Shopping staff.');
    createdChannels.staffChat = await createChan('💬・staff-chat', ChannelType.GuildText, catStaff, [], 'General chatter and discussions for staff members.');
    createdChannels.loaAnnouncements = await createChan('🏝️・loa-requests', ChannelType.GuildText, catStaff, [], 'Official staff Leave of Absence requests and approvals.');
    createdChannels.manualPunishments = await createChan('📝・punishment-formats', ChannelType.GuildText, catStaff, [], 'Staff moderation guides and logging formats.');
    createdChannels.staffLoungeVoice = await createChan('🔊・Staff Lounge', ChannelType.GuildVoice, catStaff, []);

    // 6. MANAGEMENT HQ CATEGORY (MR & HR Only)
    const mgmtPerms = [
        {
            id: everyoneRole.id,
            deny: [PermissionFlagsBits.ViewChannel]
        }
    ];
    if (mrRole) {
        mgmtPerms.push({
            id: mrRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
        });
    }
    if (hrRole) {
        mgmtPerms.push({
            id: hrRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
        });
    }

    const catMgmt = await createCat('━━━ 👔 MANAGEMENT HQ ━━━', mgmtPerms);

    createdChannels.managementChat = await createChan('💼・management-chat', ChannelType.GuildText, catMgmt, [], 'Private coordination between MR and HR leadership.');
    createdChannels.dataEntries = await createChan('📋・data-entries', ChannelType.GuildText, catMgmt, [], 'Staff record entries, promotions, and activity tracking.');
    createdChannels.corporateAnnouncements = await createChan('📢・corporate-briefings', ChannelType.GuildText, catMgmt, [], 'Executive directives and policy updates.');

    // 7. AUDIT & BOT LOGS CATEGORY (HR and Admins Only)
    const logsPerms = [
        {
            id: everyoneRole.id,
            deny: [PermissionFlagsBits.ViewChannel]
        }
    ];
    if (hrRole) {
        logsPerms.push({
            id: hrRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages]
        });
    }

    const catLogs = await createCat('━━━ 📊 AUDIT & BOT LOGS ━━━', logsPerms);

    createdChannels.modLogs = await createChan('📜・mod-logs', ChannelType.GuildText, catLogs, [], 'Automated moderation actions and audit logs.');
    createdChannels.punishmentLogs = await createChan('⚠️・punishment-logs', ChannelType.GuildText, catLogs, [], 'Disciplinary actions, strikes, and bans.');
    createdChannels.shiftLogs = await createChan('🛒・shift-logs', ChannelType.GuildText, catLogs, [], 'Shift hostings, attendances, and logs.');
    createdChannels.trainingLogs = await createChan('🎓・training-logs', ChannelType.GuildText, catLogs, [], 'Training session completions and trainee records.');
    createdChannels.demoteLogs = await createChan('📉・demote-logs', ChannelType.GuildText, catLogs, [], 'Staff demotions and resignation records.');
    createdChannels.ticketLogs = await createChan('🎫・modmail-transcripts', ChannelType.GuildText, catLogs, [], 'ModMail ticket transcripts and archives.');
    createdChannels.devUpdates = await createChan('💻・dev-updates', ChannelType.GuildText, catLogs, [], 'Development commits, server updates, and patch notes.');
    createdChannels.honeypot = await createChan('⚠️・honeypot-trap', ChannelType.GuildText, catLogs, [
        {
            id: everyoneRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            deny: [PermissionFlagsBits.ReadMessageHistory]
        }
    ], 'Security honeypot trap channel.');

    // 8. MODMAIL THREADS CATEGORY
    const catTickets = await createCat('━━━ 📬 MODMAIL THREADS ━━━', [
        {
            id: everyoneRole.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        ...(staffRole ? [{
            id: staffRole.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
        }] : [])
    ]);

    createdChannels.ticketsCategory = catTickets;

    // Output JSON mapping of created channels
    const resultMapping = {};
    for (const [key, ch] of Object.entries(createdChannels)) {
        resultMapping[key] = ch.id;
    }

    fs.writeFileSync(path.join(__dirname, 'remade_channels.json'), JSON.stringify(resultMapping, null, 2));
    console.log('[Remake] Server overhaul completed successfully! Channels saved to remade_channels.json');

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('Failed to log in:', err);
    process.exit(1);
});
