require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const token = process.env.DISCORD_TOKEN;
const clientId = Buffer.from(token.split('.')[0], 'base64').toString('ascii');
const testGuildId = config.testGuildId || '1558519063649587301';

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const item = require(filePath);
    if (Array.isArray(item)) {
        for (const cmd of item) {
            if ('data' in cmd && 'execute' in cmd) {
                commands.push(cmd.data.toJSON());
            }
        }
    } else if ('data' in item && 'execute' in item) {
        commands.push(item.data.toJSON());
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`[SLASH COMMANDS] Registering ${commands.length} clean commands to Guilds...`);

        // 1. Clear Global Commands (prevent any duplicates)
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log(`✅ Global commands cleared (prevents duplicates).`);

        // 2. Deploy to Real Guild
        await rest.put(
            Routes.applicationGuildCommands(clientId, config.guildId),
            { body: commands },
        );
        console.log(`✅ Deployed ${commands.length} Slash Commands to Real Guild (${config.guildId})`);

        // 3. Deploy to Test Guild
        await rest.put(
            Routes.applicationGuildCommands(clientId, testGuildId),
            { body: commands },
        );
        console.log(`✅ Deployed ${commands.length} Slash Commands to Test Guild (${testGuildId})`);

    } catch (error) {
        console.error('[SLASH COMMANDS ERROR]', error);
    }
})();
