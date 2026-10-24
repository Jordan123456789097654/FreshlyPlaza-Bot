require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function purgeBotMessagesInChannel(channel) {
    if (!channel || !channel.isTextBased()) return;
    try {
        const fetched = await channel.messages.fetch({ limit: 50 });
        for (const m of fetched.values()) {
            if (m.author.id === client.user.id) {
                await m.delete().catch(() => {});
                await sleep(250);
            }
        }
    } catch (e) {
        console.warn(`Purge warning in ${channel.name}:`, e.message);
    }
}

client.once('ready', async () => {
    console.log(`[Deploy Info/FAQ/Shifts/RR] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    // ==========================================
    // 1. REDEPLOY #store-shifts (NO SET TIMES - AVAILABILITY BASED)
    // ==========================================
    const shiftsChan = await guild.channels.fetch(config.channels.shifts).catch(() => null);
    if (shiftsChan) {
        console.log('Purging and redeploying #store-shifts without fixed times...');
        await purgeBotMessagesInChannel(shiftsChan);

        const shiftsEmbed = new EmbedBuilder()
            .setTitle('🛒 Grandway Shopping Supermarket Shifts & Hosting Guide')
            .setDescription(
                'Welcome to the official **Store Shifts** hub for Grandway Shopping!\n\n' +
                'Our supermarket shifts are hosted dynamically by Store Supervisors, Managers (MR), and Corporate High Ranks (HR) based on staff availability throughout the day.\n\n' +
                'During active store shifts, customer checkouts and cash registers are fully staffed, bakery & deli counters are active, and store security patrols aisles.\n\n' +
                '### 📢 Shift Notifications\n' +
                'Shifts do not follow strict fixed schedules — instead, they are announced live whenever a manager opens registers! ' +
                'To make sure you never miss an opening, toggle the <@&' + config.roles.shiftPing + '> role in <#' + (config.channels.reactionRoles || shiftsChan.id) + '>.\n\n' +
                '### 👔 Colleague Attendance Guidelines:\n' +
                '• Arrive promptly upon shift announcement.\n' +
                '• Wear your official Grandway Shopping uniform.\n' +
                '• Claim an open checkout register and provide friendly, professional customer service!\n\n' +
                '*(Live shift hostings will be posted below by supervisors and managers using `/shift-post`)*'
            )
            .setColor(0x2ECC71)
            .setImage('https://dummyimage.com/950x260/27ae60/ffffff&text=Grandway+Supermarket+Shifts')
            .setFooter({ text: 'Grandway Shopping Store Operations • Always Fresh, Always Helpful' });

        const shiftsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Join Store Game')
                .setStyle(ButtonStyle.Link)
                .setURL(config.robloxGameLink),
            new ButtonBuilder()
                .setLabel('Roblox Group')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/groups/${config.robloxGroupId}`)
        );

        await shiftsChan.send({ embeds: [shiftsEmbed], components: [shiftsRow] });
    }

    // ==========================================
    // 2. REDEPLOY #information-rules (PURGE & FRESH POST)
    // ==========================================
    const rulesChan = await guild.channels.fetch(config.channels.informationRules).catch(() => null);
    if (rulesChan) {
        console.log('Purging and redeploying #information-rules...');
        await purgeBotMessagesInChannel(rulesChan);

        const introEmbed = new EmbedBuilder()
            .setTitle('🛒 Welcome to Grandway Shopping Supermarket')
            .setDescription(
                'Welcome to the official community and communications server for **Grandway Shopping** on Roblox!\n\n' +
                'Grandway Shopping is an immersive, high-standard virtual retail and supermarket environment. ' +
                'Whether you are here as a valued customer picking up fresh groceries, a store colleague operating checkouts, or an executive manager steering operations, ' +
                'we maintain a safe, welcoming, and high-quality environment for all players.\n\n' +
                'Please review our detailed rules, operational policies, and disciplinary system below.'
            )
            .setColor(config.colors.primary)
            .setImage('https://dummyimage.com/950x260/1abc9c/ffffff&text=Grandway+Shopping+%E2%80%A2+Official+Guidelines');

        const serverRulesEmbed = new EmbedBuilder()
            .setTitle('📜 Official Server Rules & Community Standards')
            .setDescription(
                '### 1️⃣ Mutual Decorum & Respect\n' +
                '• Treat all customers, trainees, and staff members with courtesy.\n' +
                '• Zero tolerance for hate speech, harassment, cyberbullying, doxxing, racism, sexism, or discrimination of any kind.\n' +
                '• Keep drama, aggressive debates, and personal disputes outside of server channels.\n\n' +
                '### 2️⃣ Age-Appropriate Content (PG-13)\n' +
                '• Grandway Shopping is accessible to all ages. NSFW, sexualized language, gore, vulgarities, or illicit substances references are strictly prohibited.\n' +
                '• Inappropriate usernames, profile pictures, or statuses will result in an immediate temporary kick until updated.\n\n' +
                '### 3️⃣ Anti-Spam & Advertising Policy\n' +
                '• Do not spam text walls, excessive emojis, zalgo text, copypastas, or rapid messages.\n' +
                '• Self-promotion, sending server links, social media promotion, or unsolicited Direct Message (DM) advertising to members is permanently blacklisted.\n\n' +
                '### 4️⃣ Channel Discipline\n' +
                '• Keep conversations relevant to channel topics (e.g., bot commands in <#' + config.channels.botCommands + '>, media in <#' + config.channels.media + '>).\n' +
                '• Do not abuse staff pings or ghost ping members. Ghost pings are automatically flagged and logged by Grandway Utils.\n\n' +
                '### 5️⃣ Discord & Roblox Terms of Service\n' +
                '• All members must adhere strictly to the Discord Terms of Service and Roblox Community Standards.'
            )
            .setColor(config.colors.secondary);

        const inGameRulesEmbed = new EmbedBuilder()
            .setTitle('🏬 In-Game Store Guidelines & Disciplinary System')
            .setDescription(
                '### 🛒 Store Customer Guidelines\n' +
                '• Do not intentionally disrupt store aisles, block register belts, or glitch shopping carts.\n' +
                '• Trolling staff, exploiting, or bypassing barriers will result in in-game server kicks and blacklist bans.\n\n' +
                '### 👔 Staff & Colleague Protocol\n' +
                '• **Grammar & Professionalism**: High standard of grammar and customer greeting is required while on duty.\n' +
                '• **Uniform**: Wear the official Grandway Shopping uniform or designated department attire while on shift.\n' +
                '• **Register Operations**: Always scan items diligently, bag groceries, and maintain a tidy register line.\n' +
                '• **Security Conduct**: Store Security and Loss Prevention specialists must act with restraint and follow proper detainment procedures.\n\n' +
                '### ⚖️ Disciplinary Ladder\n' +
                '• **Stage 1**: Verbal Warning from Store Supervisor / Moderator.\n' +
                '• **Stage 2**: Official Server Strike (logged via `/strike` in moderation records).\n' +
                '• **Stage 3**: Temporary Store Suspension or Mute.\n' +
                '• **Stage 4**: Permanent Termination / Supermarket Ban.'
            )
            .setColor(config.colors.warning);

        const linksEmbed = new EmbedBuilder()
            .setTitle('🔗 Official Resources & Support Services')
            .setDescription(
                '• **Roblox Group**: [Grandway Shopping Group (505768378)](https://www.roblox.com/groups/' + config.robloxGroupId + ')\n' +
                '• **Supermarket Game**: [Play Grandway Shopping](https://www.roblox.com/games/76637220767393/FreshlyPlazza-V2)\n' +
                '• **Account Verification**: <#' + config.channels.verification + '>\n' +
                '• **ModMail Help Desk**: <#' + config.channels.supportCenter + '>\n' +
                '• **Suggestions & Feedback**: <#' + config.channels.suggestions + '>\n' +
                '• **Bug Submissions**: <#' + config.channels.bugsReport + '>\n\n' +
                '*Need confidential assistance? Open a ModMail thread in <#' + config.channels.supportCenter + '> to chat with staff privately.*'
            )
            .setColor(config.colors.primary)
            .setFooter({ text: 'Grandway Shopping • The Premier Supermarket Experience on Roblox' })
            .setTimestamp();

        await rulesChan.send({ embeds: [introEmbed, serverRulesEmbed, inGameRulesEmbed, linksEmbed] });
    }

    // ==========================================
    // 3. DEPLOY #faq (FREQUENTLY ASKED QUESTIONS)
    // ==========================================
    const allGuildChannels = await guild.channels.fetch();
    const faqChan = allGuildChannels.find(c => c && c.name.includes('faq'));
    if (faqChan) {
        console.log('Purging and deploying #faq...');
        await purgeBotMessagesInChannel(faqChan);

        const faqEmbed = new EmbedBuilder()
            .setTitle('❓ Frequently Asked Questions (FAQ)')
            .setDescription(
                'Got a question about Grandway Shopping? Find instant answers below!\n\n' +
                '### ❓ How do I get a job at Grandway Shopping?\n' +
                'Join our Roblox group and take the Trainee quiz or attend an announced Trainee interview session in <#' + config.channels.trainingSessions + '>! Once you pass, you will receive the Trainee rank and can attend store training sessions.\n\n' +
                '### ❓ How do I verify my Roblox account?\n' +
                'Head over to <#' + config.channels.verification + '> and click the green **Verify Account** button! Enter your username, add the generated safe word code to your Roblox Bio, and click confirm.\n\n' +
                '### ❓ When are supermarket shifts hosted?\n' +
                'Shifts are hosted dynamically throughout the day based on Store Manager availability! Make sure to grab the <@&' + config.roles.shiftPing + '> role so you are notified as soon as a shift starts.\n\n' +
                '### ❓ How do I report a troll or exploiter?\n' +
                'Visit <#' + config.channels.supportCenter + '> and click **Player Report** to open a direct confidential ModMail ticket with our moderation team. Make sure to provide video or screenshot evidence.\n\n' +
                '### ❓ I got promoted in the Roblox group, how do I update my roles?\n' +
                'Simply type `/sync-rank` anywhere in the server and the bot will immediately update your Discord roles to match your new Roblox group rank!\n\n' +
                '### ❓ How do I appeal a punishment or ban?\n' +
                'Click **Appeals** in <#' + config.channels.supportCenter + '> or use `/appeal-submit` to submit your formal appeal to leadership.'
            )
            .setColor(config.colors.secondary)
            .setImage('https://dummyimage.com/950x260/3498db/ffffff&text=Grandway+Shopping+FAQ')
            .setFooter({ text: 'Still have questions? Open a ticket in #support-center!' });

        const faqRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Open Support Ticket')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${config.guildId}/${config.channels.supportCenter}`),
            new ButtonBuilder()
                .setLabel('Roblox Group')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/groups/${config.robloxGroupId}`)
        );

        await faqChan.send({ embeds: [faqEmbed], components: [faqRow] });
    }

    // ==========================================
    // 4. DEPLOY #reaction-roles (INTERACTIVE NOTIFICATION ROLES)
    // ==========================================
    const rrChan = allGuildChannels.find(c => c && c.name.includes('reaction-roles'));
    if (rrChan) {
        console.log('Purging and deploying #reaction-roles...');
        await purgeBotMessagesInChannel(rrChan);

        const rrEmbed = new EmbedBuilder()
            .setTitle('🎭 Grandway Shopping Notification Roles')
            .setDescription(
                'Customize your Discord notification preferences! Click the buttons below to toggle ping roles on or off at any time.\n\n' +
                '• 🛒 **Shift Ping** — Get notified when Store Managers open checkout registers.\n' +
                '• 🎓 **Training Ping** — Get notified when staff training and interview sessions are scheduled.\n' +
                '• 🎉 **Events Ping** — Get notified about store competitions, game nights, and special events.\n' +
                '• 📢 **Announcements Ping** — Stay updated on official store updates, dev patch notes, and news.\n' +
                '• ❓ **QOTD Ping** — Get notified when a new Question of the Day is posted.\n\n' +
                '*Click once to add the role, click again to remove it!*'
            )
            .setColor(0x9B59B6)
            .setImage('https://dummyimage.com/950x260/8e44ad/ffffff&text=Notification+Roles+%26+Pings')
            .setFooter({ text: 'Grandway Shopping Role Preferences • Instant Self-Assignment' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rr_toggle_shiftPing')
                .setLabel('Shift Ping')
                .setEmoji('🛒')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('rr_toggle_trainingPing')
                .setLabel('Training Ping')
                .setEmoji('🎓')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('rr_toggle_eventsPing')
                .setLabel('Events Ping')
                .setEmoji('🎉')
                .setStyle(ButtonStyle.Success)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rr_toggle_announcementsPing')
                .setLabel('Announcements Ping')
                .setEmoji('📢')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('rr_toggle_qotdPing')
                .setLabel('QOTD Ping')
                .setEmoji('❓')
                .setStyle(ButtonStyle.Secondary)
        );

        await rrChan.send({ embeds: [rrEmbed], components: [row1, row2] });
    }

    console.log('[Deploy] Finished updating info, faq, shifts, and reaction roles!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
