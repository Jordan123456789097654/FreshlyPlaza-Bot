const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getDb } = require('../database');
const { generateHtmlTranscript } = require('./transcript');
const config = require('../config');

const INACTIVITY_WARN_HOURS = 12;
const INACTIVITY_CLOSE_HOURS = 24;

/**
 * Checks open tickets and alerts/closes inactive channels where customer stopped replying
 */
async function checkInactiveTickets(client) {
    const db = getDb();
    const data = db.getData();
    if (!data.tickets || data.tickets.length === 0) return;

    const openTickets = data.tickets.filter(t => t.status !== 'CLOSED');
    const now = Date.now();

    for (const ticket of openTickets) {
        if (!ticket.awaiting_customer || !ticket.last_staff_response_at) continue;

        const staffReplyTime = new Date(ticket.last_staff_response_at).getTime();
        const hoursSinceStaffReply = (now - staffReplyTime) / (1000 * 60 * 60);

        try {
            const channel = client.channels.cache.get(ticket.channel_id) || await client.channels.fetch(ticket.channel_id).catch(() => null);
            if (!channel) continue;

            // Step 1: Warning after 12 hours
            if (hoursSinceStaffReply >= INACTIVITY_WARN_HOURS && hoursSinceStaffReply < INACTIVITY_CLOSE_HOURS && !ticket.customer_warned_at) {
                ticket.customer_warned_at = new Date().toISOString();
                db.save();

                const warnEmbed = new EmbedBuilder()
                    .setTitle('⏳ Inactive Support Ticket — Response Reminder')
                    .setDescription(
                        `Hello <@${ticket.user_id}>,\n\n` +
                        `Our staff replied to this ticket over **${Math.floor(hoursSinceStaffReply)} hours ago**. Are you still experiencing this issue or do you need further assistance?\n\n` +
                        `⚠️ **Automatic Close Notice:** If no response is received within the next **12 hours**, this ticket will automatically be resolved and closed.`
                    )
                    .setColor(config.colors.warning)
                    .setFooter({ text: 'Grandway Shopping Automated Inactivity Monitor' })
                    .setTimestamp();

                await channel.send({ content: `<@${ticket.user_id}>`, embeds: [warnEmbed] });
            } 
            // Step 2: Auto-close after 24 hours
            else if (hoursSinceStaffReply >= INACTIVITY_CLOSE_HOURS && ticket.customer_warned_at) {
                ticket.status = 'CLOSED';
                ticket.closed_at = new Date().toISOString();
                ticket.closed_by = 'AUTO_INACTIVITY_MONITOR';
                ticket.close_reason = 'Automatically closed due to 24 hours of customer inactivity after staff response.';
                db.save();

                const closeEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Closed — Inactivity')
                    .setDescription(`This ticket has been automatically closed due to 24 hours of inactivity following our staff response. You may open a new ticket anytime if you still require help!`)
                    .setColor(config.colors.danger)
                    .setTimestamp();

                await channel.send({ embeds: [closeEmbed] });

                try {
                    const html = await generateHtmlTranscript(channel, ticket);
                    const att = new AttachmentBuilder(Buffer.from(html, 'utf-8'), {
                        name: `transcript-ticket-${ticket.id}.html`
                    });

                    const logCh = client.channels.cache.get(config.channels.ticketLogs);
                    if (logCh) {
                        await logCh.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle(`🔒 Ticket #${ticket.id} Closed (Inactivity)`)
                                    .addFields(
                                        { name: '👤 Creator', value: `<@${ticket.user_id}>`, inline: true },
                                        { name: '📋 Category', value: ticket.type.toUpperCase(), inline: true },
                                        { name: '⏱️ Inactivity', value: '24+ Hours No Reply', inline: true }
                                    )
                                    .setColor(config.colors.danger)
                                    .setTimestamp()
                            ],
                            files: [att]
                        });
                    }

                    setTimeout(async () => {
                        try {
                            await channel.delete();
                        } catch (e) {}
                    }, 5000);
                } catch (e) {
                    console.error('[INACTIVITY TRANSCRIPT ERROR]', e);
                }
            }
        } catch (err) {
            console.error(`[INACTIVITY MONITOR ERROR] Ticket #${ticket.id}:`, err.message);
        }
    }
}

module.exports = { checkInactiveTickets };
