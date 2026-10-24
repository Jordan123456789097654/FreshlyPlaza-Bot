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
    console.log(`[Redeploy Panels] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);

    // ==========================================
    // 1. REDEPLOY #welcome
    // ==========================================
    const welcomeChan = await guild.channels.fetch(config.channels.welcome).catch(() => null);
    if (welcomeChan) {
        console.log('Purging and redeploying #welcome...');
        await purgeBotMessagesInChannel(welcomeChan);

        const welcomeEmbed = new EmbedBuilder()
            .setTitle('👋 Welcome to Grandway Shopping Supermarket!')
            .setDescription(
                'Welcome to the official community server for **Grandway Shopping** on Roblox!\n\n' +
                'Step inside our doors and experience the ultimate virtual supermarket — ' +
                'fully functional registers, fresh bakery goods, store operations, security patrols, and career opportunities!\n\n' +
                '### 📌 Getting Started:\n' +
                '• 🔐 **Verify Account:** Head to <#' + config.channels.verification + '> and click **Verify Account** to link your Roblox profile.\n' +
                '• 📜 **Read Server Rules:** Review our store guidelines in <#' + config.channels.informationRules + '>.\n' +
                '• 💬 **Community Lounge:** Meet other shoppers in <#' + config.channels.generalChat + '>.\n' +
                '• 🛒 **Store Shifts:** Check <#' + config.channels.shifts + '> for daily register shifts!\n\n' +
                'Need confidential assistance? Open a ModMail thread in <#' + config.channels.supportCenter + '>!'
            )
            .setColor(config.colors.primary)
            .setImage('https://dummyimage.com/950x260/2ecc71/ffffff&text=Welcome+to+Grandway+Shopping')
            .setFooter({ text: 'Grandway Shopping • Excellence in Customer Service' });

        const welcomeRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Roblox Group')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://www.roblox.com/groups/${config.robloxGroupId}`),
            new ButtonBuilder()
                .setLabel('Play Grandway Shopping')
                .setStyle(ButtonStyle.Link)
                .setURL(config.robloxGameLink)
        );

        await welcomeChan.send({ embeds: [welcomeEmbed], components: [welcomeRow] });
    }

    // ==========================================
    // 2. REDEPLOY #verification
    // ==========================================
    const verifyChan = await guild.channels.fetch(config.channels.verification).catch(() => null);
    if (verifyChan) {
        console.log('Purging and redeploying #verification...');
        await purgeBotMessagesInChannel(verifyChan);

        const verifyEmbed = new EmbedBuilder()
            .setTitle('🔐 Grandway Shopping Account Verification')
            .setDescription(
                'Welcome to the **Grandway Shopping** Verification Center!\n\n' +
                'To unlock full access to customer chat channels, participate in supermarket shifts, and sync your Roblox group rank, you must verify ownership of your Roblox account.\n\n' +
                '### 📌 How To Verify:\n' +
                '1️⃣ Click the green **Verify Account** button below (or run `/verify`).\n' +
                '2️⃣ Enter your Roblox username in the pop-up modal.\n' +
                '3️⃣ The bot will generate a **100% Roblox-safe bio phrase** (e.g. `grandway apple bread 482`).\n' +
                '4️⃣ Paste that code into your **About / Bio** section on Roblox and click Save.\n' +
                '5️⃣ Click **Confirm Verification** to finish!\n\n' +
                '### 🎁 Perks of Verifying:\n' +
                '• Automatic **Verified Member** role & access to all text/voice channels\n' +
                '• Automatic synchronization of your exact **Roblox Group Staff & Management Rank**\n' +
                '• Ability to attend store shifts, apply for staff positions, and submit feedback\n\n' +
                '🔄 *Already verified and ranked up in group? Run `/sync-rank` anytime!*'
            )
            .setColor(config.colors.primary)
            .setImage('https://dummyimage.com/950x260/27ae60/ffffff&text=Roblox+Account+Verification+Center')
            .setFooter({ text: 'Grandway Shopping Security • Fast & Safe Bio Verification' });

        const verifyRow = new ActionRowBuilder().addComponents(
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

        await verifyChan.send({ embeds: [verifyEmbed], components: [verifyRow] });
    }

    // ==========================================
    // 3. REDEPLOY #information-rules
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
    // 4. REDEPLOY #support-center (ModMail Desk)
    // ==========================================
    const supportChan = await guild.channels.fetch(config.channels.supportCenter).catch(() => null);
    if (supportChan) {
        console.log('Purging and redeploying #support-center...');
        await purgeBotMessagesInChannel(supportChan);

        const supportEmbed = new EmbedBuilder()
            .setTitle(`🛒 ${config.storeName} Support & ModMail Center`)
            .setDescription(
                'Welcome to the official **Grandway Shopping** ModMail & Help Desk!\n\n' +
                'Select the button below that best describes your inquiry. ' +
                'Our dedicated support team will open a direct private message ticket with you.\n\n' +
                '**Support Categories:**\n' +
                '• 🎫 **General Support** — Questions regarding store guidelines, shifts, or store roles.\n' +
                '• 🚨 **Player Report** — Report store exploiters, rule breakers, or trolls (please attach proof).\n' +
                '• 👔 **Management Inquiry** — Issues regarding staff conduct, MR/HR matters, or partnerships.\n' +
                '• 🛠️ **Technical Issue** — In-game glitches, game-pass issues, or bot errors.\n' +
                '• ⚖️ **Appeals** — Server ban or store blacklists moderation appeals.\n\n' +
                '*Support conversations are conducted securely and anonymously through your Direct Messages.*'
            )
            .setColor(config.colors.primary)
            .setImage('https://dummyimage.com/950x260/1e293b/ffffff&text=Grandway+Shopping+Support+Desk')
            .setFooter({ text: `${config.storeName} ModMail Services • Click a button below to open a ticket` });

        const supportRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_general')
                .setLabel('General Support')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_report')
                .setLabel('Player Report')
                .setEmoji('🚨')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_management')
                .setLabel('Management')
                .setEmoji('👔')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('ticket_tech')
                .setLabel('Technical Issue')
                .setEmoji('🛠️')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('ticket_appeal')
                .setLabel('Appeals')
                .setEmoji('⚖️')
                .setStyle(ButtonStyle.Secondary)
        );

        await supportChan.send({ embeds: [supportEmbed], components: [supportRow] });
    }

    // ==========================================
    // 5. DEPLOY #store-shifts PERMANENT EMBED
    // ==========================================
    const shiftsChan = await guild.channels.fetch(config.channels.shifts).catch(() => null);
    if (shiftsChan) {
        console.log('Purging and deploying #store-shifts information banner...');
        await purgeBotMessagesInChannel(shiftsChan);

        const shiftsEmbed = new EmbedBuilder()
            .setTitle('🛒 Grandway Shopping Supermarket Shifts & Operational Schedule')
            .setDescription(
                'Welcome to the official **Store Shifts** hub for Grandway Shopping!\n\n' +
                'Our supermarket shifts are hosted daily by Store Managers (MR) and Corporate High Ranks (HR). ' +
                'During active shifts, registers and customer checkouts are fully manned, deli/bakery counters are open, and store security is actively patrolling.\n\n' +
                '### ⏰ Shift Operational Hours (Daily)\n' +
                '• **Morning Opening Shift**: `10:00 AM EST` (3:00 PM GMT)\n' +
                '• **Midday Rush Shift**: `2:00 PM EST` (7:00 PM GMT)\n' +
                '• **Evening Peak Shift**: `6:00 PM EST` (11:00 PM GMT)\n' +
                '• **Night Closing Shift**: `9:00 PM EST` (2:00 AM GMT)\n\n' +
                '### 🔔 Shift Notifications\n' +
                'Want to be alerted as soon as a manager opens registers? Make sure you have the <@&' + config.roles.shiftPing + '> role!\n\n' +
                '### 👔 Staff Colleague Attendance:\n' +
                '• Arrive 5 minutes prior to shift announcement.\n' +
                '• Wear the official store colleague uniform.\n' +
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

    console.log('[Redeploy Panels] All panels purged and cleanly deployed!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
