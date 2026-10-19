const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    AttachmentBuilder, 
    ChannelType, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { startIaRecording, stopIaRecording, activeSessions } = require('../utils/iaRecorder');
const { getDb } = require('../database');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ia')
        .setDescription('Internal Affairs surveillance & voice investigation suite.')
        .addSubcommand(sub =>
            sub.setName('join')
                .setDescription('Join and record a voice channel (announces START RECORDING).')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('The voice channel to join and record')
                        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('reason')
                        .setDescription('Reason / Case docket reference for this recording')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('stop')
                .setDescription('Stop active IA recording, compile speaker audio, and export video docket.')
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all saved IA voice recordings from the past 30 days.')
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('Retrieve and download a past IA voice recording docket.')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('The IA Recording Case ID (e.g. IA-REC-123456)')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        // Verification: Only IA Staff, Directors, or Administrators can execute /ia
        const member = interaction.member;
        const isAuthorized = member.permissions.has(PermissionFlagsBits.Administrator) ||
            member.roles.cache.some(r => {
                const n = r.name.toLowerCase();
                return n.includes('internal affairs') || n.includes('director') || n.includes('head of moderation') || n.includes('trust & safety lead');
            });

        if (!isAuthorized) {
            return interaction.reply({
                content: '❌ **Access Denied:** You must be an authorized **Internal Affairs (IA)** or **Trust & Safety Director** to operate audio surveillance tools.',
                ephemeral: true
            });
        }

        const sub = interaction.options.getSubcommand();

        // ──────────────────────────────────────────────
        // 1. SUBCOMMAND: JOIN & START RECORDING
        // ──────────────────────────────────────────────
        if (sub === 'join') {
            await interaction.deferReply();
            const channel = interaction.options.getChannel('channel');
            const reason = interaction.options.getString('reason') || 'Official Internal Affairs Case Inquiry';

            try {
                const session = await startIaRecording(channel, interaction.user, reason);

                const alertEmbed = new EmbedBuilder()
                    .setTitle('🔴 [INTERNAL AFFAIRS] START RECORDING')
                    .setDescription(
                        `**Internal Affairs Audio Wiretap & Investigation Active**\n\n` +
                        `The bot has connected to **${channel.name}** and initiated compliance audio monitoring.\n` +
                        `An audible **"START RECORDING"** broadcast was announced in the channel.`
                    )
                    .addFields(
                        { name: '🎙️ Monitored Channel', value: `<#${channel.id}> (\`${channel.name}\`)`, inline: true },
                        { name: '🕵️ Case Officer', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📁 Case Docket ID', value: `\`${session.id}\``, inline: true },
                        { name: '📝 Stated Reason', value: reason, inline: false },
                        { name: '⏳ Retention Policy', value: '30 Days (Compliant with FreshlyPlaza T&S Protocol)', inline: false }
                    )
                    .setColor(0xE74C3C)
                    .setFooter({ text: 'Internal Affairs Division • FreshlyPlaza' })
                    .setTimestamp();

                // Send public notice into the voice channel's text chat
                await channel.send({
                    content: `🔴 **[INTERNAL AFFAIRS] START RECORDING** — This channel is currently being recorded and monitored for compliance by <@${interaction.user.id}>.`
                }).catch(() => {});

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_ia_stop_recording')
                        .setLabel('Stop & Export Recording')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⏹️')
                );

                return interaction.followUp({ embeds: [alertEmbed], components: [row] });
            } catch (err) {
                console.error('[IA COMMAND ERROR - JOIN]', err);
                return interaction.followUp({
                    content: `❌ **Failed to start recording:** ${err.message}`,
                    ephemeral: true
                });
            }
        }

        // ──────────────────────────────────────────────
        // 2. SUBCOMMAND: STOP RECORDING
        // ──────────────────────────────────────────────
        if (sub === 'stop') {
            await interaction.deferReply();
            try {
                const { record, filePath, fileName } = await stopIaRecording(interaction.guild.id);

                const attachment = new AttachmentBuilder(filePath, { name: fileName });

                const summaryEmbed = new EmbedBuilder()
                    .setTitle('⏹️ [INTERNAL AFFAIRS] RECORDING CONCLUDED')
                    .setDescription(
                        `Audio wiretap **${record.id}** has been finalized and processed.\n\n` +
                        `The interactive investigation package has been compiled below. Open the attached file to view the **video dashboard with active speaker profile highlighting, synchronized transcripts, and audio playback**.`
                    )
                    .addFields(
                        { name: '📁 Docket ID', value: `\`${record.id}\``, inline: true },
                        { name: '⏱️ Duration', value: `\`${record.duration_seconds}s\``, inline: true },
                        { name: '👥 Speakers Detected', value: `\`${record.speakers_count}\``, inline: true },
                        { name: '🎙️ Channel', value: `\`${record.channel_name}\``, inline: true },
                        { name: '🕵️ Processed By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📅 Expiration Date', value: `<t:${Math.floor(new Date(record.expires_at).getTime() / 1000)}:R> (30 Days)`, inline: true }
                    )
                    .setColor(0x2ECC71)
                    .setFooter({ text: 'FreshlyPlaza Internal Affairs Vault' })
                    .setTimestamp();

                // Also log to the Trust & Safety server's wiretap channel if accessible
                const tsGuild = interaction.client.guilds.cache.get('1561767415044378694');
                if (tsGuild) {
                    const wiretapCh = tsGuild.channels.cache.find(c => c.name.includes('wiretaps-recordings'));
                    if (wiretapCh) {
                        const logAtt = new AttachmentBuilder(filePath, { name: fileName });
                        await wiretapCh.send({ embeds: [summaryEmbed], files: [logAtt] }).catch(() => {});
                    }
                }

                return interaction.followUp({ embeds: [summaryEmbed], files: [attachment] });
            } catch (err) {
                console.error('[IA COMMAND ERROR - STOP]', err);
                return interaction.followUp({
                    content: `❌ **Failed to stop recording:** ${err.message}`,
                    ephemeral: true
                });
            }
        }

        // ──────────────────────────────────────────────
        // 3. SUBCOMMAND: LIST RECORDINGS
        // ──────────────────────────────────────────────
        if (sub === 'list') {
            await interaction.deferReply({ ephemeral: true });
            const db = getDb();
            const list = await db.listIaRecordings(15);

            if (!list || list.length === 0) {
                return interaction.followUp({ content: '📭 No active IA wiretap recordings currently on file.' });
            }

            const lines = list.map(r => 
                `• **\`${r.id}\`** | #${r.channel_name} (${r.duration_seconds}s) — ${r.speakers_count} speakers | Expires: <t:${Math.floor(new Date(r.expires_at).getTime()/1000)}:R>`
            );

            const listEmbed = new EmbedBuilder()
                .setTitle('📁 Active Internal Affairs Wiretap Recordings (Past 30 Days)')
                .setDescription(lines.join('\n\n'))
                .setColor(0x3498DB)
                .setFooter({ text: 'Use /ia view <id> to retrieve the dossier and media player.' });

            return interaction.followUp({ embeds: [listEmbed] });
        }

        // ──────────────────────────────────────────────
        // 4. SUBCOMMAND: VIEW RECORDING
        // ──────────────────────────────────────────────
        if (sub === 'view') {
            await interaction.deferReply();
            const id = interaction.options.getString('id').toUpperCase();
            const db = getDb();
            const record = await db.getIaRecording(id);

            if (!record) {
                return interaction.followUp({ content: `❌ No IA recording found with ID \`${id}\`. (Recordings automatically expire after 30 days).`, ephemeral: true });
            }

            const fs = require('fs');
            if (!fs.existsSync(record.file_path)) {
                return interaction.followUp({ content: `⚠️ Metadata exists for \`${id}\`, but the file was purged or expired.`, ephemeral: true });
            }

            const att = new AttachmentBuilder(record.file_path, { name: `IA-Evidence-${record.id}.html` });

            const viewEmbed = new EmbedBuilder()
                .setTitle(`📁 Case Docket: ${record.id}`)
                .setDescription(
                    `**Voice Channel:** \`${record.channel_name}\`\n` +
                    `**Recorded By:** ${record.recorded_by?.tag || 'IA Special Agent'}\n` +
                    `**Total Length:** ${record.duration_seconds} seconds\n` +
                    `**Speakers:** ${record.speakers?.map(s => `\`@${s.displayName}\``).join(', ') || 'None'}\n` +
                    `**Expires:** <t:${Math.floor(new Date(record.expires_at).getTime()/1000)}:R>`
                )
                .setColor(0x2980B9)
                .setFooter({ text: 'Download the attached file to open the synchronized video player & transcript.' });

            return interaction.followUp({ embeds: [viewEmbed], files: [att] });
        }
    }
};
