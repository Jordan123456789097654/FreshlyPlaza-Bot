const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { getDb } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ia-case')
        .setDescription('Official Internal Affairs Case Docket & Disciplinary Management System.')
        .addSubcommand(sub =>
            sub.setName('open')
                .setDescription('Open a formal Internal Affairs investigation case docket against a staff member.')
                .addUserOption(opt =>
                    opt.setName('staff')
                        .setDescription('The staff member under inquiry')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('allegation')
                        .setDescription('The alleged misconduct (e.g. Exploit Facilitation, Admin Abuse, Inactivity Fraud)')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('priority')
                        .setDescription('Urgency level of this inquiry')
                        .addChoices(
                            { name: '🔴 Critical / Emergency', value: 'CRITICAL' },
                            { name: '🟠 High', value: 'HIGH' },
                            { name: '🟡 Medium', value: 'MEDIUM' },
                            { name: '🔵 Low / Routine', value: 'LOW' }
                        )
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('attach')
                .setDescription('Attach evidence, wiretap recordings, or notes to an active case docket.')
                .addStringOption(opt =>
                    opt.setName('case_id')
                        .setDescription('The Case Docket ID (e.g. IA-CASE-1024)')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('evidence')
                        .setDescription('Evidence URL, wiretap recording ID, or statement note')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('verdict')
                .setDescription('Render an official closing verdict and disciplinary recommendation on a case.')
                .addStringOption(opt =>
                    opt.setName('case_id')
                        .setDescription('The Case Docket ID')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('decision')
                        .setDescription('The official investigation finding')
                        .addChoices(
                            { name: '🟢 Cleared / Exonerated (No Policy Breach)', value: 'CLEARED' },
                            { name: '🟡 Written Reprimand & Retraining', value: 'REPRIMAND' },
                            { name: '🟠 Official Strike Issued', value: 'STRIKE' },
                            { name: '🔴 Demotion in Rank', value: 'DEMOTE' },
                            { name: '⛔ Immediate Termination & Blacklist', value: 'TERMINATE' }
                        )
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('rationale')
                        .setDescription('Detailed explanation and evidence-based justification for this finding')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View the complete case docket, attached evidence, and investigation notes.')
                .addStringOption(opt =>
                    opt.setName('case_id')
                        .setDescription('The Case Docket ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all open or closed Internal Affairs case dockets.')
                .addStringOption(opt =>
                    opt.setName('status')
                        .setDescription('Filter by docket status')
                        .addChoices(
                            { name: 'Active / Open Only', value: 'OPEN' },
                            { name: 'Concluded / Closed Only', value: 'CLOSED' },
                            { name: 'All Cases', value: 'ALL' }
                        )
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const member = interaction.member;
        const isAuthorized = member.permissions.has(PermissionFlagsBits.Administrator) ||
            member.roles.cache.some(r => {
                const n = r.name.toLowerCase();
                return n.includes('internal affairs') || n.includes('director') || n.includes('head of moderation') || n.includes('trust & safety lead');
            });

        if (!isAuthorized) {
            return interaction.reply({
                content: '❌ **Access Denied:** Only authorized **Internal Affairs Agents** and **Trust & Safety Directors** may access case dockets.',
                ephemeral: true
            });
        }

        const sub = interaction.options.getSubcommand();
        const db = getDb();

        // ──────────────────────────────────────────────
        // 1. OPEN NEW CASE DOCKET
        // ──────────────────────────────────────────────
        if (sub === 'open') {
            await interaction.deferReply();
            const targetUser = interaction.options.getUser('staff');
            const allegation = interaction.options.getString('allegation');
            const priority = interaction.options.getString('priority') || 'HIGH';

            const caseId = `IA-CASE-${Date.now().toString().slice(-4)}`;

            const newCase = {
                id: caseId,
                target_user: {
                    id: targetUser.id,
                    tag: targetUser.tag,
                    avatar: targetUser.displayAvatarURL({ dynamic: true })
                },
                allegation,
                priority,
                status: 'OPEN',
                opened_by: {
                    id: interaction.user.id,
                    tag: interaction.user.tag
                },
                evidence: [],
                verdict: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            await db.addIaCase(newCase);

            const docketEmbed = new EmbedBuilder()
                .setTitle(`📁 [CONFIDENTIAL] Internal Affairs Docket: ${caseId}`)
                .setDescription(
                    `A formal Internal Affairs inquiry has been opened regarding alleged staff misconduct.\n\n` +
                    `**Target Subject:** <@${targetUser.id}> (\`${targetUser.tag}\`)\n` +
                    `**Lead Agent:** <@${interaction.user.id}>\n` +
                    `**Priority Level:** \`${priority}\`\n` +
                    `**Status:** \`ACTIVE / OPEN INVESTIGATION\`\n\n` +
                    `**Allegation Details:**\n\`\`\`\n${allegation}\n\`\`\``
                )
                .setColor(priority === 'CRITICAL' ? 0xE74C3C : 0xF39C12)
                .setFooter({ text: 'FreshlyPlaza Internal Affairs Division • Case File' })
                .setTimestamp();

            // Dispatch case docket to Trust & Safety server's dockets channel
            const tsGuild = interaction.client.guilds.cache.get('1561767415044378694');
            if (tsGuild) {
                const docketCh = tsGuild.channels.cache.find(c => c.name.includes('ia-staff-case-dockets'));
                if (docketCh) {
                    await docketCh.send({ embeds: [docketEmbed] }).catch(() => {});
                }
            }

            return interaction.followUp({
                content: `✅ **Internal Affairs Case Docket \`${caseId}\` Successfully Opened.**`,
                embeds: [docketEmbed]
            });
        }

        // ──────────────────────────────────────────────
        // 2. ATTACH EVIDENCE TO CASE
        // ──────────────────────────────────────────────
        if (sub === 'attach') {
            await interaction.deferReply();
            const caseId = interaction.options.getString('case_id').toUpperCase();
            const evidence = interaction.options.getString('evidence');

            const caseObj = await db.getIaCase(caseId);
            if (!caseObj) {
                return interaction.followUp({ content: `❌ Case docket \`${caseId}\` not found in database.`, ephemeral: true });
            }

            if (!caseObj.evidence) caseObj.evidence = [];
            const entry = {
                id: `EVID-${Date.now().toString().slice(-4)}`,
                item: evidence,
                attached_by: interaction.user.tag,
                timestamp: new Date().toISOString()
            };
            caseObj.evidence.push(entry);
            await db.updateIaCase(caseId, { evidence: caseObj.evidence });

            return interaction.followUp({
                content: `📎 **Evidence Attached to Docket \`${caseId}\`:**\n> \`${evidence}\`\n*Logged by <@${interaction.user.id}> at <t:${Math.floor(Date.now()/1000)}:T>*`
            });
        }

        // ──────────────────────────────────────────────
        // 3. RENDER VERDICT
        // ──────────────────────────────────────────────
        if (sub === 'verdict') {
            await interaction.deferReply();
            const caseId = interaction.options.getString('case_id').toUpperCase();
            const decision = interaction.options.getString('decision');
            const rationale = interaction.options.getString('rationale');

            const caseObj = await db.getIaCase(caseId);
            if (!caseObj) {
                return interaction.followUp({ content: `❌ Case docket \`${caseId}\` not found.`, ephemeral: true });
            }

            const verdictData = {
                decision,
                rationale,
                adjudicated_by: {
                    id: interaction.user.id,
                    tag: interaction.user.tag
                },
                concluded_at: new Date().toISOString()
            };

            await db.updateIaCase(caseId, { status: 'CLOSED', verdict: verdictData });

            const colors = {
                CLEARED: 0x2ECC71,
                REPRIMAND: 0xF1C40F,
                STRIKE: 0xE67E22,
                DEMOTE: 0xE74C3C,
                TERMINATE: 0x962D22
            };

            const verdictEmbed = new EmbedBuilder()
                .setTitle(`⚖️ [INTERNAL AFFAIRS FINDINGS] Case ${caseId} Final Verdict`)
                .setDescription(
                    `The Internal Affairs Department has formally concluded its inquiry into <@${caseObj.target_user.id}> (\`${caseObj.target_user.tag}\`).\n\n` +
                    `**Final Adjudication:** **\`${decision}\`**\n` +
                    `**Presiding Authority:** <@${interaction.user.id}>\n` +
                    `**Original Allegation:** \`${caseObj.allegation}\`\n\n` +
                    `**Findings & Judicial Rationale:**\n\`\`\`\n${rationale}\n\`\`\``
                )
                .setColor(colors[decision] || 0x34495E)
                .setFooter({ text: 'FreshlyPlaza Disciplinary Board • Formal Order' })
                .setTimestamp();

            // Post to #ia-disciplinary-findings in Trust & Safety server
            const tsGuild = interaction.client.guilds.cache.get('1561767415044378694');
            if (tsGuild) {
                const findingsCh = tsGuild.channels.cache.find(c => c.name.includes('ia-disciplinary-findings'));
                if (findingsCh) {
                    await findingsCh.send({ embeds: [verdictEmbed] }).catch(() => {});
                }
            }

            return interaction.followUp({
                content: `⚖️ **Case \`${caseId}\` Officially Concluded and Archived.**`,
                embeds: [verdictEmbed]
            });
        }

        // ──────────────────────────────────────────────
        // 4. VIEW CASE DOCKET
        // ──────────────────────────────────────────────
        if (sub === 'view') {
            await interaction.deferReply({ ephemeral: true });
            const caseId = interaction.options.getString('case_id').toUpperCase();
            const caseObj = await db.getIaCase(caseId);

            if (!caseObj) {
                return interaction.followUp({ content: `❌ Case docket \`${caseId}\` not found.` });
            }

            const evidenceList = (caseObj.evidence && caseObj.evidence.length > 0)
                ? caseObj.evidence.map((e, idx) => `**${idx + 1}.** \`${e.item}\` *(by ${e.attached_by})*`).join('\n')
                : '*No evidence items attached yet.*';

            const viewEmbed = new EmbedBuilder()
                .setTitle(`📁 Case Docket: ${caseObj.id}`)
                .setDescription(
                    `**Subject:** <@${caseObj.target_user.id}> (\`${caseObj.target_user.tag}\`)\n` +
                    `**Status:** \`${caseObj.status}\` | **Priority:** \`${caseObj.priority}\`\n` +
                    `**Opened By:** ${caseObj.opened_by?.tag || 'IA Special Agent'}\n` +
                    `**Opened At:** <t:${Math.floor(new Date(caseObj.created_at).getTime()/1000)}:R>\n\n` +
                    `**Allegation:**\n> ${caseObj.allegation}\n\n` +
                    `**Evidence Records:**\n${evidenceList}` +
                    (caseObj.verdict ? `\n\n**Verdict:** \`${caseObj.verdict.decision}\` by ${caseObj.verdict.adjudicated_by.tag}\n> ${caseObj.verdict.rationale}` : '')
                )
                .setColor(caseObj.status === 'OPEN' ? 0xF39C12 : 0x2ECC71)
                .setThumbnail(caseObj.target_user.avatar || undefined)
                .setFooter({ text: 'FreshlyPlaza Classified IA Case Docket' });

            return interaction.followUp({ embeds: [viewEmbed] });
        }

        // ──────────────────────────────────────────────
        // 5. LIST CASES
        // ──────────────────────────────────────────────
        if (sub === 'list') {
            await interaction.deferReply({ ephemeral: true });
            const filter = interaction.options.getString('status') || 'OPEN';
            const filterArg = filter === 'ALL' ? null : filter;

            const cases = await db.listIaCases(filterArg, 20);
            if (!cases || cases.length === 0) {
                return interaction.followUp({ content: `📭 No Internal Affairs cases found matching filter: \`${filter}\`.` });
            }

            const lines = cases.map(c => 
                `• **\`${c.id}\`** | <@${c.target_user.id}> — \`${c.allegation.slice(0, 45)}...\` [**${c.status}**]`
            );

            const listEmbed = new EmbedBuilder()
                .setTitle(`📁 Internal Affairs Case Docket Registry (${filter})`)
                .setDescription(lines.join('\n\n'))
                .setColor(0x1A5276)
                .setFooter({ text: 'Use /ia-case view <case_id> for complete case history.' });

            return interaction.followUp({ embeds: [listEmbed] });
        }
    }
};
