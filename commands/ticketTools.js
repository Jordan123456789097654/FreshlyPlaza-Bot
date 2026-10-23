const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { hasTicketOverride } = require('../utils/ticketAccess');
const { getDb } = require('../database');

module.exports = [
    // 2. /ticket-alarm - Emergency Leadership Alarm
    {
        data: new SlashCommandBuilder()
            .setName('ticket-alarm')
            .setDescription('Trigger an urgent emergency leadership ping in this ticket for active store exploits or incidents')
            .addStringOption(opt => opt.setName('situation').setDescription('Description of the active emergency or critical incident').setRequired(true)),
        async execute(interaction) {
            const member = interaction.member;
            const isStaff = hasTicketOverride(member) || member.roles.cache.has(config.roles.staff) ||
                            member.roles.cache.has(config.roles.mr) ||
                            member.roles.cache.has(config.roles.hr) ||
                            member.permissions.has(PermissionFlagsBits.ManageMessages);

            if (!isStaff) {
                return interaction.reply({ content: '❌ Only Grandway Shopping Staff can sound the emergency leadership alarm.', flags: MessageFlags.Ephemeral });
            }

            const situation = interaction.options.getString('situation');

            const alarmEmbed = new EmbedBuilder()
                .setTitle('🚨 CRITICAL EMERGENCY LEADERSHIP ALARM 🚨')
                .setDescription(
                    `**ATTENTION HIGH RANKS & MANAGEMENT:** An emergency alert has been sounded by <@${interaction.user.id}>!\n\n` +
                    `• **Channel:** <#${interaction.channel.id}>\n` +
                    `• **Triggered By:** <@${interaction.user.id}>\n` +
                    `• **Critical Situation:** \`\`\`${situation}\`\`\`\n` +
                    `⚡ **Immediate executive attention required.**`
                )
                .setColor(config.colors.danger)
                .setTimestamp();

            // Ping HR role
            const hrRoleId = config.roles.hr;
            return interaction.reply({
                content: `<@&${hrRoleId}> 🚨 **EMERGENCY STORE/TICKET ALARM ACTIVATED** 🚨`,
                embeds: [alarmEmbed]
            });
        }
    },

    // 3. /snippet-create & /snippet-send - Reusable Ticket Canned Snippets
    {
        data: new SlashCommandBuilder()
            .setName('snippet')
            .setDescription('Manage and send saved canned response snippets in tickets')
            .addSubcommand(sub =>
                sub.setName('send')
                    .setDescription('Send a saved canned snippet into this ticket')
                    .addStringOption(opt => opt.setName('name').setDescription('Name of snippet (e.g. shifts, tillreset, rules)').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('create')
                    .setDescription('Create or update a saved response snippet')
                    .addStringOption(opt => opt.setName('name').setDescription('Short snippet trigger name').setRequired(true))
                    .addStringOption(opt => opt.setName('content').setDescription('Snippet response text').setRequired(true))
            )
            .addSubcommand(sub =>
                sub.setName('list')
                    .setDescription('List all saved canned response snippets')
            ),
        async execute(interaction) {
            const sub = interaction.options.getSubcommand();
            const db = getDb();
            const data = db.getData();
            if (!data.ticket_snippets) {
                data.ticket_snippets = {
                    shifts: 'Grandway Shopping supermarket shifts are hosted daily by management! You can check <#1505309843219546223> for active store sessions.',
                    tillreset: 'To reset a frozen self-checkout till, step away from the scan area for 3 seconds. If the scanner remains locked, a Colleague can apply an override key.',
                    appealinfo: 'Moderation appeals require at least a 48-hour wait period. Please state your Discord tag, Roblox username, and explain why your punishment should be lifted.'
                };
                db.save();
            }

            if (sub === 'list') {
                const keys = Object.keys(data.ticket_snippets);
                const list = keys.map(k => `• \`/${k}\`: ${data.ticket_snippets[k].slice(0, 60)}...`).join('\n') || '*No snippets found.*';
                const embed = new EmbedBuilder()
                    .setTitle('📋 Saved Canned Response Snippets')
                    .setDescription(list)
                    .setColor(config.colors.secondary);
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if (sub === 'create') {
                const name = interaction.options.getString('name').toLowerCase().trim();
                const content = interaction.options.getString('content');
                data.ticket_snippets[name] = content;
                db.save();
                return interaction.reply({ content: `✅ Created canned snippet **\`${name}\`**! You can send it with \`/snippet send name:${name}\`.`, flags: MessageFlags.Ephemeral });
            }

            if (sub === 'send') {
                const name = interaction.options.getString('name').toLowerCase().trim();
                const snippet = data.ticket_snippets[name];
                if (!snippet) {
                    return interaction.reply({ content: `❌ Snippet **\`${name}\`** not found. Use \`/snippet list\` to see available snippets.`, flags: MessageFlags.Ephemeral });
                }

                const snippetEmbed = new EmbedBuilder()
                    .setAuthor({ name: 'Grandway Shopping Support Snippet', iconURL: interaction.guild.iconURL() || undefined })
                    .setDescription(snippet)
                    .setColor(config.colors.secondary)
                    .setFooter({ text: `Dispatched by ${interaction.user.tag}` })
                    .setTimestamp();

                return interaction.reply({ embeds: [snippetEmbed] });
            }
        }
    }
];
