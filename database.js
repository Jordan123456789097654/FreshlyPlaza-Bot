const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'freshlyplaza_db.json');

let dbData = {
    sessions: [],
    trainings: [],
    events: [],
    suggestions: [],
    bugs: [],
    tickets: [],
    honeypot_logs: [],
    loas: [],
    staff_activity: {},
    verifications: {},
    staff_strikes: [],
    loa_ping_warnings: [],
    birthdays: {},
    shift_schedules: [],
    shift_votes: [],
    activity_terms: [],
    shift_evaluations: [],
    customer_feedback: [],
    gtn_games: [],
    gtn_stats: {},
    ia_recordings: [],
    ia_cases: [],
    ia_whistleblows: [],
    ia_audit_flags: [],
    auto_roles: [],
    music_playlists: {},
    music_favorites: {},
    music_settings: {}
};

function saveDb() {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf8');
    } catch (e) {
        console.error('[DATABASE] Error saving database file:', e);
    }
}

function loadDb() {
    if (fs.existsSync(dbPath)) {
        try {
            const raw = fs.readFileSync(dbPath, 'utf8');
            dbData = Object.assign(dbData, JSON.parse(raw));
        } catch (e) {
            console.error('[DATABASE] Error reloading db:', e);
        }
    }
    return dbData;
}

async function initDatabase() {
    if (fs.existsSync(dbPath)) {
        try {
            const raw = fs.readFileSync(dbPath, 'utf8');
            dbData = Object.assign(dbData, JSON.parse(raw));
            console.log('[DATABASE] JSON Database loaded successfully.');
        } catch (e) {
            console.error('[DATABASE] Failed to parse existing JSON db, starting fresh.');
        }
    } else {
        saveDb();
        console.log('[DATABASE] Created new JSON Database file.');
    }
}

const db = {
    getData() {
        return loadDb();
    },
    
    save() {
        saveDb();
    },

    // Session helpers
    async addSession(hostId, cohostId, storeLink) {
        loadDb();
        const id = dbData.sessions.length + 1;
        const session = { 
            id, 
            host_id: hostId, 
            cohost_id: cohostId, 
            store_link: storeLink, 
            status: 'ACTIVE', 
            started_at: new Date().toISOString(),
            attendees: [],
            stations: {},
            handoff_history: []
        };
        dbData.sessions.push(session);
        
        // Track host activity
        if (!dbData.staff_activity[hostId]) {
            dbData.staff_activity[hostId] = { shifts_hosted: 0, shifts_attended: 0, trainings_hosted: 0, minutes_in_game: 0 };
        }
        dbData.staff_activity[hostId].shifts_hosted += 1;

        saveDb();
        return session;
    },

    async recordShiftAttendance(sessionId, attendeeUserIds) {
        loadDb();
        const session = dbData.sessions.find(s => s.id == sessionId);
        if (!session) return null;
        if (!session.attendees) session.attendees = [];

        attendeeUserIds.forEach(uid => {
            if (!session.attendees.includes(uid)) {
                session.attendees.push(uid);
            }
            if (!dbData.staff_activity[uid]) {
                dbData.staff_activity[uid] = { shifts_hosted: 0, shifts_attended: 0, trainings_hosted: 0, minutes_in_game: 0 };
            }
            dbData.staff_activity[uid].shifts_attended += 1;
        });

        saveDb();
        return session;
    },

    // LOA helpers
    async addLoa(userId, startDate, endDate, reason) {
        const id = dbData.loas.length + 1;
        const loa = { id, user_id: userId, start_date: startDate, end_date: endDate, reason, status: 'PENDING', requested_at: new Date().toISOString() };
        dbData.loas.push(loa);
        saveDb();
        return loa;
    },

    // Strike helpers
    async addStrike(userId, issuedBy, reason, count = 1) {
        const id = dbData.staff_strikes.length + 1;
        const strike = { id, user_id: userId, issued_by: issuedBy, reason, count, created_at: new Date().toISOString() };
        dbData.staff_strikes.push(strike);
        saveDb();
        return strike;
    },

    // LOA ping warning helpers
    async addLoaPingWarning(userId, loaUserIds, channelId, messageId) {
        if (!dbData.loa_ping_warnings) dbData.loa_ping_warnings = [];
        const id = dbData.loa_ping_warnings.length + 1;
        const warning = { id, user_id: userId, loa_user_ids: loaUserIds, channel_id: channelId, message_id: messageId, created_at: new Date().toISOString() };
        dbData.loa_ping_warnings.push(warning);
        saveDb();
        return warning;
    },

    getLoaPingWarningCount(userId) {
        return (dbData.loa_ping_warnings || []).filter(w => w.user_id === userId).length;
    },

    // Verification helpers
    async setVerification(userId, robloxId, robloxUsername) {
        if (!dbData.verifications) dbData.verifications = {};
        dbData.verifications[userId] = { roblox_id: robloxId, roblox_username: robloxUsername, verified_at: new Date().toISOString() };
        saveDb();
        return dbData.verifications[userId];
    },

    async removeVerification(userId) {
        if (dbData.verifications && dbData.verifications[userId]) {
            const removed = dbData.verifications[userId];
            delete dbData.verifications[userId];
            saveDb();
            return removed;
        }
        return null;
    },

    async getVerification(userId) {
        if (!dbData.verifications) dbData.verifications = {};
        return dbData.verifications[userId] || null;
    },

    // Staff Profile & Probation Helpers
    async initStaffProfile(userId, { hiredById, roleId, roleName, mentorId = null, probationDays = 7, notes = null }) {
        loadDb();
        if (!dbData.staff_profiles) dbData.staff_profiles = {};
        if (!dbData.staff_activity) dbData.staff_activity = {};

        // Initialize activity metrics if not present
        if (!dbData.staff_activity[userId]) {
            dbData.staff_activity[userId] = {
                shifts_hosted: 0,
                shifts_attended: 0,
                trainings_hosted: 0,
                minutes_in_game: 0
            };
        }

        const probationExpiresAt = probationDays 
            ? new Date(Date.now() + probationDays * 24 * 60 * 60 * 1000).toISOString()
            : null;

        const profile = {
            user_id: userId,
            hired_at: new Date().toISOString(),
            hired_by: hiredById,
            current_role_id: roleId,
            current_role_name: roleName,
            mentor_id: mentorId,
            notes: notes,
            probation: {
                active: Boolean(probationDays && probationDays > 0),
                duration_days: probationDays,
                expires_at: probationExpiresAt,
                reviewed: false
            }
        };

        dbData.staff_profiles[userId] = profile;
        saveDb();
        return profile;
    },

    async getStaffProfile(userId) {
        loadDb();
        if (!dbData.staff_profiles) dbData.staff_profiles = {};
        return dbData.staff_profiles[userId] || null;
    },

    async getAllStaffProfiles() {
        loadDb();
        if (!dbData.staff_profiles) dbData.staff_profiles = {};
        return Object.values(dbData.staff_profiles);
    },

    async getExpiringProbations() {
        loadDb();
        if (!dbData.staff_profiles) return [];
        const now = Date.now();
        return Object.values(dbData.staff_profiles).filter(p => 
            p.probation && 
            p.probation.active && 
            !p.probation.reviewed && 
            p.probation.expires_at && 
            new Date(p.probation.expires_at).getTime() <= now
        );
    },

    // Staff Data Notice & Automatic Termination Tracking
    async getDataNoticeRecords() {
        loadDb();
        if (!dbData.staff_data_notices) dbData.staff_data_notices = {};
        return dbData.staff_data_notices;
    },

    async addDataNoticeRecord(userId, userTag, isLoa = false) {
        loadDb();
        if (!dbData.staff_data_notices) dbData.staff_data_notices = {};
        const now = Date.now();
        // Regular staff: 7 days (1 week); LOA staff: 90 days (3 months)
        const durationDays = isLoa ? 90 : 7;
        const expiresAt = new Date(now + durationDays * 24 * 60 * 60 * 1000).toISOString();

        const record = {
            user_id: userId,
            user_tag: userTag,
            is_loa: isLoa,
            duration_days: durationDays,
            notified_at: new Date().toISOString(),
            deadline: expiresAt,
            status: 'PENDING', // PENDING, COMPLETED, FIRED, EXEMPT
            dm_delivered: false,
            terminated_at: null
        };
        dbData.staff_data_notices[userId] = record;
        saveDb();
        return record;
    },

    async completeDataNotice(userId) {
        loadDb();
        if (!dbData.staff_data_notices) return;
        if (dbData.staff_data_notices[userId]) {
            dbData.staff_data_notices[userId].status = 'COMPLETED';
            dbData.staff_data_notices[userId].completed_at = new Date().toISOString();
            saveDb();
        }
    },

    async getOverdueDataNotices() {
        loadDb();
        if (!dbData.staff_data_notices) return [];
        const now = Date.now();
        return Object.values(dbData.staff_data_notices).filter(n => 
            n.status === 'PENDING' &&
            n.deadline &&
            new Date(n.deadline).getTime() <= now
        );
    },

    async saveStaffDataEntry(data) {
        loadDb();
        if (!dbData.staff_profiles) dbData.staff_profiles = {};
        if (!dbData.verifications) dbData.verifications = {};
        if (!dbData.staff_activity) dbData.staff_activity = {};

        const userId = data.discord_id;
        if (!userId) return null;

        const existingProfile = dbData.staff_profiles[userId] || {};

        const updatedProfile = {
            ...existingProfile,
            user_id: userId,
            preferred_name: data.preferred_name || existingProfile.preferred_name || null,
            roblox_username: data.roblox_username || existingProfile.roblox_username || null,
            roblox_id: data.roblox_id || existingProfile.roblox_id || null,
            current_role_name: data.rank || existingProfile.current_role_name || null,
            rank: data.rank || existingProfile.rank || null,
            joined_staff_at: data.joined_staff_at || existingProfile.joined_staff_at || null,
            timezone: data.timezone || existingProfile.timezone || null,
            weekly_availability: data.weekly_availability || existingProfile.weekly_availability || null,
            department: data.department || existingProfile.department || null,
            willing_to_host_trainings: data.willing_to_host_trainings ?? existingProfile.willing_to_host_trainings ?? null,
            loa_status: data.loa_status || existingProfile.loa_status || 'Active',
            notes: data.notes || existingProfile.notes || null,
            last_roster_update: new Date().toISOString()
        };

        dbData.staff_profiles[userId] = updatedProfile;

        // Sync verification if roblox details provided
        if (data.roblox_username && data.roblox_id) {
            dbData.verifications[userId] = {
                roblox_id: String(data.roblox_id),
                roblox_username: data.roblox_username,
                verified_at: new Date().toISOString()
            };
        }

        // Initialize activity if not existing
        if (!dbData.staff_activity[userId]) {
            dbData.staff_activity[userId] = {
                shifts_hosted: 0,
                shifts_attended: 0,
                trainings_hosted: 0,
                minutes_in_game: 0
            };
        }

        // Mark pending data notice as completed
        if (dbData.staff_data_notices && dbData.staff_data_notices[userId]) {
            dbData.staff_data_notices[userId].status = 'COMPLETED';
            dbData.staff_data_notices[userId].completed_at = new Date().toISOString();
        }

        saveDb();
        return updatedProfile;
    },

    // Birthday helpers
    async setBirthday(userId, month, day) {
        dbData.birthdays[userId] = { month, day };
        saveDb();
        return dbData.birthdays[userId];
    },

    // Shift Vote helpers
    async addShiftVote(hostId, channelId, durationMinutes, targetVotes) {
        if (!dbData.shift_votes) dbData.shift_votes = [];
        const id = dbData.shift_votes.length + 1;
        const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        const vote = {
            id,
            host_id: hostId,
            channel_id: channelId,
            message_id: null,
            duration_minutes: durationMinutes,
            target_votes: targetVotes,
            upvotes: [],
            downvotes: [],
            staff_stations: {},
            staff_message_id: null,
            status: 'ACTIVE',
            created_at: new Date().toISOString(),
            expires_at: expiresAt
        };
        dbData.shift_votes.push(vote);
        saveDb();
        return vote;
    },

    async getActiveShiftVote() {
        loadDb();
        if (!dbData.shift_votes) dbData.shift_votes = [];
        return dbData.shift_votes.filter(v => v.status === 'ACTIVE').pop() || null;
    },

    async getShiftVote(id) {
        loadDb();
        if (!dbData.shift_votes) dbData.shift_votes = [];
        return dbData.shift_votes.find(v => String(v.id) === String(id)) || null;
    },

    async getLatestShiftVote() {
        loadDb();
        if (!dbData.shift_votes) dbData.shift_votes = [];
        return dbData.shift_votes[dbData.shift_votes.length - 1] || null;
    },

    async getLatestPassedShiftVote() {
        loadDb();
        if (!dbData.shift_votes) dbData.shift_votes = [];
        return dbData.shift_votes.filter(v => v.status === 'PASSED').pop() || null;
    },

    // Activity Term & Appeal helpers
    async addActivityTerm(userId, userTag, termedById, reason, preservedRoles) {
        loadDb();
        if (!dbData.activity_terms) dbData.activity_terms = [];
        const id = dbData.activity_terms.length + 1;
        const term = {
            id,
            user_id: userId,
            user_tag: userTag,
            termed_by: termedById,
            reason: reason,
            preserved_roles: preservedRoles,
            termed_at: new Date().toISOString(),
            appeal_status: 'NOT_SUBMITTED',
            appeal_answers: null,
            appealed_at: null,
            actioned_by: null,
            actioned_at: null
        };
        dbData.activity_terms.push(term);
        saveDb();
        return term;
    },

    async getActivityTerm(id) {
        loadDb();
        if (!dbData.activity_terms) dbData.activity_terms = [];
        return dbData.activity_terms.find(t => String(t.id) === String(id)) || null;
    },

    async getLatestActivityTermByUser(userId) {
        loadDb();
        if (!dbData.activity_terms) dbData.activity_terms = [];
        return dbData.activity_terms.filter(t => String(t.user_id) === String(userId)).pop() || null;
    },

    // Shift Evaluation helpers
    async addShiftEvaluation(staffUserId, staffUserTag, evaluatorId, rating, dutyStation, comments) {
        loadDb();
        if (!dbData.shift_evaluations) dbData.shift_evaluations = [];
        const id = dbData.shift_evaluations.length + 1;
        const evalRecord = {
            id,
            staff_user_id: staffUserId,
            staff_user_tag: staffUserTag,
            evaluator_id: evaluatorId,
            rating,
            duty_station: dutyStation,
            comments,
            timestamp: new Date().toISOString()
        };
        dbData.shift_evaluations.push(evalRecord);
        saveDb();
        return evalRecord;
    },

    // Customer Feedback helpers
    async addCustomerFeedback(customerUserId, customerUserTag, orderId, staffMentioned, rating, comments) {
        loadDb();
        if (!dbData.customer_feedback) dbData.customer_feedback = [];
        const id = dbData.customer_feedback.length + 1;
        const feedback = {
            id,
            customer_user_id: customerUserId,
            customer_user_tag: customerUserTag,
            order_id: orderId,
            staff_mentioned: staffMentioned,
            rating,
            comments,
            timestamp: new Date().toISOString()
        };
        dbData.customer_feedback.push(feedback);
        saveDb();
        return feedback;
    },

    // Scheduled Shift Helpers (up to 24 hours / 1 day in advance)
    async addScheduledShift(hostId, scheduledTimeIso, storeLink, announcementMessageId, note = '') {
        loadDb();
        if (!dbData.shift_schedules) dbData.shift_schedules = [];
        const id = dbData.shift_schedules.length + 1;
        const schedule = {
            id,
            host_id: hostId,
            scheduled_for: scheduledTimeIso,
            store_link: storeLink,
            announcement_message_id: announcementMessageId,
            note: note || '',
            status: 'SCHEDULED', // 'SCHEDULED', 'REMINDED_5M', 'STARTED', 'CANCELLED'
            created_at: new Date().toISOString()
        };
        dbData.shift_schedules.push(schedule);
        saveDb();
        return schedule;
    },

    async getUpcomingScheduledShifts() {
        loadDb();
        if (!dbData.shift_schedules) dbData.shift_schedules = [];
        return dbData.shift_schedules.filter(s => s.status === 'SCHEDULED' || s.status === 'REMINDED_5M');
    },

    async updateScheduledShift(id, updates) {
        loadDb();
        if (!dbData.shift_schedules) dbData.shift_schedules = [];
        const sched = dbData.shift_schedules.find(s => s.id === id);
        if (sched) {
            Object.assign(sched, updates);
            saveDb();
        }
        return sched;
    },

    // Ticket System Database Helpers
    
    getAutoRoles() {
        loadDb();
        if (!dbData.auto_roles) dbData.auto_roles = [];
        return dbData.auto_roles;
    },
    addAutoRole(roleId) {
        loadDb();
        if (!dbData.auto_roles) dbData.auto_roles = [];
        if (!dbData.auto_roles.includes(roleId)) {
            dbData.auto_roles.push(roleId);
            saveDb();
        }
        return dbData.auto_roles;
    },
    removeAutoRole(roleId) {
        loadDb();
        if (!dbData.auto_roles) dbData.auto_roles = [];
        dbData.auto_roles = dbData.auto_roles.filter(id => id !== roleId);
        saveDb();
        return dbData.auto_roles;
    },
    async createTicketRecord({ channelId, userId, userTag, type, subject = '', details = '', robloxUsername = '', aiDisabled = false }) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const id = dbData.tickets.length + 1;
        const ticket = {
            id,
            channel_id: channelId,
            user_id: userId,
            user_tag: userTag,
            type: type || 'general',
            subject: subject || '',
            details: details || '',
            roblox_username: robloxUsername || '',
            status: 'OPEN', // OPEN, CLAIMED, ESCALATED, LOCKED, RESOLVED_BY_AI, CLOSED
            claimed_by: null,
            claimed_at: null,
            created_at: new Date().toISOString(),
            closed_at: null,
            closed_by: null,
            close_reason: null,
            priority: 'NORMAL', // LOW, NORMAL, HIGH, URGENT
            first_response_at: null,
            ai_attempted: false,
            ai_handled: false,
            ai_escalated: false,
            ai_disabled: Boolean(aiDisabled),
            anon_mode: false,
            internal_notes: [],
            feedback_rating: null,
            feedback_comment: null
        };
        dbData.tickets.push(ticket);
        saveDb();
        return ticket;
    },

    async toggleTicketAnonMode(channelOrId) {
        loadDb();
        const ticket = await this.getTicketByChannel(channelOrId);
        if (!ticket) return false;
        ticket.anon_mode = !ticket.anon_mode;
        saveDb();
        return ticket.anon_mode;
    },

    async getTicketByChannel(channelOrId) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const chId = typeof channelOrId === 'string' ? channelOrId : channelOrId?.id;
        const chName = typeof channelOrId === 'object' && channelOrId?.name ? channelOrId.name.toLowerCase() : '';

        // 1. Direct ID match
        let found = dbData.tickets.find(t => t.channel_id === chId && t.status !== 'CLOSED') || 
                    dbData.tickets.find(t => t.channel_id === chId);
        if (found) return found;

        // 2. Channel name match fallback (e.g. "general-liverpoolclass1234")
        if (chName) {
            found = dbData.tickets.find(t => {
                if (!t.user_tag) return false;
                const cleanTag = t.user_tag.toLowerCase().replace(/[^a-z0-9]/g, '');
                return cleanTag && chName.includes(cleanTag);
            });
            if (found) {
                // Self-repair: update with the real live channel ID
                if (chId && found.channel_id !== chId) {
                    found.channel_id = chId;
                    saveDb();
                }
                return found;
            }
        }

        return null;
    },

    async getTicketById(id) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        return dbData.tickets.find(t => t.id === Number(id)) || null;
    },

    async getActiveUserTicket(userId, type = null, guild = null) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const ticket = dbData.tickets.find(t => 
            t.user_id === userId && 
            t.status !== 'CLOSED' && 
            t.status !== 'RESOLVED_BY_AI' &&
            (!type || t.type === type)
        );
        if (!ticket) return null;

        if (guild && ticket.channel_id) {
            const exists = guild.channels.cache.has(ticket.channel_id);
            if (!exists) {
                ticket.status = 'CLOSED';
                ticket.closed_at = new Date().toISOString();
                ticket.close_reason = 'Auto-closed: Channel does not exist in current server';
                saveDb();
                return null;
            }
        }
        return ticket;
    },

    async updateTicket(channelOrId, updates) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const ticket = dbData.tickets.find(t => t.channel_id === channelOrId || t.id === Number(channelOrId));
        if (ticket) {
            Object.assign(ticket, updates);
            saveDb();
        }
        return ticket;
    },

    async addTicketNote(channelOrId, staffId, noteText) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const ticket = dbData.tickets.find(t => t.channel_id === channelOrId || t.id === Number(channelOrId));
        if (ticket) {
            if (!ticket.internal_notes) ticket.internal_notes = [];
            ticket.internal_notes.push({
                staff_id: staffId,
                note: noteText,
                timestamp: new Date().toISOString()
            });
            saveDb();
        }
        return ticket;
    },

    async updateTicketChecklist(channelOrId, itemIndex, completed) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const ticket = dbData.tickets.find(t => t.channel_id === channelOrId || t.id === Number(channelOrId));
        if (ticket) {
            if (!ticket.checklist) {
                ticket.checklist = [
                    { task: 'Evidence & Details Verified', done: false },
                    { task: 'Roblox Account / Store Records Checked', done: false },
                    { task: 'Customer Inquiries Addressed', done: false },
                    { task: 'Resolution Confirmed by Customer', done: false }
                ];
            }
            if (ticket.checklist[itemIndex]) {
                ticket.checklist[itemIndex].done = completed;
                saveDb();
            }
        }
        return ticket;
    },

    async setTicketCoClaim(channelOrId, coClaimStaffId) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const ticket = dbData.tickets.find(t => t.channel_id === channelOrId || t.id === Number(channelOrId));
        if (ticket) {
            ticket.co_claimed_by = coClaimStaffId;
            ticket.co_claimed_at = new Date().toISOString();
            saveDb();
        }
        return ticket;
    },

    async setTicketPinnedMessage(channelOrId, messageContent, pinnedByStaffId) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const ticket = dbData.tickets.find(t => t.channel_id === channelOrId || t.id === Number(channelOrId));
        if (ticket) {
            ticket.pinned_message = {
                content: messageContent,
                pinned_by: pinnedByStaffId,
                pinned_at: new Date().toISOString()
            };
            saveDb();
        }
        return ticket;
    },

    async recordTicketRating(ticketId, rating, comment = '') {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const ticket = dbData.tickets.find(t => t.id === Number(ticketId));
        if (ticket) {
            ticket.feedback_rating = rating;
            ticket.feedback_comment = comment;
            saveDb();
        }
        return ticket;
    },

    // AI Training Memory Helpers
    async addAiTrainingExample({ ticketId, category, userQuery, resolution, resolvedBy, wasAiHandled = false }) {
        loadDb();
        if (!dbData.ai_training_memory) dbData.ai_training_memory = [];
        const example = {
            id: dbData.ai_training_memory.length + 1,
            ticket_id: ticketId,
            category: category || 'general',
            user_query: userQuery,
            resolution: resolution,
            resolved_by: resolvedBy,
            was_ai_handled: wasAiHandled,
            recorded_at: new Date().toISOString()
        };
        dbData.ai_training_memory.push(example);
        saveDb();
        return example;
    },

    // AI Post-Ticket QA Audit Records
    async recordTicketQaAudit(auditData) {
        loadDb();
        if (!dbData.ticket_qa_audits) dbData.ticket_qa_audits = [];
        const record = {
            id: dbData.ticket_qa_audits.length + 1,
            ticket_id: auditData.ticket_id,
            category: auditData.category || 'general',
            staff_id: auditData.staff_id || null,
            customer_id: auditData.customer_id,
            professionalism_score: auditData.professionalism_score || 10,
            resolution_score: auditData.resolution_score || 10,
            feedback_notes: auditData.feedback_notes || 'Excellent resolution.',
            areas_of_improvement: auditData.areas_of_improvement || 'None',
            recorded_at: new Date().toISOString()
        };
        dbData.ticket_qa_audits.push(record);
        saveDb();
        return record;
    },

    async getTicketQaAudits(limit = 20) {
        loadDb();
        if (!dbData.ticket_qa_audits) dbData.ticket_qa_audits = [];
        return dbData.ticket_qa_audits.slice(-limit);
    },

    async getRecentAiTrainingExamples(limit = 6) {
        loadDb();
        if (!dbData.ai_training_memory) dbData.ai_training_memory = [];
        return dbData.ai_training_memory.slice(-limit);
    },

    // Ticket Blacklist Helpers
    async isTicketBlacklisted(userId) {
        loadDb();
        if (!dbData.ticket_blacklist) dbData.ticket_blacklist = {};
        const entry = dbData.ticket_blacklist[userId];
        if (!entry) return false;
        if (entry.expires_at && new Date(entry.expires_at).getTime() < Date.now()) {
            delete dbData.ticket_blacklist[userId];
            saveDb();
            return false;
        }
        return entry;
    },

    async setTicketBlacklist(userId, blacklistedById, reason, hours = null) {
        loadDb();
        if (!dbData.ticket_blacklist) dbData.ticket_blacklist = {};
        const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : null;
        dbData.ticket_blacklist[userId] = {
            user_id: userId,
            blacklisted_by: blacklistedById,
            reason: reason || 'Violation of ticket policies',
            blacklisted_at: new Date().toISOString(),
            expires_at: expiresAt
        };
        saveDb();
        return dbData.ticket_blacklist[userId];
    },

    async removeTicketBlacklist(userId) {
        loadDb();
        if (!dbData.ticket_blacklist) dbData.ticket_blacklist = {};
        const existed = Boolean(dbData.ticket_blacklist[userId]);
        delete dbData.ticket_blacklist[userId];
        saveDb();
        return existed;
    },

    // Ban Appeal Tracking (ensures appeal DMs are dispatched strictly once per banned user)
    async hasBanAppealBeenSent(userId) {
        loadDb();
        if (!dbData.ban_appeals_sent) dbData.ban_appeals_sent = {};
        return Boolean(dbData.ban_appeals_sent[userId]);
    },

    async markBanAppealSent(userId, details = {}) {
        loadDb();
        if (!dbData.ban_appeals_sent) dbData.ban_appeals_sent = {};
        dbData.ban_appeals_sent[userId] = {
            user_id: userId,
            sent_at: new Date().toISOString(),
            ...details
        };
        saveDb();
        return dbData.ban_appeals_sent[userId];
    },

    // Ticket System Configuration Settings
    async getTicketSettings() {
        loadDb();
        if (!dbData.ticket_settings) {
            dbData.ticket_settings = {
                enabled: true,
                disabled_reason: 'Ticket support is temporarily paused for maintenance. Please check back later!',
                panel_image_url: null,
                operating_hours: {
                    enabled: true,
                    start_utc: 8, // 08:00 UTC
                    end_utc: 23,   // 23:00 UTC
                    outside_notice: 'Our human support department operates primarily between **08:00 UTC and 23:00 UTC**. During off-hours, our AI assistant is active, and human staff will respond as soon as they come on duty.'
                },
                panel_channel_id: null,
                panel_message_id: null
            };
            saveDb();
        }
        return dbData.ticket_settings;
    },

    async updateTicketSettings(updates) {
        loadDb();
        if (!dbData.ticket_settings) await this.getTicketSettings();
        Object.assign(dbData.ticket_settings, updates);
        saveDb();
        return dbData.ticket_settings;
    },

    // AI assistant on/off switch (persisted; falls back to config.ai.enabled when never changed)
    isAiEnabled() {
        loadDb();
        const cfg = require('./config');
        return typeof dbData.ai_enabled === 'boolean' ? dbData.ai_enabled : Boolean(cfg.ai && cfg.ai.enabled);
    },

    async setAiEnabled(enabled, changedBy = null) {
        loadDb();
        dbData.ai_enabled = Boolean(enabled);
        dbData.ai_enabled_updated = { by: changedBy, at: new Date().toISOString() };
        saveDb();
        return dbData.ai_enabled;
    },

    async getClosedTicketForReopen(userId, channelOrTicketId = null) {
        loadDb();
        if (!dbData.tickets) dbData.tickets = [];
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
        return dbData.tickets.find(t => 
            t.user_id === userId &&
            t.status === 'CLOSED' &&
            t.closed_at &&
            new Date(t.closed_at).getTime() >= twoHoursAgo &&
            (!channelOrTicketId || t.channel_id === channelOrTicketId || t.id === Number(channelOrTicketId))
        ) || null;
    },

    // Legacy SQL compatible wrappers
    async run(query, params = []) {
        query = query.trim().toUpperCase();
        if (query.startsWith('INSERT INTO SESSIONS')) {
            const id = dbData.sessions.length + 1;
            dbData.sessions.push({ id, host_id: params[0], cohost_id: params[1], store_link: params[2], status: params[3] || 'ACTIVE', started_at: new Date().toISOString() });
            saveDb();
            return { lastID: id };
        }
        if (query.startsWith('UPDATE SESSIONS SET MESSAGE_ID')) {
            const session = dbData.sessions.find(s => s.id === params[1]);
            if (session) session.message_id = params[0];
            saveDb();
            return {};
        }
        if (query.startsWith('UPDATE SESSIONS SET STATUS = \'CONCLUDED\'')) {
            const session = dbData.sessions.find(s => s.id === params[0]);
            if (session) { session.status = 'CONCLUDED'; session.concluded_at = new Date().toISOString(); }
            saveDb();
            return {};
        }

        // TRAININGS
        if (query.startsWith('INSERT INTO TRAININGS')) {
            const id = dbData.trainings.length + 1;
            dbData.trainings.push({ id, host_id: params[0], cohost_id: params[1], type: params[2], status: params[3] || 'ACTIVE', started_at: new Date().toISOString() });
            saveDb();
            return { lastID: id };
        }

        // EVENTS
        if (query.startsWith('INSERT INTO EVENTS')) {
            const id = dbData.events.length + 1;
            dbData.events.push({ id, title: params[0], description: params[1], host_id: params[2], game_link: params[3], event_time: params[4], status: params[5] || 'UPCOMING', rsvp_users: '[]' });
            saveDb();
            return { lastID: id };
        }

        // BUGS
        if (query.startsWith('INSERT INTO BUGS')) {
            const id = dbData.bugs.length + 1;
            dbData.bugs.push({ id, user_id: params[0], title: params[1], details: params[2], steps: params[3], status: params[4] || 'PENDING' });
            saveDb();
            return { lastID: id };
        }

        // SUGGESTIONS
        if (query.startsWith('INSERT INTO SUGGESTIONS')) {
            const id = dbData.suggestions.length + 1;
            dbData.suggestions.push({ id, user_id: params[0], suggestion: params[1], status: params[2] || 'PENDING', upvotes: '[]', downvotes: '[]' });
            saveDb();
            return { lastID: id };
        }

        // TICKETS
        if (query.startsWith('INSERT INTO TICKETS')) {
            const id = dbData.tickets.length + 1;
            dbData.tickets.push({ id, channel_id: params[0], user_id: params[1], type: params[2], status: params[3] || 'OPEN' });
            saveDb();
            return { lastID: id };
        }

        // HONEYPOT LOGS
        if (query.startsWith('INSERT INTO HONEYPOT_LOGS')) {
            const id = dbData.honeypot_logs.length + 1;
            dbData.honeypot_logs.push({ id, user_id: params[0], username: params[1], trigger_reason: params[2], action_taken: params[3], timestamp: new Date().toISOString() });
            saveDb();
            return { lastID: id };
        }

        return {};
    },

    async get(query, params = []) {
        query = query.trim().toUpperCase();
        if (query.includes('FROM SESSIONS WHERE STATUS = \'ACTIVE\'')) {
            return dbData.sessions.filter(s => s.status === 'ACTIVE').pop() || null;
        }
        if (query.includes('FROM TRAININGS WHERE STATUS = \'ACTIVE\'')) {
            return dbData.trainings.filter(t => t.status === 'ACTIVE').pop() || null;
        }
        if (query.includes('FROM BUGS WHERE ID =')) {
            return dbData.bugs.find(b => b.id == params[0]) || null;
        }
        if (query.includes('FROM SUGGESTIONS WHERE ID =')) {
            return dbData.suggestions.find(s => s.id == params[0]) || null;
        }
        if (query.includes('FROM EVENTS WHERE ID =')) {
            return dbData.events.find(e => e.id == params[0]) || null;
        }
        if (query.includes('FROM TICKETS WHERE CHANNEL_ID =')) {
            return dbData.tickets.find(t => t.channel_id == params[0] && t.status == 'OPEN') || null;
        }
        return null;
    },

    async all(query, params = []) {
        query = query.trim().toUpperCase();
        if (query.includes('COUNT(*) AS TOTAL FROM HONEYPOT_LOGS')) {
            return [{ total: dbData.honeypot_logs.length }];
        }
        if (query.includes('FROM HONEYPOT_LOGS ORDER BY ID DESC LIMIT 5')) {
            return [...dbData.honeypot_logs].reverse().slice(0, 5);
        }
        return [];
    },

    // Guess The Number (GTN) Helpers
    async recordGtnWin(userId, number, totalGuesses, userGuesses, durationSeconds, prize = null) {
        loadDb();
        if (!dbData.gtn_games) dbData.gtn_games = [];
        if (!dbData.gtn_stats) dbData.gtn_stats = {};

        const userStats = dbData.gtn_stats[userId] || {
            wins: 0,
            total_guesses: 0,
            best_guesses: null,
            last_win: null
        };

        userStats.wins = (userStats.wins || 0) + 1;
        userStats.total_guesses = (userStats.total_guesses || 0) + userGuesses;
        userStats.best_guesses = userStats.best_guesses !== null
            ? Math.min(userStats.best_guesses, userGuesses)
            : userGuesses;
        userStats.last_win = new Date().toISOString();

        dbData.gtn_stats[userId] = userStats;

        const gameRecord = {
            id: dbData.gtn_games.length + 1,
            winner_id: userId,
            target_number: number,
            total_guesses: totalGuesses,
            user_guesses: userGuesses,
            duration_seconds: durationSeconds,
            prize: prize || null,
            timestamp: new Date().toISOString()
        };
        dbData.gtn_games.push(gameRecord);

        saveDb();
        return { userStats, gameRecord };
    },

    async getGtnLeaderboard(limit = 10) {
        loadDb();
        if (!dbData.gtn_stats) dbData.gtn_stats = {};

        return Object.entries(dbData.gtn_stats)
            .map(([userId, stats]) => ({
                user_id: userId,
                wins: stats.wins || 0,
                total_guesses: stats.total_guesses || 0,
                best_guesses: stats.best_guesses || null,
                last_win: stats.last_win || null
            }))
            .sort((a, b) => b.wins - a.wins || (a.best_guesses || 9999) - (b.best_guesses || 9999))
            .slice(0, limit);
    },

    async getGtnUserStats(userId) {
        loadDb();
        if (!dbData.gtn_stats) dbData.gtn_stats = {};
        return dbData.gtn_stats[userId] || {
            wins: 0,
            total_guesses: 0,
            best_guesses: null,
            last_win: null
        };
    },

    // Internal Affairs (IA) Audio Recordings
    async addIaRecording(data) {
        loadDb();
        if (!dbData.ia_recordings) dbData.ia_recordings = [];
        dbData.ia_recordings.push(data);
        saveDb();
        return data;
    },

    async getIaRecording(id) {
        loadDb();
        if (!dbData.ia_recordings) dbData.ia_recordings = [];
        return dbData.ia_recordings.find(r => r.id === id);
    },

    async listIaRecordings(limit = 25) {
        loadDb();
        if (!dbData.ia_recordings) dbData.ia_recordings = [];
        return [...dbData.ia_recordings]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, limit);
    },

    async deleteIaRecording(id) {
        loadDb();
        if (!dbData.ia_recordings) dbData.ia_recordings = [];
        const initial = dbData.ia_recordings.length;
        dbData.ia_recordings = dbData.ia_recordings.filter(r => r.id !== id);
        saveDb();
        return dbData.ia_recordings.length < initial;
    },

    async cleanupExpiredIaRecordings() {
        loadDb();
        if (!dbData.ia_recordings) return 0;
        const now = Date.now();
        const initial = dbData.ia_recordings.length;
        dbData.ia_recordings = dbData.ia_recordings.filter(r => {
            const exp = new Date(r.expires_at).getTime();
            return isNaN(exp) || exp > now;
        });
        const removed = initial - dbData.ia_recordings.length;
        if (removed > 0) saveDb();
        return removed;
    },

    // Internal Affairs Cases (Dockets)
    async addIaCase(caseData) {
        loadDb();
        if (!dbData.ia_cases) dbData.ia_cases = [];
        dbData.ia_cases.push(caseData);
        saveDb();
        return caseData;
    },

    async getIaCase(id) {
        loadDb();
        if (!dbData.ia_cases) dbData.ia_cases = [];
        return dbData.ia_cases.find(c => c.id.toUpperCase() === id.toUpperCase());
    },

    async updateIaCase(id, updateData) {
        loadDb();
        if (!dbData.ia_cases) dbData.ia_cases = [];
        const index = dbData.ia_cases.findIndex(c => c.id.toUpperCase() === id.toUpperCase());
        if (index === -1) return null;
        dbData.ia_cases[index] = { ...dbData.ia_cases[index], ...updateData, updated_at: new Date().toISOString() };
        saveDb();
        return dbData.ia_cases[index];
    },

    async listIaCases(status = null, limit = 25) {
        loadDb();
        if (!dbData.ia_cases) dbData.ia_cases = [];
        let list = [...dbData.ia_cases];
        if (status) {
            list = list.filter(c => c.status.toLowerCase() === status.toLowerCase());
        }
        return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
    },

    // Anonymous IA Whistleblower Hotline
    async addIaWhistleblow(reportData) {
        loadDb();
        if (!dbData.ia_whistleblows) dbData.ia_whistleblows = [];
        dbData.ia_whistleblows.push(reportData);
        saveDb();
        return reportData;
    },

    async getIaWhistleblow(token) {
        loadDb();
        if (!dbData.ia_whistleblows) dbData.ia_whistleblows = [];
        return dbData.ia_whistleblows.find(w => w.token === token);
    },

    // IA Staff Abuse & Audit Flags
    async addIaAuditFlag(flag) {
        loadDb();
        if (!dbData.ia_audit_flags) dbData.ia_audit_flags = [];
        dbData.ia_audit_flags.push(flag);
        // Keep max 500 flags
        if (dbData.ia_audit_flags.length > 500) {
            dbData.ia_audit_flags = dbData.ia_audit_flags.slice(-500);
        }
        saveDb();
        return flag;
    },

    async getIaAuditFlags(limit = 20) {
        loadDb();
        if (!dbData.ia_audit_flags) dbData.ia_audit_flags = [];
        return [...dbData.ia_audit_flags].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
    },

    // Custom Playlists & Favorites
    async saveServerPlaylist(name, tracks, authorId, guildId) {
        loadDb();
        if (!dbData.music_playlists) dbData.music_playlists = {};
        const key = name.toLowerCase().trim();
        dbData.music_playlists[key] = {
            name,
            tracks,
            authorId,
            guildId,
            updatedAt: new Date().toISOString()
        };
        saveDb();
        return dbData.music_playlists[key];
    },

    async getServerPlaylist(name) {
        loadDb();
        if (!dbData.music_playlists) dbData.music_playlists = {};
        return dbData.music_playlists[name.toLowerCase().trim()] || null;
    },

    async listServerPlaylists() {
        loadDb();
        if (!dbData.music_playlists) dbData.music_playlists = {};
        return Object.values(dbData.music_playlists);
    },

    async deleteServerPlaylist(name) {
        loadDb();
        if (!dbData.music_playlists) dbData.music_playlists = {};
        const key = name.toLowerCase().trim();
        if (dbData.music_playlists[key]) {
            delete dbData.music_playlists[key];
            saveDb();
            return true;
        }
        return false;
    },

    async addUserFavorite(userId, track) {
        loadDb();
        if (!dbData.music_favorites) dbData.music_favorites = {};
        if (!dbData.music_favorites[userId]) dbData.music_favorites[userId] = [];
        const exists = dbData.music_favorites[userId].some(t => t.url === track.url);
        if (!exists) {
            dbData.music_favorites[userId].unshift({
                ...track,
                addedAt: new Date().toISOString()
            });
            if (dbData.music_favorites[userId].length > 50) dbData.music_favorites[userId].pop();
            saveDb();
            return true;
        }
        return false;
    },

    async getUserFavorites(userId) {
        loadDb();
        if (!dbData.music_favorites) dbData.music_favorites = {};
        return dbData.music_favorites[userId] || [];
    },

    async removeUserFavorite(userId, url) {
        loadDb();
        if (!dbData.music_favorites || !dbData.music_favorites[userId]) return false;
        const initial = dbData.music_favorites[userId].length;
        dbData.music_favorites[userId] = dbData.music_favorites[userId].filter(t => t.url !== url);
        if (dbData.music_favorites[userId].length !== initial) {
            saveDb();
            return true;
        }
        return false;
    },

    async getMusicSettings(guildId) {
        loadDb();
        if (!dbData.music_settings) dbData.music_settings = {};
        if (!dbData.music_settings[guildId]) {
            dbData.music_settings[guildId] = {
                djRoleId: null,
                maxTrackSeconds: 900,
                maxQueuePerUser: 10
            };
        }
        return dbData.music_settings[guildId];
    },

    async updateMusicSettings(guildId, settings) {
        loadDb();
        if (!dbData.music_settings) dbData.music_settings = {};
        dbData.music_settings[guildId] = {
            ...(dbData.music_settings[guildId] || {}),
            ...settings
        };
        saveDb();
        return dbData.music_settings[guildId];
    }
};

function getDb() {
    return db;
}

module.exports = {
    initDatabase,
    getDb
};
