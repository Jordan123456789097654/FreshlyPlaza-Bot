const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

module.exports = [
    {
        data: new SlashCommandBuilder()
            .setName('health-stress-test')
            .setDescription('Simulate a latency or memory spike to test website real-time health detection')
            .addStringOption(opt =>
                opt.setName('type')
                    .setDescription('Metric spike simulation type')
                    .setRequired(false)
                    .addChoices(
                        { name: '🌐 Gateway Latency Spike (684ms)', value: 'latency' },
                        { name: '🧠 Elevated Memory Spike (512 MB)', value: 'memory' }
                    )
            )
            .addIntegerOption(opt =>
                opt.setName('seconds')
                    .setDescription('Stress test duration in seconds (Default: 30s)')
                    .setRequired(false)
                    .setMinValue(5)
                    .setMaxValue(300)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) ||
                              member.roles.cache.has(config.roles.mr) ||
                              member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                              member.permissions.has(PermissionFlagsBits.Administrator) ||
                              (config.ignoredUserIds || []).includes(interaction.user.id);

            if (!isManager) {
                return interaction.reply({
                    content: '❌ You must be an MR/HR or Administrator to run health stress tests.',
                    ephemeral: true
                });
            }

            const type = interaction.options.getString('type') || 'latency';
            const seconds = interaction.options.getInteger('seconds') || 30;

            if (!interaction.client.healthControl) {
                return interaction.reply({
                    content: '⚠️ Bot health controller is not ready.',
                    ephemeral: true
                });
            }

            const testData = interaction.client.healthControl.setStressTest(type, seconds);
            const expiresTimestamp = Math.floor(Date.now() / 1000) + seconds;

            const isLatency = type === 'latency';
            const embed = new EmbedBuilder()
                .setTitle('🔥 Real-Time Health Stress Test Activated')
                .setDescription(
                    `A temporary **${isLatency ? 'Gateway Latency' : 'Memory Saturation'}** stress test has been triggered. ` +
                    `The bot's live health endpoint will automatically reflect **DEGRADED** status in real time.`
                )
                .addFields(
                    { 
                        name: '📊 Simulated Metric Spike', 
                        value: isLatency ? '`684ms` Latency (> 400ms threshold)' : '`512.45 MB` Heap Memory (> 450MB threshold)', 
                        inline: true 
                    },
                    { 
                        name: '⏱️ Duration', 
                        value: `**${seconds} seconds** (Expires <t:${expiresTimestamp}:R>)`, 
                        inline: true 
                    },
                    { 
                        name: '🩺 Resulting Health Status', 
                        value: '`DEGRADED ⚠️`', 
                        inline: true 
                    },
                    {
                        name: '🌐 Live Website Endpoint',
                        value: `[\`http://fi14.bot-hosting.cloud:26134/health\`](http://fi14.bot-hosting.cloud:26134/health)`,
                        inline: false
                    },
                    {
                        name: '🔄 Automatic Recovery',
                        value: `Once the timer expires (<t:${expiresTimestamp}:T>), health detection will automatically revert to **\`UP 🟢\`** without any manual intervention. You can also run \`/health-reset\` to stop immediately.`,
                        inline: false
                    }
                )
                .setColor(config.colors.warning)
                .setFooter({ text: 'FreshlyPlaza Bot Health & Diagnostics' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('health-status')
            .setDescription('Check real-time bot performance metrics and website health detection status'),
        async execute(interaction) {
            if (!interaction.client.healthControl) {
                return interaction.reply({
                    content: '⚠️ Bot health controller is not available.',
                    ephemeral: true
                });
            }

            const metrics = interaction.client.healthControl.getMetrics();
            const uptime = metrics.uptimeSeconds;
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            const formattedUptime = `${hours}h ${minutes}m ${seconds}s`;

            let statusIcon = '🟢';
            let color = config.colors.primary;
            if (metrics.status === 'DEGRADED') {
                statusIcon = '⚠️';
                color = config.colors.warning;
            } else if (metrics.status === 'PARTIAL_OUTAGE') {
                statusIcon = '🟠';
                color = config.colors.warning;
            } else if (metrics.status === 'MAINTENANCE' || metrics.status === 'DOWN') {
                statusIcon = '🔴';
                color = config.colors.danger;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🩺 FreshlyPlaza Bot — Real-Time Health & Status`)
                .setDescription(
                    `Current real-time operational status monitored by the FreshlyPlaza website system health pinger.`
                )
                .addFields(
                    { name: '🟢 Current Status', value: `**${statusIcon} ${metrics.status}**`, inline: true },
                    { name: '⚙️ Mode', value: metrics.overrideStatus ? `\`MANUAL (${metrics.overrideStatus})\`` : '`AUTOMATIC DETECTION`', inline: true },
                    { name: '📶 Discord Ping', value: `\`${metrics.ping >= 0 ? `${metrics.ping}ms` : 'calculating'}\``, inline: true },
                    { name: '🧠 RAM / Heap Used', value: `\`${metrics.memUsedMb} MB\` / \`${metrics.memTotalMb} MB\``, inline: true },
                    { name: '⏳ Bot Uptime', value: `\`${formattedUptime}\``, inline: true },
                    { name: '🛡️ Guilds & Commands', value: `\`${interaction.client.guilds.cache.size} Servers\` • \`${interaction.client.commands.size} Commands\``, inline: true }
                )
                .setColor(color)
                .setFooter({ text: 'FreshlyPlaza Real-Time Diagnostics' })
                .setTimestamp();

            if (metrics.isStressTesting) {
                embed.addFields({
                    name: '🔥 Active Stress Test Simulation',
                    value: `Simulating **${metrics.stressTestType.toUpperCase()}** spike. Reverts in **${metrics.stressRemainingSeconds}s** (<t:${Math.floor(new Date(metrics.stressExpiresAt).getTime() / 1000)}:R>).`,
                    inline: false
                });
            }

            if (metrics.reason) {
                embed.addFields({
                    name: '📝 Status Reason / Why',
                    value: `\`${metrics.reason}\``,
                    inline: false
                });
            }

            embed.addFields({
                name: '🔗 Public Health API',
                value: `[\`http://fi14.bot-hosting.cloud:26134/health\`](http://fi14.bot-hosting.cloud:26134/health)`,
                inline: false
            });

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('health-set-status')
            .setDescription('Manually set the bot health status and provide the reason why')
            .addStringOption(opt =>
                opt.setName('status')
                    .setDescription('Target bot status')
                    .setRequired(true)
                    .addChoices(
                        { name: '🟢 UP (Normal / Automatic)', value: 'UP' },
                        { name: '⚠️ DEGRADED (Elevated latency / slow operations)', value: 'DEGRADED' },
                        { name: '🟠 PARTIAL_OUTAGE (Specific feature or service offline)', value: 'PARTIAL_OUTAGE' },
                        { name: '🔧 MAINTENANCE (Scheduled maintenance / upgrades)', value: 'MAINTENANCE' },
                        { name: '🔴 DOWN (Critical emergency / offline)', value: 'DOWN' }
                    )
            )
            .addStringOption(opt =>
                opt.setName('reason')
                    .setDescription('Why is the bot in this status? (Displayed on website status page)')
                    .setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('service')
                    .setDescription('Service name (Optional for Partial Outage, e.g. Shifts, Tickets, Verification)')
                    .setRequired(false)
            ),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) ||
                              member.roles.cache.has(config.roles.mr) ||
                              member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                              member.permissions.has(PermissionFlagsBits.Administrator) ||
                              (config.ignoredUserIds || []).includes(interaction.user.id);

            if (!isManager) {
                return interaction.reply({
                    content: '❌ You must be an MR/HR or Administrator to change bot health status.',
                    ephemeral: true
                });
            }

            if (!interaction.client.healthControl) {
                return interaction.reply({
                    content: '⚠️ Bot health controller is not ready.',
                    ephemeral: true
                });
            }

            const status = interaction.options.getString('status');
            const customReason = interaction.options.getString('reason');
            const serviceName = interaction.options.getString('service');

            if (status === 'UP') {
                interaction.client.healthControl.reset();
                const embed = new EmbedBuilder()
                    .setTitle('✅ Bot Status Reset to UP')
                    .setDescription('All overrides cleared. Bot returned to automatic health monitoring.')
                    .addFields(
                        { name: '🟢 Status', value: '`UP` (Automatic monitoring)', inline: true },
                        { name: '📝 Reason', value: customReason || 'All systems operational. Automatic health monitoring active.', inline: false },
                        { name: '🌐 Live Website Endpoint', value: '[`http://fi14.bot-hosting.cloud:26134/health`](http://fi14.bot-hosting.cloud:26134/health)', inline: false }
                    )
                    .setColor(config.colors.primary)
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            let defaultReason = '';
            let color = config.colors.warning;
            let statusIcon = '⚠️';

            if (status === 'MAINTENANCE') {
                defaultReason = 'Scheduled system maintenance in progress. Bot services are temporarily restricted.';
                color = config.colors.danger;
                statusIcon = '🔧';
            } else if (status === 'DOWN') {
                defaultReason = 'Critical emergency outage detected. Bot is currently offline.';
                color = config.colors.danger;
                statusIcon = '🔴';
            } else if (status === 'DEGRADED') {
                defaultReason = 'Degraded performance reported: operations may be slow or delayed.';
                color = config.colors.warning;
                statusIcon = '⚠️';
            } else if (status === 'PARTIAL_OUTAGE') {
                defaultReason = serviceName ? `Partial outage: ${serviceName} is temporarily unavailable.` : 'Partial service disruption: one or more bot features are temporarily impaired.';
                color = config.colors.warning;
                statusIcon = '🟠';
            }

            const finalReason = customReason || defaultReason;
            interaction.client.healthControl.setOverride(status, finalReason);

            const embed = new EmbedBuilder()
                .setTitle(`${statusIcon} Bot Status Set to ${status}`)
                .setDescription(`The bot status override and its incident reason have been updated.`)
                .addFields(
                    { name: '📊 Operational Status', value: `**${statusIcon} ${status}**`, inline: true },
                    { name: '⚙️ Mode', value: '`MANUAL_OVERRIDE`', inline: true },
                    { name: '📝 Reason / Why', value: `\`${finalReason}\``, inline: false },
                    { name: '🌐 Live Website Endpoint', value: '[`http://fi14.bot-hosting.cloud:26134/health`](http://fi14.bot-hosting.cloud:26134/health)', inline: false }
                )
                .setColor(color)
                .setFooter({ text: 'FreshlyPlaza Bot Health Management' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    },
    {
        data: new SlashCommandBuilder()
            .setName('health-reset')
            .setDescription('Reset health overrides and cancel active stress tests back to normal automatic UP'),
        async execute(interaction) {
            const member = interaction.member;
            const isManager = member.roles.cache.has(config.roles.hr) ||
                              member.roles.cache.has(config.roles.mr) ||
                              member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                              member.permissions.has(PermissionFlagsBits.Administrator) ||
                              (config.ignoredUserIds || []).includes(interaction.user.id);

            if (!isManager) {
                return interaction.reply({
                    content: '❌ You must be an MR/HR or Administrator to reset bot health overrides.',
                    ephemeral: true
                });
            }

            if (interaction.client.healthControl) {
                interaction.client.healthControl.reset();
            }

            const embed = new EmbedBuilder()
                .setTitle('✅ Bot Health Reset to Normal')
                .setDescription('All stress test simulations and manual status overrides have been cleared.')
                .addFields(
                    { name: '🟢 Status', value: '`UP` (Automatic monitoring)', inline: true },
                    { name: '🌐 HTTP Endpoint', value: 'Returning `HTTP 200 OK` on `/health`', inline: true }
                )
                .setColor(config.colors.primary)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
];
