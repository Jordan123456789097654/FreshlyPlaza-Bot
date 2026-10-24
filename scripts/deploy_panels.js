require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
    console.log(`[Deploy] Logged in as ${client.user.tag}`);

    // 1. Post to #support-center (ModMail interactive panel)
    const supportChan = await client.channels.fetch(config.channels.supportCenter).catch(() => null);
    if (supportChan) {
        console.log('[Deploy] Deploying ModMail panel to #support-center...');
        const embed = new EmbedBuilder()
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
            .setImage('https://dummyimage.com/800x200/1e293b/ffffff&text=Grandway+Shopping+Support+Desk')
            .setFooter({ text: `${config.storeName} ModMail Services • Click a button below to open a ticket` });

        const row = new ActionRowBuilder().addComponents(
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

        await supportChan.send({ embeds: [embed], components: [row] });
        console.log('[Deploy] Support panel sent!');
    }

    // 2. Post to #verification
    const verifyChan = await client.channels.fetch(config.channels.verification).catch(() => null);
    if (verifyChan) {
        console.log('[Deploy] Deploying Verification instructions to #verification...');
        const verifyEmbed = new EmbedBuilder()
            .setTitle(`✅ Grandway Shopping Account Verification`)
            .setDescription(
                'Welcome to **Grandway Shopping**!\n\n' +
                'To unlock full access to customer chat, voice channels, and store shifts, please link your Roblox profile.\n\n' +
                '**How to Verify:**\n' +
                '1️⃣ Use the command </verify:1> (or type `/verify`)\n' +
                '2️⃣ Follow the instructions or enter your Roblox username.\n' +
                '3️⃣ Once verified, you will automatically receive the **Verified Member** role and full store privileges!\n\n' +
                'Need assistance? Visit <#' + config.channels.supportCenter + '> to open a ModMail ticket.'
            )
            .setColor(config.colors.secondary)
            .setFooter({ text: `${config.storeName} Verification Portal` });

        await verifyChan.send({ embeds: [verifyEmbed] });
        console.log('[Deploy] Verification embed sent!');
    }

    // 3. Post to #information-rules
    const infoChan = await client.channels.fetch(config.channels.informationRules).catch(() => null);
    if (infoChan) {
        console.log('[Deploy] Deploying Information & Rules to #information-rules...');
        const rulesEmbed = new EmbedBuilder()
            .setTitle(`📌 Grandway Shopping Official Server & Store Rules`)
            .setDescription(
                'Welcome to the official community server for **Grandway Shopping** on Roblox!\n\n' +
                '### 📜 Community Guidelines\n' +
                '**1. Respect & Decorum**\n' +
                'Treat all customers and staff with respect. Hate speech, toxicity, harassment, and discrimination are strictly prohibited.\n\n' +
                '**2. Safe Environment**\n' +
                'Keep all discussions PG-13. NSFW, vulgarities, or inappropriate media will result in immediate bans.\n\n' +
                '**3. No Spam or Self-Promotion**\n' +
                'Do not spam messages, emojis, or unapproved links/invites. Discord DM advertising is instantly blacklisted.\n\n' +
                '**4. Follow Staff Instructions**\n' +
                'Grandway Shopping staff members are here to help and protect the store. Comply with instructions from Management (MR) and High Ranks (HR).\n\n' +
                '### 🛍️ Store Links\n' +
                '• **Roblox Group**: [Grandway Shopping Group](https://www.roblox.com/groups/505768378)\n' +
                '• **Supermarket Game**: [Play Grandway Shopping](https://www.roblox.com/games/76637220767393/FreshlyPlazza-V2)\n' +
                '• **Support & ModMail**: <#' + config.channels.supportCenter + '>\n'
            )
            .setColor(config.colors.primary)
            .setFooter({ text: `${config.storeName} • Customer First Service` });

        await infoChan.send({ embeds: [rulesEmbed] });
        console.log('[Deploy] Rules embed sent!');
    }

    // 4. Post to #welcome
    const welcomeChan = await client.channels.fetch(config.channels.welcome).catch(() => null);
    if (welcomeChan) {
        console.log('[Deploy] Deploying Welcome embed to #welcome...');
        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`👋 Welcome to Grandway Shopping!`)
            .setDescription(
                'We are thrilled to have you here at **Grandway Shopping** — the premier virtual supermarket experience on Roblox!\n\n' +
                '**Getting Started:**\n' +
                '• 📜 Read our rules in <#' + config.channels.informationRules + '>\n' +
                '• ✅ Verify your Roblox account in <#' + config.channels.verification + '>\n' +
                '• 💬 Hang out with customers in <#' + config.channels.generalChat + '>\n' +
                '• 🛒 Check shift schedules in <#' + config.channels.shifts + '>\n' +
                '• 🎫 Need support? Use ModMail in <#' + config.channels.supportCenter + '>\n\n' +
                'Enjoy your visit, and happy shopping!'
            )
            .setColor(config.colors.primary)
            .setFooter({ text: `${config.storeName} Welcoming Committee` });

        await welcomeChan.send({ embeds: [welcomeEmbed] });
        console.log('[Deploy] Welcome embed sent!');
    }

    console.log('[Deploy] All initial embeds and panels deployed successfully!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('Failed to log in:', err);
    process.exit(1);
});
