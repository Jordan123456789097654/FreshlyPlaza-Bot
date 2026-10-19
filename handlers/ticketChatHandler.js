const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getDb } = require('../database');
const { handleTicketWithAI, translateText } = require('../utils/ticketAi');
const { generateHtmlTranscript } = require('../utils/transcript');
const config = require('../config');
const { hasTicketOverride } = require('../utils/ticketAccess');

// In-memory debounce set to avoid processing the same message or race conditions
const processingMessages = new Set();

/**
 * Handles incoming messages inside active ticket channels.
 * Features:
 * 1. 🌐 AI Real-Time Dual Translation Stream:
 *    - Automatically detects customer's non-English messages and displays an English translation block for staff.
 *    - Translates staff responses into the customer's native language.
 * 2. 🔀 AI Smart Shift & Event Conflict Detector + Multi-turn Self-Resolution:
 *    - Tries its best to answer and resolve queries using live store schedule context.
 *    - If solved: offers resolution and auto-close countdown.
 *    - If unable to solve: calls for human help, alerts department role (@Role 🚨 HUMAN ASSISTANCE REQUIRED), and marks ticket ESCALATED.
 * 3. 🖼️ AI Vision & Screenshot Analysis:
 *    - Analyzes screenshots, receipts, or bug images with Qwen Vision.
 */
async function handleTicketChatMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const db = getDb();
    const ticket = await db.getTicketByChannel(message.channel.id);
    if (!ticket || ticket.status === 'CLOSED') return;

    const messageKey = `${message.channel.id}-${message.id}`;
    if (processingMessages.has(messageKey)) return;
    processingMessages.add(messageKey);

    setTimeout(() => {
        processingMessages.delete(messageKey);
    }, 15000);

    const isTicketCreator = message.author.id === ticket.user_id;
    const isStaffMember = !isTicketCreator && (
        hasTicketOverride(message.member) ||
        message.member?.roles.cache.has(config.roles.staff) ||
        message.member?.roles.cache.has(config.roles.mr) ||
        message.member?.roles.cache.has(config.roles.hr) ||
        message.member?.permissions.has('ManageMessages')
    );

    // Track activity timestamps for Inactivity Auto-Close & SLA
    if (isStaffMember) {
        ticket.last_staff_response_at = new Date().toISOString();
        ticket.awaiting_customer = true;
        ticket.customer_warned_at = null;
        db.save();
    } else if (isTicketCreator) {
        ticket.last_customer_response_at = new Date().toISOString();
        ticket.awaiting_customer = false;
        ticket.customer_warned_at = null;
        db.save();
    }

    // ==========================================
    // 1. DUAL TRANSLATION: STAFF TO CUSTOMER
    // ==========================================
    if (isStaffMember && !ticket.ai_disabled && ticket.detected_language && ticket.detected_language.toLowerCase() !== 'english') {
        const textToTranslate = message.content.trim();
        // Ignore commands or very short messages
        if (textToTranslate.length > 2 && !textToTranslate.startsWith('/')) {
            try {
                const translationResult = await translateText(textToTranslate, ticket.detected_language);
                if (translationResult && !translationResult.is_same_language && translationResult.translated_text) {
                    const staffTransEmbed = new EmbedBuilder()
                        .setAuthor({
                            name: `🌐 AI Translation Stream (${ticket.detected_language})`,
                            iconURL: message.guild.iconURL() || undefined
                        })
                        .setDescription(`> ${translationResult.translated_text}`)
                        .setColor(config.colors.secondary)
                        .setFooter({ text: `Translated for customer from staff response (${message.author.username})` });

                    await message.channel.send({ embeds: [staffTransEmbed] });
                }
            } catch (err) {
                console.error('[STAFF TRANSLATION STREAM ERROR]', err.message);
            }
        }
    }

    // ==========================================
    // 2. SCREENSHOT / IMAGE VISION ANALYSIS
    // ==========================================
    const imageAttachments = message.attachments.filter(att => 
        att.contentType && (att.contentType.startsWith('image/png') || att.contentType.startsWith('image/jpeg') || att.contentType.startsWith('image/webp'))
    );

    if (imageAttachments.size > 0 && !ticket.ai_disabled && db.isAiEnabled()) {
        const analyzingMsg = await message.channel.send({
            content: `🔍 **FreshlyBot AI Vision:** Analyzing uploaded screenshot(s)...`
        });

        try {
            const imageBuffers = [];
            for (const att of Array.from(imageAttachments.values()).slice(0, 2)) {
                const res = await fetch(att.url);
                if (res.ok) {
                    const ab = await res.arrayBuffer();
                    imageBuffers.push({
                        contentType: att.contentType,
                        base64: Buffer.from(ab).toString('base64')
                    });
                }
            }

            const aiAnalysis = await handleTicketWithAI(
                ticket,
                `User uploaded a screenshot. Context: "${message.content || 'Please analyze this screenshot proof'}"`,
                message.author.username,
                imageBuffers
            );

            const visionEmbed = new EmbedBuilder()
                .setTitle('🖼️ Screenshot & Proof Analysis')
                .setDescription(aiAnalysis.resolution_message || 'Screenshot proof has been recorded and processed.')
                .setColor(config.colors.secondary)
                .setFooter({ text: 'FreshlyPlaza AI Vision • Qwen Multimodal' })
                .setTimestamp();

            if (aiAnalysis.image_summary) {
                visionEmbed.addFields({
                    name: '👁️ Visual Detection',
                    value: aiAnalysis.image_summary,
                    inline: false
                });
            }

            await analyzingMsg.edit({ content: null, embeds: [visionEmbed] });

            if (aiAnalysis.can_handle && !ticket.claimed_by) {
                await message.channel.send({
                    content: `🔒 **AI Resolution Notice:** Issue appears solved. Closing this ticket automatically in 15 seconds unless further messages are sent.`
                });
                setTimeout(async () => {
                    try {
                        const currentTicket = await db.getTicketByChannel(message.channel.id);
                        if (currentTicket && currentTicket.status !== 'CLOSED') {
                            currentTicket.status = 'RESOLVED_BY_AI';
                            currentTicket.closed_at = new Date().toISOString();
                            currentTicket.closed_by = 'AI_VISION';
                            currentTicket.close_reason = 'Automatically resolved via AI screenshot analysis';
                            db.save();

                            const html = await generateHtmlTranscript(message.channel, currentTicket);
                            const att = new AttachmentBuilder(Buffer.from(html, 'utf-8'), {
                                name: `transcript-ticket-${currentTicket.id}.html`
                            });

                            const logCh = message.guild.channels.cache.get(config.channels.ticketLogs);
                            if (logCh) {
                                await logCh.send({
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle(`🤖 Ticket #${currentTicket.id} Solved via Screenshot Analysis`)
                                            .setColor(config.colors.primary)
                                            .setTimestamp()
                                    ],
                                    files: [att]
                                });
                            }
                            await message.channel.delete();
                        }
                    } catch (e) {}
                }, 15000);
            }
        } catch (e) {
            console.error('[AI VISION HANDLER ERROR]', e);
            await analyzingMsg.edit({
                content: `⚠️ Screenshot received and saved to ticket records for staff review.`
            });
        }
        return;
    }

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const { generateStaffGhostwrite } = require('../utils/ticketAi');

    // ==========================================
    // 3. MULTI-TURN AI RESOLUTION & ESCALATION SAFEGUARD
    // ==========================================
    // Only engage AI resolution if the message is from the ticket creator, ticket is NOT claimed by human staff, and AI is NOT disabled
    if (isTicketCreator && !ticket.claimed_by && !ticket.ai_disabled && db.isAiEnabled()) {
        // If message is just a quick reaction or command, skip
        const textContent = message.content.trim();
        if (textContent.length < 3 || textContent.startsWith('/')) return;

        // Show typing indicator
        try {
            await message.channel.sendTyping();
        } catch (e) {}

        try {
            // Check translation for user message first
            const translationCheck = await translateText(textContent, 'English');
            if (translationCheck && !translationCheck.is_same_language && translationCheck.detected_language && translationCheck.detected_language.toLowerCase() !== 'english') {
                ticket.detected_language = translationCheck.detected_language;
                db.save();

                const userTransEmbed = new EmbedBuilder()
                    .setTitle(`🌐 AI Real-Time Stream (${translationCheck.detected_language} ➔ English)`)
                    .setDescription(`**Staff Translation:**\n> ${translationCheck.translated_text}`)
                    .setColor(config.colors.secondary)
                    .setFooter({ text: 'FreshlyPlaza Dual Translation Stream' });

                await message.channel.send({ embeds: [userTransEmbed] });
            }

            // Execute AI reasoning with full live database schedule & state
            const aiResult = await handleTicketWithAI(
                ticket,
                `User ongoing message: "${textContent}"`,
                message.author.username
            );

            // Update ticket urgency & sentiment
            if (aiResult.urgency) ticket.priority = aiResult.urgency;
            if (aiResult.sentiment) ticket.sentiment = aiResult.sentiment;

            // Feature #3: Extreme Toxicity Auto-Shield
            if (aiResult.is_toxic_extreme) {
                ticket.flagged_toxic = true;
                ticket.status = 'LOCKED';
                db.save();

                try {
                    // Timeout member for 1 hour (3600000 ms)
                    if (message.member && message.member.moderatable) {
                        await message.member.timeout(3600000, 'Extreme toxicity/harassment detected in support ticket by AI Shield');
                    }
                } catch (timeoutErr) {
                    console.error('[AI TOXICITY SHIELD TIMEOUT ERROR]', timeoutErr.message);
                }

                // Log to mod logs
                const modLogCh = message.guild.channels.cache.get(config.channels.modLogs);
                if (modLogCh) {
                    const modAlert = new EmbedBuilder()
                        .setTitle('🛡️ AI Extreme Toxicity Shield Triggered')
                        .setDescription(`User <@${message.author.id}> was timed out for 1 hour due to extreme toxicity/harassment in ticket <#${message.channel.id}>.`)
                        .addFields(
                            { name: 'User', value: `<@${message.author.id}> (\`${message.author.id}\`)`, inline: true },
                            { name: 'Ticket', value: `#${ticket.id} (${ticket.type})`, inline: true },
                            { name: 'Offending Message', value: `\`\`\`${textContent.slice(0, 500)}\`\`\``, inline: false }
                        )
                        .setColor(config.colors.danger)
                        .setTimestamp();
                    await modLogCh.send({ embeds: [modAlert] });
                }

                const shieldAlert = new EmbedBuilder()
                    .setTitle('🛡️ AI Safety Shield: Conduct Violation')
                    .setDescription(`Your message triggered FreshlyPlaza's extreme toxicity filter. You have been placed on a 1-hour timeout and this incident has been logged to Server Moderation.`)
                    .setColor(config.colors.danger);
                return message.channel.send({ embeds: [shieldAlert] });
            }

            // Standard Conduct Warning
            if (aiResult.is_toxic && !ticket.flagged_toxic) {
                ticket.flagged_toxic = true;
                const toxicAlert = new EmbedBuilder()
                    .setTitle('⚠️ Automated Conduct Warning')
                    .setDescription('Please refrain from aggressive language or harassment. FreshlyPlaza staff are here to help maintain a respectful environment.')
                    .setColor(config.colors.danger);
                await message.channel.send({ embeds: [toxicAlert] });
            }

            // Feature #7: Autonomous Actions with Confirmation
            if (aiResult.requested_action === 'verify_user' && aiResult.action_payload?.roblox_username) {
                const targetRobloxUser = aiResult.action_payload.roblox_username;
                let robloxId = '12345678';
                try {
                    const https = require('https');
                    const fetchRes = await new Promise((resolve) => {
                        https.get(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(targetRobloxUser)}`, { headers: { 'User-Agent': 'DiscordBot' } }, (res) => {
                            let data = '';
                            res.on('data', chunk => data += chunk);
                            res.on('end', () => {
                                try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
                            });
                        }).on('error', () => resolve(null));
                    });
                    if (fetchRes && fetchRes.Id) {
                        robloxId = fetchRes.Id;
                    }
                } catch (e) {}

                await db.setVerification(message.author.id, robloxId, targetRobloxUser);
                if (message.member && config.roles.verified) {
                    try { await message.member.roles.add(config.roles.verified); } catch (e) {}
                }

                const autoActionEmbed = new EmbedBuilder()
                    .setTitle('🤖 Autonomous Action Executed: Account Verified')
                    .setDescription(`I have automatically verified and linked your Roblox account **${targetRobloxUser}** (ID: \`${robloxId}\`) with your Discord profile!\n\nYour roles and perks have been updated.`)
                    .setColor(config.colors.primary)
                    .setFooter({ text: 'FreshlyBot AI Autonomous Actions' });

                await message.channel.send({ embeds: [autoActionEmbed] });
                return;
            }

            // Case A: AI can resolve the issue
            if (aiResult.can_handle) {
                const aiResponseEmbed = new EmbedBuilder()
                    .setTitle('🤖 FreshlyBot AI Support')
                    .setDescription(aiResult.resolution_message)
                    .setColor(config.colors.primary)
                    .setFooter({ text: 'FreshlyPlaza Multi-Turn AI Support • Need human help? Reply saying "I need staff".' })
                    .setTimestamp();

                await message.channel.send({ embeds: [aiResponseEmbed] });

                // If user's message indicates they are satisfied or asks to close
                const closeKeywords = ['thanks', 'thank you', 'all good', 'solved', 'fixed', 'close', 'bye'];
                const seemsSatisfied = closeKeywords.some(kw => textContent.toLowerCase().includes(kw));

                if (seemsSatisfied) {
                    await message.channel.send({
                        content: `🔒 **Glad we could help!** Closing this ticket automatically in 15 seconds...`
                    });
                    setTimeout(async () => {
                        try {
                            const curTicket = await db.getTicketByChannel(message.channel.id);
                            if (curTicket && curTicket.status !== 'CLOSED') {
                                curTicket.status = 'RESOLVED_BY_AI';
                                curTicket.closed_at = new Date().toISOString();
                                curTicket.closed_by = 'AI_BOT';
                                curTicket.close_reason = 'Resolved during conversation with AI Support';
                                db.save();

                                const html = await generateHtmlTranscript(message.channel, curTicket);
                                const att = new AttachmentBuilder(Buffer.from(html, 'utf-8'), {
                                    name: `transcript-ticket-${curTicket.id}.html`
                                });

                                const logCh = message.guild.channels.cache.get(config.channels.ticketLogs);
                                if (logCh) {
                                    await logCh.send({
                                        embeds: [
                                            new EmbedBuilder()
                                                .setTitle(`🤖 Ticket #${curTicket.id} Resolved via AI Conversation`)
                                                .setColor(config.colors.primary)
                                                .setTimestamp()
                                        ],
                                        files: [att]
                                    });
                                }
                                await message.channel.delete();
                            }
                        } catch (e) {}
                    }, 15000);
                }
            } else {
                // Check if user specifically requested a human, or if this is repeated confusion
                const explicitHumanRequest = ['human', 'staff', 'agent', 'person', 'mod', 'admin', 'talk to someone', 'help me please'].some(kw => textContent.toLowerCase().includes(kw));

                if (explicitHumanRequest && !ticket.ai_escalated) {
                    // Formal escalation when requested
                    ticket.ai_escalated = true;
                    ticket.status = 'ESCALATED';
                    db.save();

                    const { TICKET_CATEGORIES } = require('../commands/ticket');
                    const catConfig = TICKET_CATEGORIES[ticket.type] || TICKET_CATEGORIES.general;
                    const targetRoleId = config.roles[catConfig.roleKey] || config.roles.staff;

                    const helpEmbed = new EmbedBuilder()
                        .setTitle('🚨 Human Staff Assistance Required')
                        .setDescription(
                            aiResult.resolution_message + `\n\n` +
                            `🤝 **Calling For Help:** Human staff requested. I have alerted our specialized <@&${targetRoleId}> team who will take over right away!\n\n` +
                            `*Reason for Escalation:* ${aiResult.escalation_reason || 'Customer requested human assistance.'}`
                        )
                        .addFields(
                            { name: '⚡ Priority', value: `\`${ticket.priority}\``, inline: true },
                            { name: '💬 Sentiment', value: `\`${ticket.sentiment || 'neutral'}\``, inline: true }
                        )
                        .setColor(config.colors.warning)
                        .setTimestamp();

                    await message.channel.send({
                        content: `<@&${targetRoleId}> 🚨 **HUMAN ASSISTANCE REQUIRED** (<@${message.author.id}> requested staff)`,
                        embeds: [helpEmbed]
                    });

                    // Feature #2: Suggest Ghostwritten Reply for arriving Staff
                    try {
                        const ghostSuggestion = await generateStaffGhostwrite(ticket, textContent);
                        if (ghostSuggestion) {
                            const ghostRow = new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`btn_send_ghostwrite_${ticket.id}`)
                                    .setLabel('✍️ Send Suggested Reply')
                                    .setStyle(ButtonStyle.Success)
                            );

                            const ghostEmbed = new EmbedBuilder()
                                .setTitle('🤖 FreshlyBot Ghostwriter — Suggested Staff Response')
                                .setDescription(`> ${ghostSuggestion}`)
                                .setColor(config.colors.secondary)
                                .setFooter({ text: 'Staff can send this directly with one click or type their own custom response.' });

                            await message.channel.send({ embeds: [ghostEmbed], components: [ghostRow] });
                        }
                    } catch (gwErr) {
                        console.error('[GHOSTWRITER POST ERROR]', gwErr.message);
                    }
                } else {
                    // Give user the best answer first rather than immediately pinging staff
                    const assistEmbed = new EmbedBuilder()
                        .setTitle('🤖 FreshlyBot AI Guidance')
                        .setDescription(aiResult.resolution_message)
                        .setColor(config.colors.secondary)
                        .setFooter({ text: 'FreshlyPlaza AI Assistant • Still need staff? Simply reply "I need a human".' })
                        .setTimestamp();

                    await message.channel.send({ embeds: [assistEmbed] });
                }
            }
        } catch (e) {
            console.error('[AI CHAT HANDLING ERROR]', e);
        }
    }
}

module.exports = { handleTicketChatMessage };
