const config = require('../config');
const { getDb } = require('../database');

/**
 * Escapes HTML characters for safe rendering
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

/**
 * Generates interactive web-hosted HTML transcript
 */
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
            embedsHtml = msg.embeds.map(emb => {
                const title = emb.title ? `<div class="embed-title">${escapeHtml(emb.title)}</div>` : '';
                const desc = emb.description ? `<div class="embed-desc">${escapeHtml(emb.description).replace(/\n/g, '<br>')}</div>` : '';
                const colorHex = emb.color ? '#' + emb.color.toString(16).padStart(6, '0') : '#2ECC71';
                return `<div class="embed-card" style="border-left-color: ${colorHex};">${title}${desc}</div>`;
            }).join('');
        }

        messagesHtml += `
        <div class="message-row">
            <img src="${authorAvatar}" class="avatar" alt="${authorTag}" />
            <div class="message-content">
                <div class="message-header">
                    <span class="username">${authorTag}</span>
                    ${isBot}
                    <span class="timestamp">${timestamp}</span>
                </div>
                ${content ? `<div class="text">${content}</div>` : ''}
                ${attachmentsHtml}
                ${embedsHtml}
            </div>
        </div>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ModMail #${ticketId} Transcript — Grandway Shopping</title>
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #334155;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --accent: #2ecc71;
            --border: #475569;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-main);
            padding: 24px;
            display: flex;
            justify-content: center;
        }
        .container {
            width: 100%;
            max-width: 950px;
            background-color: var(--bg-secondary);
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--border);
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
        }
        .header {
            background: linear-gradient(135deg, #1e293b, #0f172a);
            padding: 24px 32px;
            border-bottom: 2px solid var(--accent);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
        }
        .header-left h1 {
            font-size: 22px;
            color: #ffffff;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header-left p {
            color: var(--text-muted);
            font-size: 14px;
            margin-top: 4px;
        }
        .badge {
            background-color: var(--accent);
            color: #0f172a;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 13px;
        }
        .meta-bar {
            background-color: rgba(15, 23, 42, 0.5);
            padding: 12px 32px;
            font-size: 13px;
            color: var(--text-muted);
            display: flex;
            gap: 24px;
            border-bottom: 1px solid var(--border);
            flex-wrap: wrap;
        }
        .messages-container {
            padding: 24px 32px;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }
        .message-row {
            display: flex;
            gap: 16px;
        }
        .avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background-color: var(--bg-card);
            flex-shrink: 0;
        }
        .message-content {
            flex-grow: 1;
        }
        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
        }
        .username {
            font-weight: 600;
            color: #ffffff;
            font-size: 15px;
        }
        .bot-badge {
            background-color: #5865f2;
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .timestamp {
            font-size: 12px;
            color: var(--text-muted);
        }
        .text {
            font-size: 14.5px;
            line-height: 1.5;
            color: #e2e8f0;
            word-break: break-word;
        }
        .embed-card {
            margin-top: 8px;
            background-color: var(--bg-card);
            border-left: 4px solid var(--accent);
            border-radius: 4px;
            padding: 12px 16px;
            max-width: 650px;
        }
        .embed-title {
            font-weight: 700;
            margin-bottom: 6px;
            color: #ffffff;
        }
        .embed-desc {
            font-size: 13.5px;
            color: #cbd5e1;
            line-height: 1.4;
        }
        .attachments {
            margin-top: 8px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        .attachment-img {
            max-width: 320px;
            max-height: 240px;
            border-radius: 8px;
            border: 1px solid var(--border);
        }
        .attachment-link {
            color: #38bdf8;
            text-decoration: none;
            font-size: 13px;
        }
        .footer {
            text-align: center;
            padding: 16px;
            font-size: 12px;
            color: var(--text-muted);
            border-top: 1px solid var(--border);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-left">
                <h1>🛒 Grandway Shopping ModMail</h1>
                <p>Official Online Ticket Transcript & Audit Archive</p>
            </div>
            <div class="badge">${ticketType} TICKET #${ticketId}</div>
        </div>
        <div class="meta-bar">
            <span><strong>Created:</strong> ${createdAt}</span>
            <span><strong>Closed:</strong> ${closedAt}</span>
            <span><strong>Messages:</strong> ${messages.length}</span>
            <span><strong>Status:</strong> Resolved</span>
        </div>
        <div class="messages-container">
            ${messagesHtml || '<p style="color: var(--text-muted); font-style: italic;">No messages recorded in this thread.</p>'}
        </div>
        <div class="footer">
            &copy; ${new Date().getFullYear()} Grandway Shopping • Secure ModMail Web Archives
        </div>
    </div>
</body>
</html>`;
}

/**
 * Saves transcript to the database / memory and returns web URL
 */
async function saveTranscriptAndGetUrl(ticketId, htmlContent) {
    const db = getDb();
    const data = db.getData();
    if (!data.transcripts) data.transcripts = {};
    data.transcripts[String(ticketId)] = {
        html: htmlContent,
        updatedAt: new Date().toISOString()
    };
    db.save();

    const baseUrl = config.webDashboardUrl || process.env.WEB_DASHBOARD_URL || 'http://fi14.bot-hosting.cloud:26134';
    return `${baseUrl}/transcript/${ticketId}`;
}

module.exports = { generateHtmlTranscript, saveTranscriptAndGetUrl, escapeHtml };
