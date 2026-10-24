require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {
    console.log(`[Deploy Info] Logged in as ${client.user.tag}`);
    const chan = await client.channels.fetch(config.channels.informationRules).catch(() => null);

    if (chan) {
        // Clear previous test messages in this channel
        try {
            const fetched = await chan.messages.fetch({ limit: 10 });
            for (const m of fetched.values()) {
                if (m.author.id === client.user.id) await m.delete().catch(() => {});
            }
        } catch (e) {}

        // Embed 1: Header & Welcome
        const headerEmbed = new EmbedBuilder()
            .setTitle('🛒 Welcome to Grandway Shopping!')
            .setDescription(
                'Welcome to the official Discord community of **Grandway Shopping** on Roblox!\n\n' +
                'Grandway Shopping is a state-of-the-art virtual supermarket offering realistic register operations, bakery departments, inventory management, store security, and executive corporate careers.\n\n' +
                'Please take a few moments to review our rules and information below.'
            )
            .setColor(config.colors.primary)
            .setImage('https://dummyimage.com/900x250/2ecc71/ffffff&text=Grandway+Shopping+%E2%80%A2+Supermarket+Experience');

        // Embed 2: Community Rules & Conduct
        const rulesEmbed = new EmbedBuilder()
            .setTitle('📜 Grandway Shopping Server Rules & Code of Conduct')
            .setDescription(
                'By participating in Grandway Shopping Discord and in-game experiences, you agree to adhere strictly to all guidelines:\n\n' +
                '### 1️⃣ Respect & Professionalism\n' +
                '• Treat all customers, trainees, and staff members with courtesy and mutual respect.\n' +
                '• Harassment, hate speech, discrimination, toxicity, or excessive drama will result in immediate disciplinary action.\n\n' +
                '### 2️⃣ Safe & Family-Friendly Community\n' +
                '• Grandway Shopping is a PG-13 community. NSFW content, suggestive media, vulgar language, and drug references are strictly forbidden.\n\n' +
                '### 3️⃣ Spam & Unsolicited Advertising\n' +
                '• Do not spam text messages, excessive emojis, soundboards, or capslock.\n' +
                '• Direct Message (DM) advertising or unsolicited invites will result in an instant and permanent server ban.\n\n' +
                '### 4️⃣ Staff Authority & Chain of Command\n' +
                '• Always comply with directives from Store Supervisors, Managers (MR), High Ranks (HR), and Directors.\n' +
                '• Disrespecting staff, trolling registers, or bypassing disciplinary sanctions is zero-tolerance.\n\n' +
                '### 5️⃣ Discord & Roblox Terms of Service\n' +
                '• All members must comply fully with Discord Community Guidelines and Roblox Terms of Use.'
            )
            .setColor(config.colors.secondary);

        // Embed 3: Store Operations & Career Path
        const operationsEmbed = new EmbedBuilder()
            .setTitle('🏬 Store Departments & Careers')
            .setDescription(
                'Looking to begin or advance your career with Grandway Shopping?\n\n' +
                '• **Customer Operations**: Assist customers, handle registers, and maintain store aisles.\n' +
                '• **Greggs Bakery**: Prepare pastries, bake goods, and run the hot-food counters.\n' +
                '• **Loss Prevention & Security**: Monitor camera systems, patrol aisles, and prevent store disturbances.\n' +
                '• **Store Management (MR)**: Supervise shifts, host training sessions, and mentor colleagues.\n' +
                '• **Corporate Directorate (HR)**: Lead human resources, public relations, trust & safety, and game development.'
            )
            .addFields(
                { name: '🛒 Store Shifts', value: 'Check <#' + config.channels.shifts + '> for daily active shifts and register openings.', inline: true },
                { name: '🎓 Training Sessions', value: 'Announced in <#' + config.channels.trainingSessions + '> for trainees looking to graduate.', inline: true }
            )
            .setColor(config.colors.warning);

        // Embed 4: Official Links & Support
        const linksEmbed = new EmbedBuilder()
            .setTitle('🔗 Official Resources & Help Desk')
            .setDescription(
                '• **Roblox Group**: [Grandway Shopping Group (505768378)](https://www.roblox.com/groups/' + config.robloxGroupId + ')\n' +
                '• **Roblox Supermarket Game**: [Play Grandway Shopping](https://www.roblox.com/games/76637220767393/FreshlyPlazza-V2)\n' +
                '• **Account Verification**: <#' + config.channels.verification + '>\n' +
                '• **Customer Support & ModMail**: <#' + config.channels.supportCenter + '>\n' +
                '• **Feedback & Ideas**: <#' + config.channels.suggestions + '>\n'
            )
            .setColor(config.colors.primary)
            .setFooter({ text: 'Grandway Shopping • Excellence in Customer Service' })
            .setTimestamp();

        await chan.send({ embeds: [headerEmbed, rulesEmbed, operationsEmbed, linksEmbed] });
        console.log('[Deploy Info] All rules & information embeds posted!');
    }

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
