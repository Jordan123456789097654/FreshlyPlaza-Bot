const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getDb } = require('../database');
const { SUPPORT_TAGS, buildTicketPanelEmbed } = require('../commands/ticket');

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

    renderLeaderboardPage() {
        const db = getDb();
        const data = db.getData();
        const staffActivity = data.staff_activity || {};
        const staffProfiles = data.staff_profiles || {};

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
     * Render the Staff Management Dashboard & ModMail Live Feed with Chat Drawer, Tags, Blacklist, Priority, Notes, and Wait-Time Config
     */
    renderStaffDashboard(tokenAuth = false, activeTickets = [], allTickets = [], settings = {}) {
        const snippetOptions = Object.entries(SUPPORT_TAGS).map(([k, t]) => `
            <option value="${escapeHtml(k)}">${escapeHtml(t.emoji + ' ' + t.title)}</option>
        `).join('');

        const configuredWait = settings.custom_wait_time || '';

        const ticketCards = activeTickets.map(t => {
            const priorityClass = t.priority === 'URGENT' ? 'prio-urgent' : (t.priority === 'HIGH' ? 'prio-high' : 'prio-normal');
            const priorityLabel = t.priority || 'NORMAL';

            return `
            <div class="ticket-card ${priorityClass}" id="ticket-${t.id}" data-id="${t.id}" data-user="${escapeHtml((t.user_tag || t.user_id).toLowerCase())}" data-category="${escapeHtml((t.type || 'general').toLowerCase())}">
                <div class="ticket-header">
                    <span class="ticket-id">#${t.id}</span>
                    <span class="category-badge category-${t.type || 'general'}">${(t.type || 'GENERAL').toUpperCase()}</span>
                    <span class="priority-badge ${priorityClass}">${priorityLabel}</span>
                    <span class="ticket-user">👤 ${escapeHtml(t.user_tag || t.user_id)}</span>
                </div>
                <div class="ticket-meta">
                    <span>Opened: ${new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>Channel: #${escapeHtml(t.channel_name || t.channel_id)}</span>
                    <span>Notes: ${(t.notes || []).length}</span>
                </div>
                <div class="ticket-actions">
                    <button class="btn-action btn-chat" onclick="openChatDrawer(${t.id}, '${escapeHtml(t.user_tag || t.user_id)}', '${t.user_id}', '${t.type || 'general'}', '${priorityLabel}')">💬 Live Panel Chat</button>
                    <a href="/transcript/${t.id}" target="_blank" class="btn-action btn-view-transcript">📄 View Live Transcript</a>
                    <button class="btn-action btn-transfer" onclick="openTransferModal(${t.id})">🔄 Transfer</button>
                    <button class="btn-action btn-prio" onclick="togglePriority(${t.id})">⭐ Priority</button>
                    <button class="btn-action btn-blacklist" onclick="blacklistUser('${t.user_id}', '${escapeHtml(t.user_tag || t.user_id)}')">🚫 Blacklist</button>
                    <button class="btn-action btn-close" onclick="closeTicket(${t.id})">🔒 Close</button>
                </div>
            </div>
        `;
        }).join('') || '<div class="empty-box">🎉 No active ModMail tickets in queue right now! All customer requests are resolved.</div>';

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
            --secondary: #3498DB;
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
        body { background: var(--bg-dark); color: var(--text-main); min-height: 100vh; display: flex; overflow-x: hidden; }
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
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 20px; flex-wrap: wrap; }
        
        /* Search & Filters */
        .search-bar-wrap { display: flex; gap: 12px; margin-bottom: 24px; }
        .search-input {
            flex: 1;
            background: var(--card-bg);
            border: 1px solid var(--border);
            padding: 12px 18px;
            border-radius: 12px;
            color: #fff;
            outline: none;
            font-size: 14px;
        }
        .search-input:focus { border-color: var(--primary); }

        .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 28px; }
        .stat-card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            padding: 20px;
            border-radius: 16px;
        }
        .stat-num { font-size: 26px; font-weight: 800; color: #fff; margin-top: 4px; }
        .stat-label { font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }

        /* Wait time config banner */
        .config-banner {
            background: rgba(52, 152, 219, 0.1);
            border: 1px solid rgba(52, 152, 219, 0.3);
            border-radius: 14px;
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }
        .config-banner-text h4 { font-size: 14px; color: #fff; margin-bottom: 2px; }
        .config-banner-text p { font-size: 12px; color: var(--text-muted); }
        .config-controls { display: flex; gap: 10px; align-items: center; }
        .config-input {
            background: #0b1120;
            border: 1px solid var(--border);
            padding: 8px 12px;
            border-radius: 8px;
            color: #fff;
            font-size: 13px;
            width: 170px;
            outline: none;
        }

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
            transition: all 0.2s;
        }
        .ticket-card.prio-urgent { border-left: 5px solid #ef4444; }
        .ticket-card.prio-high { border-left: 5px solid #f59e0b; }
        .ticket-card.prio-normal { border-left: 5px solid #2ECC71; }

        .ticket-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .ticket-id { font-weight: 800; color: var(--primary); font-size: 15px; }
        .category-badge { padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 700; }
        .category-general { background: rgba(52, 152, 219, 0.2); color: #60a5fa; }
        .category-report { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .category-management { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .category-technical { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
        .category-appeals { background: rgba(20, 184, 166, 0.2); color: #2dd4bf; }
        
        .priority-badge { font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 6px; }
        .prio-urgent { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .prio-high { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
        .prio-normal { background: rgba(46, 204, 113, 0.2); color: #2ECC71; }

        .ticket-user { font-weight: 700; color: #fff; font-size: 14px; }
        .ticket-meta { font-size: 13px; color: var(--text-muted); display: flex; gap: 16px; }
        .ticket-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        
        .btn-action {
            padding: 8px 14px;
            border-radius: 8px;
            border: none;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s;
        }
        .btn-chat { background: var(--primary); color: #05160d; }
        .btn-chat:hover { background: var(--primary-dark); }
        .btn-view-transcript { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; border: 1px solid rgba(255, 255, 255, 0.1); }
        .btn-view-transcript:hover { background: rgba(148, 163, 184, 0.3); color: #fff; }
        .btn-transfer { background: rgba(52, 152, 219, 0.2); color: #60a5fa; }
        .btn-prio { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .btn-blacklist { background: rgba(239, 68, 68, 0.15); color: #fca5a5; }
        .btn-close { background: rgba(255, 255, 255, 0.08); color: #fff; }
        .btn-close:hover { background: rgba(239, 68, 68, 0.4); }

        /* Slide-over Live Chat Drawer */
        .drawer-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            z-index: 1000;
        }
        .chat-drawer {
            position: fixed;
            top: 0; right: -600px; bottom: 0;
            width: 580px;
            background: #0f1422;
            border-left: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            z-index: 1001;
            transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: -15px 0 35px rgba(0, 0, 0, 0.5);
        }
        .chat-drawer.open { right: 0; }
        .drawer-header {
            padding: 20px 24px;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(255, 255, 255, 0.02);
        }
        .drawer-title { font-size: 16px; font-weight: 800; color: #fff; }
        .drawer-tabs { display: flex; border-bottom: 1px solid var(--border); }
        .drawer-tab {
            flex: 1;
            padding: 12px;
            text-align: center;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            color: var(--text-muted);
            background: transparent;
            border: none;
        }
        .drawer-tab.active {
            color: var(--primary);
            border-bottom: 2px solid var(--primary);
            background: rgba(46, 204, 113, 0.05);
        }
        .drawer-body {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .chat-msg {
            display: flex;
            flex-direction: column;
            max-width: 82%;
            padding: 12px 16px;
            border-radius: 14px;
            font-size: 13px;
            line-height: 1.4;
        }
        .chat-msg.customer {
            align-self: flex-start;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid var(--border);
            color: #fff;
        }
        .chat-msg.staff {
            align-self: flex-end;
            background: rgba(46, 204, 113, 0.15);
            border: 1px solid rgba(46, 204, 113, 0.3);
            color: #86efac;
        }
        .chat-msg.whisper {
            align-self: center;
            width: 95%;
            background: rgba(245, 158, 11, 0.12);
            border: 1px solid rgba(245, 158, 11, 0.3);
            color: #fde68a;
        }
        .msg-author { font-size: 11px; font-weight: 700; opacity: 0.8; margin-bottom: 4px; }
        .msg-time { font-size: 10px; opacity: 0.6; align-self: flex-end; margin-top: 4px; }
        .drawer-footer {
            padding: 18px 20px;
            border-top: 1px solid var(--border);
            background: rgba(255, 255, 255, 0.02);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .snippet-select {
            background: #090d16;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 8px 12px;
            color: #fff;
            font-size: 12px;
            outline: none;
        }
        .chat-input-row { display: flex; gap: 10px; }
        .chat-input {
            flex: 1;
            background: #090d16;
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 12px;
            color: #fff;
            font-size: 13px;
            outline: none;
        }
        .chat-input:focus { border-color: var(--primary); }
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
                <p style="color: var(--text-muted); font-size: 14px; margin-top: 4px;">Live customer messaging desk, department routing, and queue management</p>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn-action btn-chat" onclick="openForceOpenModal()">➕ Force Open ModMail</button>
                <button class="btn-action btn-close" onclick="location.reload()">🔄 Refresh Feed</button>
            </div>
        </div>

        <!-- Wait-Time Configuration Banner -->
        <div class="config-banner">
            <div class="config-banner-text">
                <h4>⚡ Live Support Wait Time & Queue Status</h4>
                <p>Configured here directly updates the Discord #support-center panel embed in real-time.</p>
            </div>
            <div class="config-controls">
                <input type="text" id="customWaitTime" class="config-input" placeholder="e.g. ~2m (Very Fast)" value="${escapeHtml(configuredWait)}">
                <button class="btn-action btn-chat" onclick="saveWaitTime()">Save Wait Time</button>
            </div>
        </div>

        <!-- Search & Filter Bar -->
        <div class="search-bar-wrap">
            <input type="text" id="ticketSearch" class="search-input" placeholder="🔍 Search active tickets by Customer Tag, Discord ID, or Category..." onkeyup="filterTickets()">
        </div>

        <div class="stat-grid">
            <div class="stat-card">
                <div class="stat-label">Active ModMail Threads</div>
                <div class="stat-num">${activeTickets.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Store Tickets</div>
                <div class="stat-num">${allTickets.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Configured Wait</div>
                <div class="stat-num" id="statWaitDisplay">${escapeHtml(configuredWait || '< 2m')}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">System Uptime</div>
                <div class="stat-num">${Math.floor((process.uptime() || 0) / 3600)}h</div>
            </div>
        </div>

        <div class="ticket-list" id="ticketListContainer">
            ${ticketCards}
        </div>
    </div>

    <!-- Live Chat Drawer Overlay -->
    <div class="drawer-overlay" id="drawerOverlay" onclick="closeChatDrawer()"></div>

    <!-- Live Chat Drawer -->
    <div class="chat-drawer" id="chatDrawer">
        <div class="drawer-header">
            <div>
                <div class="drawer-title" id="drawerUserTitle">💬 Live Conversation</div>
                <div style="font-size: 12px; color: var(--text-muted);" id="drawerSubtitle">ModMail Thread</div>
            </div>
            <button class="btn-action btn-close" onclick="closeChatDrawer()">✕</button>
        </div>

        <div class="drawer-tabs">
            <button class="drawer-tab active" id="tabCustomer" onclick="switchDrawerTab('customer')">Customer DM Feed</button>
            <button class="drawer-tab" id="tabNotes" onclick="switchDrawerTab('notes')">🔒 Internal Staff Notes</button>
        </div>

        <div class="drawer-body" id="drawerMessages">
            <div style="text-align: center; color: var(--text-muted); padding: 40px;">Loading messages...</div>
        </div>

        <div class="drawer-footer">
            <select class="snippet-select" id="snippetSelect" onchange="applySnippet()">
                <option value="">⚡ Select a Quick Support Tag Snippet...</option>
                ${snippetOptions}
            </select>

            <div class="chat-input-row">
                <input type="text" class="chat-input" id="drawerInput" placeholder="Type response or internal whisper..." onkeydown="if(event.key === 'Enter') sendDrawerMessage()">
                <button class="btn-action btn-chat" onclick="sendDrawerMessage()">Send</button>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted);">
                <label><input type="checkbox" id="drawerAnon" checked> Send Anonymously</label>
                <span id="tabModeIndicator">Relaying to Customer DMs</span>
            </div>
        </div>
    </div>

    <script>
        const SNIPPETS = ${JSON.stringify(SUPPORT_TAGS)};
        let activeDrawerTicketId = null;
        let activeDrawerUserTag = '';
        let activeDrawerTab = 'customer';

        function filterTickets() {
            const query = document.getElementById('ticketSearch').value.toLowerCase().trim();
            const cards = document.querySelectorAll('.ticket-card');
            cards.forEach(c => {
                const user = c.getAttribute('data-user') || '';
                const cat = c.getAttribute('data-category') || '';
                const id = c.getAttribute('data-id') || '';
                if (user.includes(query) || cat.includes(query) || id.includes(query)) {
                    c.style.display = 'flex';
                } else {
                    c.style.display = 'none';
                }
            });
        }

        async function openChatDrawer(ticketId, userTag, userId, category, priority) {
            activeDrawerTicketId = ticketId;
            activeDrawerUserTag = userTag;
            document.getElementById('drawerUserTitle').innerText = '💬 ' + userTag + ' (#' + ticketId + ')';
            document.getElementById('drawerSubtitle').innerText = category.toUpperCase() + ' • ' + priority + ' Priority';
            document.getElementById('chatDrawer').classList.add('open');
            document.getElementById('drawerOverlay').style.display = 'block';
            await loadDrawerMessages();
        }

        function closeChatDrawer() {
            document.getElementById('chatDrawer').classList.remove('open');
            document.getElementById('drawerOverlay').style.display = 'none';
            activeDrawerTicketId = null;
        }

        function switchDrawerTab(tab) {
            activeDrawerTab = tab;
            document.getElementById('tabCustomer').classList.toggle('active', tab === 'customer');
            document.getElementById('tabNotes').classList.toggle('active', tab === 'notes');
            document.getElementById('tabModeIndicator').innerText = tab === 'customer' ? 'Relaying to Customer DMs' : '🔒 Internal Whisper (Staff Only)';
            loadDrawerMessages();
        }

        async function loadDrawerMessages() {
            if (!activeDrawerTicketId) return;
            const body = document.getElementById('drawerMessages');
            try {
                const res = await fetch('/api/staff/ticket/' + activeDrawerTicketId + '/messages');
                const data = await res.json();
                if (!data.success) {
                    body.innerHTML = '<div style="color: #ef4444; padding: 20px;">' + (data.error || 'Failed to load') + '</div>';
                    return;
                }

                if (activeDrawerTab === 'notes') {
                    // Show internal notes
                    const notes = data.notes || [];
                    if (notes.length === 0) {
                        body.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">No internal whispers logged for this ticket yet.</div>';
                        return;
                    }
                    body.innerHTML = notes.map(n => \`
                        <div class="chat-msg whisper">
                            <div class="msg-author">🔒 Internal Whisper • \${n.staff_id || 'Staff'}</div>
                            <div>\${n.note}</div>
                            <div class="msg-time">\${new Date(n.created_at || Date.now()).toLocaleTimeString()}</div>
                        </div>
                    \`).join('');
                } else {
                    // Show live conversation messages
                    const msgs = data.messages || [];
                    if (msgs.length === 0) {
                        body.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px;">No messages recorded yet. Type below to message customer!</div>';
                        return;
                    }
                    body.innerHTML = msgs.map(m => \`
                        <div class="chat-msg \${m.isStaff ? 'staff' : 'customer'}">
                            <div class="msg-author">\${m.author} \${m.isAnon ? '(Anonymous)' : ''}</div>
                            <div>\${m.content}</div>
                            <div class="msg-time">\${m.time}</div>
                        </div>
                    \`).join('');
                }
                body.scrollTop = body.scrollHeight;
            } catch (e) {
                body.innerHTML = '<div style="color: #ef4444; padding: 20px;">Error loading messages: ' + e.message + '</div>';
            }
        }

        function applySnippet() {
            const key = document.getElementById('snippetSelect').value;
            if (!key || !SNIPPETS[key]) return;
            const snip = SNIPPETS[key];
            const customerName = activeDrawerUserTag ? '@' + activeDrawerUserTag : 'Customer';
            const resolved = snip.desc
                .replace(/\\{customer\\}/g, customerName)
                .replace(/\\{staff\\}/g, 'Grandway Support')
                .replace(/\\{store\\}/g, '${config.storeName}');
            document.getElementById('drawerInput').value = resolved;
        }

        async function sendDrawerMessage() {
            const text = document.getElementById('drawerInput').value.trim();
            if (!text || !activeDrawerTicketId) return;
            const isAnon = document.getElementById('drawerAnon').checked;

            try {
                const endpoint = activeDrawerTab === 'notes' ? '/api/staff/whisper' : '/api/staff/reply';
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId: activeDrawerTicketId, text, isAnon })
                });
                const data = await res.json();
                if (data.success) {
                    document.getElementById('drawerInput').value = '';
                    await loadDrawerMessages();
                } else {
                    alert('❌ Error: ' + (data.error || 'Failed to dispatch'));
                }
            } catch (e) {
                alert('⚠️ Failed to contact server: ' + e.message);
            }
        }

        async function saveWaitTime() {
            const val = document.getElementById('customWaitTime').value.trim();
            try {
                const res = await fetch('/api/staff/wait-time', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ waitTime: val })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ Live Support Wait Time saved! Discord #support-center panel updated.');
                    document.getElementById('statWaitDisplay').innerText = val || '< 2m';
                }
            } catch (e) {
                alert('⚠️ Failed to save wait time: ' + e.message);
            }
        }

        async function togglePriority(ticketId) {
            const prio = prompt('Set priority for #' + ticketId + ' (NORMAL, HIGH, URGENT):', 'HIGH');
            if (!prio) return;
            try {
                const res = await fetch('/api/staff/priority', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId, priority: prio.toUpperCase() })
                });
                const data = await res.json();
                if (data.success) location.reload();
            } catch (e) { alert(e.message); }
        }

        async function openTransferModal(ticketId) {
            const cat = prompt('Transfer #' + ticketId + ' to department (general, report, management, technical, appeals):', 'management');
            if (!cat) return;
            try {
                const res = await fetch('/api/staff/transfer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId, category: cat.toLowerCase() })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ Department transferred!');
                    location.reload();
                }
            } catch (e) { alert(e.message); }
        }

        async function blacklistUser(userId, userTag) {
            const reason = prompt('Reason for blacklisting ' + userTag + ' from ModMail:', 'Trolling / harassment');
            if (!reason) return;
            try {
                const res = await fetch('/api/staff/blacklist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, reason })
                });
                const data = await res.json();
                if (data.success) {
                    alert('🚫 User ' + userTag + ' has been blacklisted and blocked from opening tickets.');
                    location.reload();
                }
            } catch (e) { alert(e.message); }
        }

        async function closeTicket(ticketId) {
            if (!confirm('Are you sure you want to close ModMail #' + ticketId + '?')) return;
            try {
                const res = await fetch('/api/staff/close', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticketId, reason: 'Closed via Staff Web Dashboard' })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ Ticket #' + ticketId + ' closed!');
                    location.reload();
                } else {
                    alert('❌ Failed to close ticket: ' + (data.error || 'Unknown error'));
                }
            } catch (e) { alert(e.message); }
        }

        async function openForceOpenModal() {
            const userId = prompt('Enter Discord User ID to force-open ModMail with:');
            if (!userId || !userId.trim()) return;
            const category = prompt('Category (general, report, management, technical, appeals):', 'general');
            if (!category) return;
            const reason = prompt('Reason for force-opening ModMail:', 'Direct staff inquiry regarding store operations');
            if (!reason) return;

            try {
                const res = await fetch('/api/staff/force-open', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId.trim(), category: category.trim().toLowerCase(), reason })
                });
                const data = await res.json();
                if (data.success) {
                    alert('✅ ModMail thread #' + data.ticketId + ' successfully created and DM opened with user!');
                    location.reload();
                } else {
                    alert('❌ Failed to force open: ' + (data.error || 'Server error'));
                }
            } catch (e) {
                alert('⚠️ Error contacting server: ' + e.message);
            }
        }
    </script>
</body>
</html>`;
    }
};

module.exports = WebPortal;
