const config = require('../config');

/**
 * Clean HTML Transcript Generator for Grandway Shopping Ticket Channels
 * Generates an interactive Discord-like HTML transcript with avatars, timestamps, and embeds.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function generateHtmlTranscript(channel, ticket, messages = null) {
    if (!messages) {
        try {
            const fetched = await channel.messages.fetch({ limit: 100 });
            messages = Array.from(fetched.values()).reverse();
        } catch (e) {
            messages = [];
        }
    }

    const ticketId = ticket ? ticket.id : 'N/A';
    const ticketType = ticket ? (ticket.type || 'General').toUpperCase() : 'SUPPORT';
    const createdAt = ticket ? new Date(ticket.created_at).toLocaleString() : new Date().toLocaleString();
    const closedAt = new Date().toLocaleString();

    let messagesHtml = '';
    for (const msg of messages) {
        const authorTag = escapeHtml(msg.author.tag || msg.author.username);
        const authorAvatar = msg.author.displayAvatarURL({ extension: 'png', size: 64 });
        const isBot = msg.author.bot ? '<span class="bot-badge">BOT</span>' : '';
        const timestamp = new Date(msg.createdTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const content = escapeHtml(msg.content).replace(/\n/g, '<br>');

        let attachmentsHtml = '';
        if (msg.attachments && msg.attachments.size > 0) {
            attachmentsHtml = '<div class="attachments">' + 
                Array.from(msg.attachments.values()).map(att => {
                    const isImg = att.contentType && att.contentType.startsWith('image/');
                    if (isImg) {
                        return `<div class="attachment-item"><a href="${escapeHtml(att.url)}" target="_blank"><img src="${escapeHtml(att.url)}" class="attachment-img" alt="Attachment" /></a></div>`;
                    }
                    return `<div class="attachment-item"><a href="${escapeHtml(att.url)}" target="_blank" class="attachment-link">📎 ${escapeHtml(att.name)}</a></div>`;
                }).join('') + '</div>';
        }

        let embedsHtml = '';
        if (msg.embeds && msg.embeds.length > 0) {
            embedsHtml = '<div class="embeds">' + 
                msg.embeds.map(emb => {
                    const title = emb.title ? `<div class="embed-title">${escapeHtml(emb.title)}</div>` : '';
                    const desc = emb.description ? `<div class="embed-desc">${escapeHtml(emb.description).replace(/\n/g, '<br>')}</div>` : '';
                    let fieldsHtml = '';
                    if (emb.fields && emb.fields.length > 0) {
                        fieldsHtml = '<div class="embed-fields">' + emb.fields.map(f => 
                            `<div class="embed-field"><span class="embed-field-name">${escapeHtml(f.name)}:</span> <span class="embed-field-val">${escapeHtml(f.value)}</span></div>`
                        ).join('') + '</div>';
                    }
                    return `<div class="embed-box">${title}${desc}${fieldsHtml}</div>`;
                }).join('') + '</div>';
        }

        messagesHtml += `
        <div class="message-row">
            <img src="${authorAvatar}" class="avatar" alt="${authorTag}" />
            <div class="message-body">
                <div class="message-header">
                    <span class="author-name">${authorTag}</span>
                    ${isBot}
                    <span class="timestamp">${timestamp}</span>
                </div>
                ${content ? `<div class="message-content">${content}</div>` : ''}
                ${attachmentsHtml}
                ${embedsHtml}
            </div>
        </div>
        `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Grandway Shopping Ticket #${ticketId} Transcript</title>
    <style>
        body {
            background-color: #313338;
            color: #dbdee1;
            font-family: 'gg sans', 'Noto Sans', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 24px;
        }
        .header-box {
            background: #2b2d31;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 24px;
            border-left: 6px solid #2ecc71;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header-title {
            font-size: 20px;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 6px;
        }
        .header-meta {
            font-size: 13px;
            color: #949ba4;
        }
        .badge {
            background: #2ecc71;
            color: #000;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
        }
        .messages-container {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .message-row {
            display: flex;
            gap: 16px;
            padding: 4px 0;
        }
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .message-body {
            flex-grow: 1;
        }
        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        .author-name {
            font-weight: 600;
            color: #f2f3f5;
            font-size: 15px;
        }
        .bot-badge {
            background: #5865f2;
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 3px;
        }
        .timestamp {
            font-size: 12px;
            color: #949ba4;
        }
        .message-content {
            font-size: 14px;
            line-height: 1.4;
            color: #dbdee1;
            word-break: break-word;
        }
        .attachment-img {
            max-width: 400px;
            max-height: 300px;
            border-radius: 8px;
            margin-top: 8px;
        }
        .attachment-link {
            color: #00a8fc;
            text-decoration: none;
            font-size: 13px;
            display: inline-block;
            margin-top: 6px;
        }
        .embed-box {
            background: #2b2d31;
            border-left: 4px solid #3498db;
            border-radius: 4px;
            padding: 12px;
            margin-top: 8px;
            max-width: 520px;
        }
        .embed-title {
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 6px;
            font-size: 14px;
        }
        .embed-desc {
            font-size: 13px;
            color: #dbdee1;
            margin-bottom: 8px;
        }
        .embed-field {
            font-size: 12px;
            margin-top: 4px;
        }
        .embed-field-name {
            font-weight: 600;
            color: #b5bac1;
        }
        .embed-field-val {
            color: #dbdee1;
        }
        .footer {
            margin-top: 32px;
            text-align: center;
            font-size: 12px;
            color: #80848e;
            border-top: 1px solid #3f4147;
            padding-top: 16px;
        }
    </style>
</head>
<body>
    <div class="header-box">
        <div>
            <div class="header-title">🏪 Grandway Shopping — Ticket #${ticketId} Transcript</div>
            <div class="header-meta">Category: <strong>${ticketType}</strong> • Created: ${createdAt} • Closed: ${closedAt}</div>
        </div>
        <span class="badge">Official Archive</span>
    </div>
    <div class="messages-container">
        ${messagesHtml}
    </div>
    <div class="footer">
        Generated by Grandway Shopping Automated Support System • All rights reserved.
    </div>
</body>
</html>`;
}

module.exports = { generateHtmlTranscript };
