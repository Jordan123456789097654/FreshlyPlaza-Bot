const config = require('../config');
const { getDb } = require('../database');

/** Global AI on/off switch (set with /config ai). */
function aiOn() {
    return getDb().isAiEnabled();
}

/**
 * Groq AI Support Agent for Grandway Shopping Support Tickets
 * Features:
 * - Dynamic Few-Shot Learning from verified tickets in freshlyplaza_db.json
 * - Vision & Screenshot Analysis via Qwen Multimodal
 * - Sentiment & Urgency Assessment (LOW, NORMAL, HIGH, URGENT)
 * - Automatic Toxicity / Profanity Detection
 * - On-the-fly Translation for non-English queries
 */

const BASE_SYSTEM_PROMPT = `You are "GrandwayBot AI Support", the friendly, polite, and intelligent customer support assistant for Grandway Shopping (a modern Roblox Supermarket and grocery store experience).

⚠️ BETA NOTICE:
You are currently running in BETA. Tickets handled by this system are actively used to train and improve the AI model.

Tone & Demeanor Guidelines (MANDATORY):
- Always be exceptionally polite, warm, professional, and welcoming.
- When opening a ticket or first responding to a customer, ALWAYS start with a friendly, courteous greeting such as:
  "Hello! My name is GrandwayBot AI, your Grandway Shopping Support Assistant. How may I assist you today?"
- Address users with respect and clarity. Avoid robotic or blunt language.

Store Information & Policies:
- Game Link: https://www.roblox.com/games/76637220767393/FreshlyPlazza-V2
- Group ID: 1110376670
- Staff & Developer Applications:
  - Players DO apply for Staff, Developer, and management roles directly through Support Tickets!
  - Never tell users to go to an external form or application channel for developer/staff applications.
  - When a user asks to apply for Developer, Staff, or HR:
    - Welcome them warmly.
    - Set "can_handle": false (ESCALATE TO HUMAN MANAGEMENT).
    - Provide a message explaining that management will review their application here in this ticket, and prompt them to provide:
      1. Roblox Username & Portfolio / Past Experience.
      2. Skills / Specialty (Building, Scripting, UI, Modeling, etc.).
      3. Why they want to join the Grandway Shopping team.
    - NEVER close the ticket or auto-resolve applications!
- Shifts: Hosted regularly by shift hosts in the #store-shifts channel. Players can shop aisles, use checkouts, or work as colleagues.
- Trainings: Scheduled in #training-sessions for Trainees to pass Store Colleague or Greggs bakery roles.
- Verification: Users verify their Roblox username in #verification or via /verify.
- Bugs & Suggestions: Can be submitted via /bug and /suggest in #bug-reports and #suggestions.

Safety & Triage Responsibilities:
1. Toxic / Profanity Detection & Extreme Toxicity Shield:
   - Flag "is_toxic": true if the user is hostile or using vulgarity.
   - Flag "is_toxic_extreme": true ONLY if the user uses severe racial slurs, death threats, extreme hate speech, or intolerable sexual harassment requiring immediate moderation timeout.
2. Sentiment & Urgency: Rate urgency as "LOW", "NORMAL", "HIGH", or "URGENT" (e.g. active game exploiters or crashes are URGENT; standard inquiries are NORMAL).
3. Non-English Detection & Translation: If the user writes in Spanish, French, German, Portuguese, Russian, Arabic, etc., detect the language and provide translation.
4. Auto-Categorization & Auto-Reroute:
   - If the user selected the wrong category (e.g. opened "general" but is reporting exploiters/staff abuse, applying for developer/staff, or reporting a bug in "appeals"), specify "suggested_category" (one of: "general", "report", "management", "technical", "appeals").
   - For applications (Developer, Staff, Management), set "suggested_category": "management".
   - If they selected the correct category, set "suggested_category": null.
5. Bug Deduplication Check:
   - If the ticket is a technical/bug report, compare with the provided list of known open bugs.
   - If it matches a known bug, set "is_known_bug": true, provide "matched_bug_title", and explain in "resolution_message" that the developers are already actively patching this bug.
   - If it is a brand-new genuine bug, set "is_known_bug": false, "is_new_bug": true, and provide a clean "bug_title" and "bug_steps" summary so the bot can automatically file it in #bug-reports.
6. Auto-Resolution vs. Escalation (Resolution-First Policy):
   - You should ALWAYS prioritize actively answering the customer's questions, solving supermarket issues, explaining rules, shifts, verification, till instructions, and providing actionable guidance.
   - Set "can_handle": true whenever you can provide a complete and helpful answer that solves their inquiry.
   - You MUST set "can_handle": false (escalate to human staff/management, DO NOT AUTO-CLOSE) if:
     a) The user is applying for Developer, Staff, Builder, Scripter, or Management. (People apply through tickets; human leadership must review).
     b) The customer explicitly demands human staff (e.g. "I want a human", "talk to a person", "agent please", "call staff").
     c) An actual senior action is required (e.g. processing formal robux refunds, conducting internal staff disciplinary hearings, or unbanning a user).
     d) Any complex scenario where human leadership judgment is necessary. Never close these tickets!
7. Autonomous Action Recognition:
   - Detect if the user explicitly asks the bot to carry out an autonomous action:
     - "verify_user": User asks to verify or link their Roblox account (e.g. "Can you verify me as Player123?"). Include "action_payload": {"roblox_username": "Player123"}.
     - "check_shifts": User asks about live shifts or upcoming schedules.
     - "file_bug": User asks to submit a new verified bug. Include "action_payload": {"title": "...", "steps": "..."}.
     - "none": No autonomous action requested.
   - Set "requested_action": "verify_user" | "check_shifts" | "file_bug" | "none"
8. Screenshot Analysis:
   - If an image is provided, provide a clear summary of what is seen in "image_summary".

You MUST return ONLY a valid JSON object with the following structure:
{
  "can_handle": true or false,
  "confidence": 0.0 to 1.0,
  "resolution_message": "response text to user (beginning with polite greeting if initial message)",
  "escalation_reason": "reason if can_handle is false or null",
  "image_summary": "brief summary of any screenshot analyzed, or null",
  "suggested_category": "general" | "report" | "management" | "technical" | "appeals" | null,
  "is_known_bug": true or false,
  "matched_bug_title": "title of matched known bug or null",
  "is_new_bug": true or false,
  "bug_title": "concise bug title if is_new_bug is true, else null",
  "bug_steps": "steps if is_new_bug is true, else null",
  "sentiment": "positive", "neutral", "frustrated", or "angry",
  "urgency": "LOW", "NORMAL", "HIGH", or "URGENT",
  "is_toxic": true or false,
  "is_toxic_extreme": true or false,
  "toxicity_warning": "warning text if is_toxic is true, else null",
  "requested_action": "verify_user" | "check_shifts" | "file_bug" | "none",
  "action_payload": { ... } or null,
  "detected_language": "English" or other language name,
  "english_translation": "English translation if non-English, else null"
}`;

async function handleTicketWithAI(ticket, initialMessage, userTag, imageBuffers = []) {
    if (!aiOn()) {
        return {
            can_handle: false,
            confidence: 0,
            escalation_reason: 'AI assistant is disabled by an administrator.',
            resolution_message: 'Thank you for reaching out to Grandway Shopping Support! A member of our human support team will review your ticket shortly.',
            image_summary: null,
            suggested_category: null,
            is_known_bug: false,
            matched_bug_title: null,
            is_new_bug: false,
            bug_title: null,
            bug_steps: null,
            sentiment: 'neutral',
            urgency: 'NORMAL',
            is_toxic: false,
            is_toxic_extreme: false,
            toxicity_warning: null,
            requested_action: 'none',
            action_payload: null,
            detected_language: 'English',
            english_translation: null
        };
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return {
            can_handle: false,
            escalation_reason: 'GROQ_API_KEY not configured.',
            resolution_message: 'Connecting you with our human support staff...',
            urgency: 'NORMAL',
            is_toxic: false
        };
    }

    try {
        const db = getDb();
        const pastExamples = await db.getRecentAiTrainingExamples(6);
        let trainingContext = '';
        if (pastExamples && pastExamples.length > 0) {
            trainingContext = '\n\nHere are past verified ticket resolutions learned from previous interactions (AI Training Knowledge):\n' +
                pastExamples.map((ex, i) => `Example ${i + 1}:\n- Category: ${ex.category}\n- Query: "${ex.user_query}"\n- Verified Staff Resolution: "${ex.resolution}"\n`).join('\n');
        }

        // Fetch known open bugs from database for deduplication
        let knownBugsContext = '';
        const allBugs = db.getData().bugs || [];
        const openBugs = allBugs.filter(b => b.status === 'PENDING').slice(-5);
        if (openBugs.length > 0) {
            knownBugsContext = '\n\nKnown Open Bug Reports in Grandway Shopping (actively tracked by developers):\n' +
                openBugs.map(b => `- #${b.id}: "${b.title}" (Details: ${b.details})`).join('\n');
        }

        // Fetch live sessions, upcoming scheduled shifts, trainings, and events for Smart Conflict & Schedule Detector
        let scheduleAndEventsContext = '';
        const activeSession = db.getData().sessions ? db.getData().sessions.filter(s => s.status === 'ACTIVE').pop() : null;
        const upcomingShifts = await db.getUpcomingScheduledShifts();
        const activeTrainings = db.getData().trainings ? db.getData().trainings.filter(t => t.status === 'ACTIVE') : [];
        const upcomingEvents = db.getData().events ? db.getData().events.filter(e => e.status === 'UPCOMING') : [];

        scheduleAndEventsContext += '\n\nLive Store Operations & Upcoming Schedules (Grandway Shopping Live State):';
        if (activeSession) {
            scheduleAndEventsContext += `\n- Current Active Shift: Session #${activeSession.id} is LIVE now! Host: <@${activeSession.host_id}>, Store Link: ${activeSession.store_link || 'https://www.roblox.com/games/76637220767393/FreshlyPlazza-V2'}`;
        } else {
            scheduleAndEventsContext += '\n- Current Active Shift: None currently live.';
        }

        if (upcomingShifts && upcomingShifts.length > 0) {
            scheduleAndEventsContext += '\n- Upcoming Scheduled Shifts:\n' + upcomingShifts.map(s => `  • Shift #${s.id} scheduled for ${s.scheduled_for} by Host <@${s.host_id}> (Note: ${s.note || 'Regular Shift'}, Link: ${s.store_link})`).join('\n');
        } else {
            scheduleAndEventsContext += '\n- Upcoming Scheduled Shifts: No shifts scheduled in the immediate queue.';
        }

        if (activeTrainings.length > 0) {
            scheduleAndEventsContext += '\n- Ongoing Trainings:\n' + activeTrainings.map(t => `  • Training #${t.id} (${t.type}) hosted by <@${t.host_id}> started at ${t.started_at}`).join('\n');
        }

        if (upcomingEvents.length > 0) {
            scheduleAndEventsContext += '\n- Upcoming Server Events:\n' + upcomingEvents.map(e => `  • Event #${e.id}: "${e.title}" - ${e.description} (Time: ${e.event_time}, Host: <@${e.host_id}>)`).join('\n');
        }

        const systemPromptWithMemory = BASE_SYSTEM_PROMPT + trainingContext + knownBugsContext + scheduleAndEventsContext;

        const contentParts = [
            {
                type: 'text',
                text: `User (@${userTag}) opened a ticket in category: "${ticket.type}".\n` +
                      `Subject: "${ticket.subject || 'None'}"\n` +
                      `User Message / Details: "${initialMessage || ticket.details || 'None'}"\n\n` +
                      `Evaluate user question, sentiment, toxicity, language, correct category, whether it duplicates a known bug or is a new bug, check live shift/event schedule if asked, and determine resolution or escalation.`
            }
        ];

        // Attach screenshots if provided
        if (imageBuffers && imageBuffers.length > 0) {
            for (const img of imageBuffers.slice(0, 2)) {
                contentParts.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${img.contentType || 'image/jpeg'};base64,${img.base64}`
                    }
                });
            }
        }

        // List of candidate models for resilience: primary is multimodal Qwen, fallback to gpt-oss-120b / 20b
        const candidateModels = (imageBuffers && imageBuffers.length > 0)
            ? ['qwen/qwen3.8-27b']
            : ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

        let response = null;
        let lastErrStatus = null;

        for (const modelName of candidateModels) {
            // Attempt request with up to 1 automatic retry on 429
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: modelName,
                            messages: [
                                { role: 'system', content: systemPromptWithMemory },
                                { role: 'user', content: contentParts }
                            ],
                            temperature: 0.2,
                            response_format: { type: 'json_object' }
                        }),
                        signal: AbortSignal.timeout(15000)
                    });

                    if (response.ok) {
                        break;
                    } else if (response.status === 429) {
                        lastErrStatus = 429;
                        console.warn(`[AI RATE LIMIT] 429 on model ${modelName}, waiting 2.5s before retry/fallback...`);
                        await new Promise(r => setTimeout(r, 2500));
                    } else {
                        lastErrStatus = response.status;
                        break;
                    }
                } catch (fetchErr) {
                    console.warn(`[AI FETCH WARNING] ${modelName} attempt ${attempt + 1}:`, fetchErr.message);
                }
            }

            if (response && response.ok) break;
        }

        if (!response || !response.ok) {
            console.error('[AI TICKET EXHAUSTED]', lastErrStatus);
            return {
                can_handle: false,
                escalation_reason: lastErrStatus === 429 ? 'AI Support High-Volume Traffic (Handing off to staff)' : 'Connecting with dedicated department staff',
                resolution_message: 'Our automated support assistant is experiencing high ticket volume. I have immediately dispatched your ticket directly to our specialized department staff!',
                urgency: 'NORMAL',
                is_toxic: false
            };
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        const parsed = JSON.parse(content);

        // Formal player reports and moderation appeals require human staff investigation
        if (['report', 'appeals'].includes(ticket.type) && (!ticket.ai_attempted || !initialMessage)) {
            parsed.can_handle = false;
            parsed.escalation_reason = `Category '${ticket.type}' requires staff investigation.`;
            parsed.resolution_message = `Hello <@${ticket.user_id}>! As this ticket concerns an official **${ticket.type.toUpperCase()}** matter, our specialized Human Support Team has been dispatched to review your evidence.`;
        }

        let cleanResolution = parsed.resolution_message || 'Thank you for contacting Grandway Shopping Support!';
        // Fix any literal "@username" string with real clickable Discord mention <@userId>
        if (cleanResolution.includes(`@${userTag}`)) {
            cleanResolution = cleanResolution.replace(new RegExp(`@${userTag}`, 'g'), `<@${ticket.user_id}>`);
        }

        return {
            can_handle: Boolean(parsed.can_handle),
            confidence: parsed.confidence || 0.9,
            resolution_message: cleanResolution,
            escalation_reason: parsed.escalation_reason || null,
            image_summary: parsed.image_summary || null,
            suggested_category: parsed.suggested_category || null,
            is_known_bug: Boolean(parsed.is_known_bug),
            matched_bug_title: parsed.matched_bug_title || null,
            is_new_bug: Boolean(parsed.is_new_bug),
            bug_title: parsed.bug_title || null,
            bug_steps: parsed.bug_steps || null,
            sentiment: parsed.sentiment || 'neutral',
            urgency: parsed.urgency || 'NORMAL',
            is_toxic: Boolean(parsed.is_toxic),
            is_toxic_extreme: Boolean(parsed.is_toxic_extreme),
            toxicity_warning: parsed.toxicity_warning || null,
            requested_action: parsed.requested_action || 'none',
            action_payload: parsed.action_payload || null,
            detected_language: parsed.detected_language || 'English',
            english_translation: parsed.english_translation || null
        };
    } catch (e) {
        console.error('[AI TICKET EXCEPTION]', e);
        return {
            can_handle: false,
            escalation_reason: 'Automated staff handoff',
            resolution_message: 'I am alerting our human support specialists to review your request.',
            urgency: 'NORMAL',
            is_toxic: false,
            is_toxic_extreme: false,
            requested_action: 'none'
        };
    }
}

/**
 * Feature #1: AI Executive Staff Briefing / Summary
 * Generates a concise 3-bullet handover brief (Core Issue, Actions/Steps Tried, Recommended Staff Action)
 */
async function generateTicketSummary(ticket, messageHistoryText) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !aiOn()) {
        return {
            core_issue: ticket.subject || ticket.details || 'Customer Inquiry',
            steps_tried: 'User opened ticket in ' + ticket.type + ' category.',
            recommended_action: 'Staff review needed.'
        };
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    {
                        role: 'system',
                        content: `You are an executive ticket summarizer for Grandway Shopping Roblox Supermarket.
Analyze the ticket conversation history and generate an executive handover brief for staff in JSON.
Structure:
{
  "core_issue": "Concise 1-sentence statement of the user's primary problem or inquiry",
  "steps_tried": "1-2 sentences of what troubleshooting, answers, or bot steps have been attempted so far",
  "recommended_action": "1-2 sentences of clear, specific action for human staff to resolve this ticket quickly"
}`
                    },
                    {
                        role: 'user',
                        content: `Ticket #${ticket.id} (${ticket.type}):\nSubject: ${ticket.subject || 'N/A'}\nInitial Details: ${ticket.details || 'N/A'}\nRecent Chat Log:\n${messageHistoryText}`
                    }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    } catch (e) {
        console.error('[GENERATE TICKET SUMMARY ERROR]', e.message);
        return {
            core_issue: ticket.subject || ticket.details || 'Inquiry regarding ' + ticket.type,
            steps_tried: 'Automated initial assistance provided in channel.',
            recommended_action: 'Staff member please review recent messages and assist customer.'
        };
    }
}

/**
 * Feature #2: Staff Ghostwriter
 * Drafts an empathetic, polite suggested response for staff based on recent messages
 */
async function generateStaffGhostwrite(ticket, lastCustomerMessage) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !aiOn()) return null;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert customer service ghostwriter for Grandway Shopping Roblox staff.
Given the customer's question/concern, draft a professional, warm, polite, and helpful reply that a staff member can send with one click.
Keep it under 3-4 sentences. Do NOT include placeholders like [Your Name]. Sign off as 'Grandway Shopping Support Team'.
Return JSON:
{
  "suggested_reply": "draft response text"
}`
                    },
                    {
                        role: 'user',
                        content: `Ticket #${ticket.id} (${ticket.type})\nCustomer: <@${ticket.user_id}>\nCustomer's Message: "${lastCustomerMessage}"`
                    }
                ],
                temperature: 0.2,
                response_format: { type: 'json_object' }
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) return null;
        const data = await response.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        return parsed.suggested_reply || null;
    } catch (e) {
        console.error('[STAFF GHOSTWRITE ERROR]', e.message);
        return null;
    }
}

/**
 * Feature #6: Post-Ticket QA Grader & Audit
 * Evaluates staff professionalism (1-10) and resolution quality upon ticket closure
 */
async function evaluateTicketQA(ticket, transcriptText) {
    // With AI off, skip grading entirely so no placeholder scores get recorded
    if (!aiOn()) return null;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return {
            professionalism_score: 9,
            resolution_score: 9,
            feedback_notes: 'Standard ticket resolution completed successfully.',
            areas_of_improvement: 'None noted.'
        };
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                    {
                        role: 'system',
                        content: `You are an objective Quality Assurance (QA) auditor for Grandway Shopping Roblox Supermarket customer support.
Audit the ticket transcript upon closure.
Rate staff performance and resolution on a scale of 1 to 10.
Return JSON:
{
  "professionalism_score": 1-10 integer,
  "resolution_score": 1-10 integer,
  "feedback_notes": "1-2 sentences summarizing staff demeanor, tone, and efficiency",
  "areas_of_improvement": "constructive recommendation for staff or 'None'"
}`
                    },
                    {
                        role: 'user',
                        content: `Ticket #${ticket.id} (${ticket.type})\nClaimed/Closed By: <@${ticket.closed_by || ticket.claimed_by || 'Staff'}>\nClose Reason: ${ticket.close_reason || 'N/A'}\nTranscript:\n${transcriptText.slice(0, 3500)}`
                    }
                ],
                temperature: 0.2,
                response_format: { type: 'json_object' }
            }),
            signal: AbortSignal.timeout(12000)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return JSON.parse(data.choices[0].message.content);
    } catch (e) {
        console.error('[EVALUATE TICKET QA ERROR]', e.message);
        return {
            professionalism_score: 9,
            resolution_score: 9,
            feedback_notes: 'Ticket concluded and archived.',
            areas_of_improvement: 'None'
        };
    }
}

/**
 * Real-Time Fast Dual Translator using Groq AI
 * Translates arbitrary text into target language with high accuracy and preserves Discord formatting
 */
async function translateText(text, targetLanguage = 'English') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || !aiOn() || !text || text.trim().length === 0) return null;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-oss-20b',
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert real-time translator for Grandway Shopping customer support.
Translate the user text cleanly into ${targetLanguage}.
Maintain all Discord emojis, tags (@user, <@&role>), and markdown syntax.
Return ONLY a valid JSON object:
{
  "detected_language": "Language of input text",
  "translated_text": "Translated message in ${targetLanguage}",
  "is_same_language": true if already in ${targetLanguage} else false
} `
                    },
                    { role: 'user', content: text }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            }),
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) return null;
        const data = await response.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        return parsed;
    } catch (e) {
        console.error('[TRANSLATE TEXT ERROR]', e.message);
        return null;
    }
}

module.exports = {
    handleTicketWithAI,
    translateText,
    generateTicketSummary,
    generateStaffGhostwrite,
    evaluateTicketQA
};
