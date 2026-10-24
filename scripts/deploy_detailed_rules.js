require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
    console.log(`[Deploy Rules] Logged in as ${client.user.tag}`);
    const chan = await client.channels.fetch(config.channels.informationRules).catch(() => null);

    if (chan) {
        // Clear previous messages
        try {
            const fetched = await chan.messages.fetch({ limit: 15 });
            for (const m of fetched.values()) {
                if (m.author.id === client.user.id) await m.delete().catch(() => {});
            }
        } catch (e) {}

        // Embed 1: Brand Banner & Introduction
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

        // Embed 2: Detailed Server Rules & Discord Conduct
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

        // Embed 3: Detailed In-Game Supermarket Protocol
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

        // Embed 4: Official Resources, Career Path & ModMail
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

        await chan.send({ embeds: [introEmbed, serverRulesEmbed, inGameRulesEmbed, linksEmbed] });
        console.log('[Deploy Rules] Detailed rules and information embeds deployed!');
    }

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
