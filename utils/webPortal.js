const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getDb } = require('../database');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const WebPortal = {
    /**
     * Render the Public Appeal Form
     */
    renderAppealPage(error = null, success = null) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.storeName} • Ban & Punishment Appeal Portal</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #2ECC71;
            --primary-dark: #27ae60;
            --bg-dark: #090d16;
            --card-bg: rgba(22, 27, 46, 0.75);
            --border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --danger: #ef4444;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body {
            background: var(--bg-dark);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background-image: 
                radial-gradient(circle at top right, rgba(46, 204, 113, 0.12), transparent 40%),
                radial-gradient(circle at bottom left, rgba(52, 152, 219, 0.10), transparent 40%);
        }
        .appeal-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            backdrop-filter: blur(20px);
            max-width: 620px;
            width: 100%;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .header { text-align: center; margin-bottom: 28px; }
        .header h1 { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 8px; }
        .header p { color: var(--text-muted); font-size: 14px; }
        .badge {
            display: inline-block;
            background: rgba(46, 204, 113, 0.15);
            color: var(--primary);
            padding: 6px 14px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        }
        .alert {
            padding: 14px 18px;
            border-radius: 12px;
            margin-bottom: 20px;
            font-size: 14px;
            font-weight: 500;
        }
        .alert-error { background: rgba(239, 68, 68, 0.15); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
        .alert-success { background: rgba(46, 204, 113, 0.15); color: #86efac; border: 1px solid rgba(46, 204, 113, 0.3); }
        .form-group { margin-bottom: 20px; }
        label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; }
        input[type="text"], select, textarea {
            width: 100%;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 14px 16px;
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: all 0.2s;
        }
        input:focus, select:focus, textarea:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(46, 204, 113, 0.2);
        }
        textarea { resize: vertical; min-height: 110px; }
        .btn-submit {
            width: 100%;
            background: var(--primary);
            color: #05160d;
            font-weight: 700;
            border: none;
            padding: 15px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 15px;
            transition: background 0.2s;
            margin-top: 10px;
        }
        .btn-submit:hover { background: var(--primary-dark); }
        .footer-note { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="appeal-card">
        <div class="header">
            <span class="badge">Official Moderation Portal</span>
            <h1>⚖️ Punishment Appeal</h1>
            <p>Submit a formal appeal regarding your Grandway Shopping Discord or Roblox punishment.</p>
        </div>

        ${error ? `<div class="alert alert-error">⚠️ ${escapeHtml(error)}</div>` : ''}
        ${success ? `<div class="alert alert-success">✅ ${escapeHtml(success)}</div>` : ''}

        <form method="POST" action="/appeal">
            <div class="form-group">
                <label for="discordId">Discord User ID or Tag *</label>
                <input type="text" id="discordId" name="discordId" placeholder="e.g. 1558519063649587301 or Username" required>
            </div>

            <div class="form-group">
                <label for="robloxUsername">Roblox Username *</label>
                <input type="text" id="robloxUsername" name="robloxUsername" placeholder="e.g. JordanDanielsGames" required>
            </div>

            <div class="form-group">
                <label for="appealType">Punishment Type *</label>
                <select id="appealType" name="appealType" required>
                    <option value="Discord Server Ban">Discord Server Ban</option>
                    <option value="Store / In-Game Ban">Store / In-Game Supermarket Ban</option>
                    <option value="Store Mute / Timeout">Store Mute / Timeout</option>
                    <option value="Staff Activity Forfeiture / Demotion">Staff Activity Forfeiture / Demotion</option>
                </select>
            </div>

            <div class="form-group">
                <label for="reason">Why were you punished? *</label>
                <textarea id="reason" name="reason" placeholder="Briefly state what occurred that led to the punishment." required></textarea>
            </div>

            <div class="form-group">
                <label for="statement">Why should Grandway Leadership approve this appeal? *</label>
                <textarea id="statement" name="statement" placeholder="Explain your perspective and why this punishment should be reconsidered." required></textarea>
            </div>

            <div class="form-group">
                <label for="prevention">What actions will you take to prevent this from happening again? *</label>
                <textarea id="prevention" name="prevention" placeholder="Describe how you will adhere to all store guidelines moving forward." required></textarea>
            </div>

            <button type="submit" class="btn-submit">Submit Appeal to Leadership</button>
        </form>

        <p class="footer-note">All submissions are reviewed directly by the Director of Human Resources & Trust & Safety team.</p>
    </div>
</body>
</html>`;
    },

    /**
     * Render the Live Staff Leaderboard
     */
    renderLeaderboardPage() {
        const db = getDb();
        const data = db.getData();
        const staffActivity = data.staff_activity || {};
        const staffProfiles = data.staff_profiles || {};

        // Sort by shifts hosted
        const sortedHosts = Object.entries(staffActivity)
            .map(([userId, stats]) => ({
                userId,
                shiftsHosted: stats.shifts_hosted || 0,
                shiftsAttended: stats.shifts_attended || 0,
                trainingsHosted: stats.trainings_hosted || 0,
                roleName: staffProfiles[userId]?.roleName || 'Colleague'
            }))
            .sort((a, b) => b.shiftsHosted - a.shiftsHosted)
            .slice(0, 10);

        // Sort by shifts attended
        const sortedAttended = Object.entries(staffActivity)
            .map(([userId, stats]) => ({
                userId,
                shiftsAttended: stats.shifts_attended || 0,
                roleName: staffProfiles[userId]?.roleName || 'Colleague'
            }))
            .sort((a, b) => b.shiftsAttended - a.shiftsAttended)
            .slice(0, 10);

        const hostRows = sortedHosts.map((h, i) => `
            <tr>
                <td class="rank-num">#${i + 1}</td>
                <td class="colleague-info"><span class="avatar-placeholder">👤</span> <@${h.userId}></td>
                <td><span class="role-pill">${escapeHtml(h.roleName)}</span></td>
                <td class="highlight-val">${h.shiftsHosted}</td>
                <td>${h.trainingsHosted}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="empty-text">No shift host logs recorded yet.</td></tr>';

        const attendRows = sortedAttended.map((a, i) => `
            <tr>
                <td class="rank-num">#${i + 1}</td>
                <td class="colleague-info"><span class="avatar-placeholder">🛒</span> <@${a.userId}></td>
                <td><span class="role-pill">${escapeHtml(a.roleName)}</span></td>
                <td class="highlight-val">${a.shiftsAttended}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="empty-text">No attendance records logged yet.</td></tr>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.storeName} • Staff Colleague Leaderboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #2ECC71;
            --secondary: #3498DB;
            --bg-dark: #0b0f19;
            --card-bg: rgba(22, 27, 46, 0.7);
            --border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body {
            background: var(--bg-dark);
            color: var(--text-main);
            min-height: 100vh;
            padding: 40px 20px;
            background-image: 
                radial-gradient(circle at top center, rgba(46, 204, 113, 0.12), transparent 50%);
        }
        .container { max-width: 1000px; margin: 0 auto; }
        .hero { text-align: center; margin-bottom: 40px; }
        .hero h1 { font-size: 32px; font-weight: 800; margin-bottom: 8px; }
        .hero p { color: var(--text-muted); font-size: 15px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
        .panel {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 28px;
            backdrop-filter: blur(16px);
        }
        .panel-title { font-size: 18px; font-weight: 700; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 12px 10px; font-size: 12px; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); }
        td { padding: 14px 10px; font-size: 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
        .rank-num { font-weight: 800; color: var(--primary); }
        .highlight-val { font-weight: 800; color: #fff; }
        .role-pill { background: rgba(52, 152, 219, 0.15); color: #60a5fa; padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; }
        .empty-text { text-align: center; color: var(--text-muted); padding: 30px; font-style: italic; }
        .nav-bar { display: flex; justify-content: center; gap: 16px; margin-top: 36px; }
        .nav-btn {
            background: rgba(255, 255, 255, 0.06);
            color: #fff;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 600;
            border: 1px solid var(--border);
            transition: all 0.2s;
        }
        .nav-btn:hover { background: rgba(255, 255, 255, 0.12); }
    </style>
</head>
<body>
    <div class="container">
        <div class="hero">
            <h1>🏆 Grandway Colleague Leaderboard</h1>
            <p>Official shift hosting and customer support performance metrics</p>
        </div>

        <div class="grid">
            <div class="panel">
                <div class="panel-title">⭐ Top Shift Leaders (Hosted)</div>
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Colleague</th>
                            <th>Role</th>
                            <th>Shifts</th>
                            <th>Trainings</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${hostRows}
                    </tbody>
                </table>
            </div>

            <div class="panel">
                <div class="panel-title">🛒 Top Store Attendees</div>
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Colleague</th>
                            <th>Role</th>
                            <th>Attended</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${attendRows}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="nav-bar">
            <a href="/appeal" class="nav-btn">⚖️ Appeal Portal</a>
            <a href="/staff" class="nav-btn">🛡️ Staff Web Dashboard</a>
        </div>
    </div>
</body>
</html>`;
    },

    /**
     * Render the Staff Management Dashboard & ModMail Live Feed
     */
    renderStaffDashboard(tokenAuth = false, activeTickets = [], metrics = {}) {
        const ticketRows = activeTickets.map(t => `
            <div class="ticket-card" id="ticket-${t.id}">
                <div class="ticket-header">
                    <span class="ticket-id">#${t.id}</span>
                    <span class="category-badge category-${t.type || 'general'}">${(t.type || 'GENERAL').toUpperCase()}</span>
                    <span class="ticket-user">👤 ${escapeHtml(t.user_tag || t.user_id)}</span>
                </div>
                <div class="ticket-meta">
                    <span>Opened: ${new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>Channel: #${escapeHtml(t.channel_name || t.channel_id)}</span>
                    <span>Staff Notes: ${(t.notes || []).length}</span>
                </div>
                <div class="ticket-actions">
                    <button class="btn-action btn-reply" onclick="openReplyModal(${t.id}, '${escapeHtml(t.user_tag || t.user_id)}')">💬 Reply to Customer</button>
                    <a href="/transcript/${t.id}" target="_blank" class="btn-action btn-view">📄 View Live Chat</a>
                    <button class="btn-action btn-close" onclick="closeTicket(${t.id})">🔒 Close</button>
                </div>
            </div>
        `).join('') || '<div class="empty-box">🎉 No active ModMail tickets in queue right now! All customer requests are resolved.</div>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.storeName} • Staff Command Portal</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #2ECC71;
            --primary-dark: #27ae60;
            --bg-dark: #080b12;
            --sidebar-bg: #0f1422;
            --card-bg: rgba(21, 27, 46, 0.7);
            --border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --danger: #ef4444;
            --warning: #f59e0b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background: var(--bg-dark); color: var(--text-main); min-height: 100vh; display: flex; }
        .sidebar {
            width: 260px;
            background: var(--sidebar-bg);
            border-right: 1px solid var(--border);
            padding: 28px 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }
        .brand { font-size: 18px; font-weight: 800; color: #fff; display: flex; align-items: center; gap: 8px; }
        .nav-links { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
        .nav-item {
            padding: 12px 14px;
            border-radius: 10px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.2s;
        }
        .nav-item.active, .nav-item:hover { background: rgba(46, 204, 113, 0.12); color: var(--primary); }
        .main-content { flex: 1; padding: 36px 40px; overflow-y: auto; }
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px; }
        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 32px; }
        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            padding: 22px;
            border-radius: 16px;
        }
        .stat-num { font-size: 28px; font-weight: 800; color: #fff; margin-top: 6px; }
        .stat-label { font-size: 13px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .section-title { font-size: 20px; font-weight: 700; margin-bottom: 18px; }
        .ticket-list { display: flex; flex-direction: column; gap: 14px; }
        .ticket-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
        }
        .ticket-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .ticket-id { font-weight: 800; color: var(--primary); font-size: 15px; }
        .category-badge { padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; }
        .category-general { background: rgba(52, 152, 219, 0.2); color: #60a5fa; }
        .category-report { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .category-management { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .category-technical { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
        .category-appeals { background: rgba(20, 184, 166, 0.2); color: #2dd4bf; }
        .ticket-user { font-weight: 700; color: #fff; font-size: 14px; }
        .ticket-meta { font-size: 13px; color: var(--text-muted); display: flex; gap: 16px; }
        .ticket-actions { display: flex; gap: 10px; }
        .btn-action {
            padding: 10px 16px;
            border-radius: 10px;
            border: none;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s;
        }
        .btn-reply { background: var(--primary); color: #05160d; }
        .btn-reply:hover { background: var(--primary-dark); }
        .btn-view { background: rgba(255, 255, 255, 0.08); color: #fff; }
        .btn-view:hover { background: rgba(255, 255, 255, 0.15); }
        .btn-close { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
        .btn-close:hover { background: rgba(239, 68, 68, 0.3); }
        .empty-box { background: var(--card-bg); border: 1px dashed var(--border); padding: 40px; border-radius: 16px; text-align: center; color: var(--text-muted); }

        /* Modal */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .modal {
            background: #111726;
            border: 1px solid var(--border);
            border-radius: 18px;
            max-width: 500px;
            width: 100%;
            padding: 28px;
        }
        .modal-title { font-size: 18px; font-weight: 800; margin-bottom: 12px; }
        .modal textarea {
            width: 100%;
            background: rgba(15, 23, 42, 0.8);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 14px;
            color: #fff;
            min-height: 120px;
            margin: 14px 0;
            outline: none;
        }
        .modal-buttons { display: flex; justify-content: flex-end; gap: 10px; }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="brand">🛒 Grandway Utils</div>
        <div class="nav-links">
            <a href="/staff" class="nav-item active">💬 Live ModMail Hub</a>
            <a href="/leaderboard" class="nav-item">🏆 Colleague Leaderboards</a>
            <a href="/appeal" class="nav-item">⚖️ Moderation Appeals</a>
            <a href="/status" class="nav-item">📊 System Health</a>
        </div>
    </div>

    <div class="main-content">
        <div class="top-bar">
            <div>
                <h1>🛡️ Staff ModMail Command Center</h1>
                <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">Real-time customer conversation relay & department management</p>
            </div>
            <div>
                <button class="btn-action btn-view" onclick="location.reload()">🔄 Refresh Feed</button>
            </div>
        </div>

        <div class="stat-grid">
            <div class="stat-card">
                <div class="stat-label">Active ModMail Threads</div>
                <div class="stat-num">${activeTickets.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Store Tickets</div>
                <div class="stat-num">${metrics.totalTickets || 0}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Avg Wait Time</div>
                <div class="stat-num">${metrics.avgWait || '< 2m'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">System Uptime</div>
                <div class="stat-num">${Math.floor((process.uptime() || 0) / 3600)}h</div>
            </div>
        </div>

        <div class="section-title">Active Customer Support Threads</div>
        <div class="ticket-list">
            ${ticketRows}
        </div>
    </div>

    <!-- Reply Modal -->
    <div class="modal-overlay" id="replyModal">
        <div class="modal">
            <div class="modal-title" id="modalTarget">💬 Reply to Customer</div>
            <p style="font-size: 13px; color: var(--text-muted);">This message will be instantly delivered to the user's Discord Direct Messages (DMs).</p>
            <input type="hidden" id="modalTicketId">
            <textarea id="modalReplyText" placeholder="Type your official support response here..."></textarea>
            <div style="margin-bottom: 14px;">
                <label style="font-size: 13px; color: #cbd5e1; cursor: pointer;">
                    <input type="checkbox" id="modalIsAnon" checked> Send Anonymously as Grandway ModMail Team
                </label>
            </div>
            <div class="modal-buttons">
                <button class="btn-action btn-view" onclick="closeReplyModal()">Cancel</button>
                <button class="btn-action btn-reply" onclick="submitReply()">Send to DMs</button>
            </div>
        </div>
    </div>

    <script>
        function openReplyModal(ticketId, username) {
            document.getElementById('modalTicketId').value = ticketId;
            document.getElementById('modalTarget').innerText = '💬 Reply to ' + username;
            document.getElementById('modalReplyText').value = '';
            document.getElementById('replyModal').style.display = 'flex';
        }

        function closeReplyModal() {
            document.getElementById('replyModal').style.display = 'none';
        }

        async function submitReply() {
            const ticketId = document.getElementById('modalTicketId').value;
            const text = document.getElementById('modalReplyText').value.trim();
            const isAnon = document.getElementById('modalIsAnon').checked;
            if (!text) return alert('Please enter a response.');

            try {
                const res = await fetch('/api/staff/reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId, text, isAnon })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ Response successfully delivered to customer DMs!');
                    closeReplyModal();
                    location.reload();
                } else {
                    alert('❌ Error: ' + (data.error || 'Failed to dispatch'));
                }
            } catch (e) {
                alert('⚠️ Failed to contact server: ' + e.message);
            }
        }

        async function closeTicket(ticketId) {
            if (!confirm('Are you sure you want to close ModMail #' + ticketId + '? This will archive the thread and dispatch a transcript to the customer.')) return;
            try {
                const res = await fetch('/api/staff/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId, reason: 'Closed via Staff Web Dashboard' })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ Ticket #' + ticketId + ' closed and archived!');
                    location.reload();
                } else {
                    alert('❌ Error: ' + (data.error || 'Failed to close'));
                }
            } catch (e) {
                alert('⚠️ Error closing ticket: ' + e.message);
            }
        }
    </script>
</body>
</html>`;
    }
};

module.exports = WebPortal;
