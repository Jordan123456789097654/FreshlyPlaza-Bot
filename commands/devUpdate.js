const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');

// Helper to construct slash command with 10 optional sections
const devUpdateCommand = new SlashCommandBuilder()
    .setName('dev-update')
    .setDescription('Publish a development update to #dev-updates with up to 10 customizable sections')
    .addStringOption(opt =>
        opt.setName('title')
            .setDescription('Main headline / title of the development update (e.g. Summer Store Overhaul)')
            .setRequired(true)
    )
    .addStringOption(opt =>
        opt.setName('version')
            .setDescription('Version or patch number (e.g. v2.5.0, Build 42)')
            .setRequired(false)
    )
    .addStringOption(opt =>
        opt.setName('ping')
            .setDescription('Notification ping level for the announcement')
            .setRequired(false)
            .addChoices(
                { name: 'None (Silent)', value: 'none' },
                { name: 'Announcements Ping (@role)', value: 'role' },
                { name: '@everyone', value: 'everyone' },
                { name: '@here', value: 'here' }
            )
    )
    .addStringOption(opt =>
        opt.setName('banner_url')
            .setDescription('Optional image / banner URL to display in the update embed')
            .setRequired(false)
    );

// Append 10 optional sections (20 options: section1_title, section1_desc ... section10_title, section10_desc)
for (let i = 1; i <= 10; i++) {
    devUpdateCommand.addStringOption(opt =>
        opt.setName(`section${i}_title`)
            .setDescription(`Section #${i} Title (e.g. Added, Fixed, Changed, Performance)`)
            .setRequired(false)
    );
    devUpdateCommand.addStringOption(opt =>
        opt.setName(`section${i}_desc`)
            .setDescription(`Section #${i} Description / Notes (bullet points or details)`)
            .setRequired(false)
    );
}

module.exports = [
    {
        data: devUpdateCommand,
        async execute(interaction) {
            const member = interaction.member;

            // Permission Check: Developers, Leadership (HR/MR), Administrators, or Exempt Users (e.g. SECRET_DEVJED)
            const isAuthorized =
                (config.ignoredUserIds || []).includes(interaction.user.id) ||
                member.permissions.has(PermissionFlagsBits.Administrator) ||
                member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                member.roles.cache.has(config.roles.leadDev) ||
                member.roles.cache.has(config.roles.groupDev) ||
                member.roles.cache.has(config.roles.bestDev) ||
                member.roles.cache.has(config.roles.hr) ||
                member.roles.cache.has(config.roles.mr);

            if (!isAuthorized) {
                return interaction.reply({
                    content: '❌ **Access Denied:** You must be a Developer, Leadership/Staff member, or Administrator to post development updates.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const updateTitle = interaction.options.getString('title');
            const version = interaction.options.getString('version');
            const pingOption = interaction.options.getString('ping') || 'none';
            const bannerUrl = interaction.options.getString('banner_url');

            // Gather populated sections
            const sections = [];
            for (let i = 1; i <= 10; i++) {
                const sTitle = interaction.options.getString(`section${i}_title`);
                const sDesc = interaction.options.getString(`section${i}_desc`);

                if (sTitle || sDesc) {
                    sections.push({
                        title: sTitle ? sTitle.trim() : `Section ${i}`,
                        description: sDesc ? sDesc.trim() : '*No description provided.*'
                    });
                }
            }

            // Target Channel: #dev-updates (fallback to staffAnnouncements or current channel)
            const targetChannelId = config.channels.devUpdates || '1505307362494255386';
            let targetChannel = interaction.guild.channels.cache.get(targetChannelId);
            if (!targetChannel) {
                try {
                    targetChannel = await interaction.guild.channels.fetch(targetChannelId);
                } catch (e) {
                    targetChannel = interaction.guild.channels.cache.find(
                        c => c.name.toLowerCase().includes('dev-update') || c.name.toLowerCase().includes('dev-announce')
                    ) || interaction.channel;
                }
            }

            if (!targetChannel) {
                return interaction.editReply({
                    content: `❌ Could not locate the <#${targetChannelId}> channel. Please check permissions or channel configuration.`
                });
            }

            // Construct Embed
            const embed = new EmbedBuilder()
                .setTitle(`🛠️ Grandway Shopping — ${updateTitle}${version ? ` (${version})` : ''}`)
                .setColor(config.colors.primary)
                .setDescription(
                    `A brand new development update has been deployed to **${config.storeName}**!\n` +
                    `Review the changelog and release notes below.`
                )
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
                .setFooter({
                    text: `Announced by ${interaction.user.tag} • Grandway Shopping Development Team`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            if (version) {
                embed.addFields({
                    name: '📦 Version / Build',
                    value: `\`${version}\``,
                    inline: true
                });
            }

            embed.addFields(
                {
                    name: '👤 Author',
                    value: `<@${interaction.user.id}>`,
                    inline: true
                },
                {
                    name: '🎮 Play Store Experience',
                    value: `[**Join Grandway Shopping Game**](${config.robloxGameLink})`,
                    inline: true
                }
            );

            // Add the populated sections as fields
            if (sections.length > 0) {
                for (let i = 0; i < sections.length; i++) {
                    const sec = sections[i];
                    embed.addFields({
                        name: `🔹 ${sec.title}`,
                        value: sec.description.length > 1024 ? sec.description.slice(0, 1020) + '...' : sec.description,
                        inline: false
                    });
                }
            } else {
                embed.addFields({
                    name: '📝 Update Notes',
                    value: 'General improvements, optimizations, and store system enhancements.',
                    inline: false
                });
            }

            if (bannerUrl && bannerUrl.startsWith('http')) {
                embed.setImage(bannerUrl);
            }

            // Determine ping content
            let pingContent = '';
            if (pingOption === 'role' && config.roles.announcementsPing) {
                pingContent = `<@&${config.roles.announcementsPing}>`;
            } else if (pingOption === 'everyone') {
                pingContent = '@everyone';
            } else if (pingOption === 'here') {
                pingContent = '@here';
            }

            // Post message
            try {
                const messagePayload = {
                    embeds: [embed]
                };
                if (pingContent) {
                    messagePayload.content = pingContent;
                }

                const sentMessage = await targetChannel.send(messagePayload);

                return interaction.editReply({
                    content: `✅ **Development update successfully published!**\nSent to <#${targetChannel.id}>: [Jump to Update](${sentMessage.url})`
                });
            } catch (err) {
                console.error('[DEV-UPDATE ERROR]', err);
                return interaction.editReply({
                    content: `❌ Failed to send update to <#${targetChannel.id}>: \`${err.message}\``
                });
            }
        }
    }
];
