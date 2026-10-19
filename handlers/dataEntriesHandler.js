const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../database');
const config = require('../config');
const { fetchRobloxUserProfile } = require('../utils/robloxLookup');

/**
 * Parses staff data entry submissions, extracts credentials,
 * and synchronizes them into the FreshlyPlaza database.
 */
function parseStaffDataEntry(text, fallbackUserId) {
    const getField = (pattern) => {
        const m = text.match(pattern);
        return m ? m[1].trim() : null;
    };

    const discordIdMatch = getField(/Discord ID[^\n:=]*[:=]\s*(\d+)/i);
    const discordId = discordIdMatch || fallbackUserId;

    const robloxUsername = getField(/Roblox Username\s*[:=]\s*([a-zA-Z0-9_]+)/i);
    const robloxId = getField(/Roblox Profile ID\s*[:=]\s*(\d+)/i);
    const preferredName = getField(/(?:Preferred Name|Nickname)\s*[:=]\s*(.*?)(?=\r?\n|$)/i);
    const rank = getField(/Current Staff Rank\s*[:=]\s*(.*?)(?=\s*Date Joined|\r?\n|$)/i);
    const joinedStaffAt = getField(/Date Joined[^\n:=]*[:=]\s*(.*?)(?=\r?\n|Timezone|$)/i);
    const timezone = getField(/Timezone[^\n:=]*[:=]\s*(.*?)(?=\r?\n|Typical Weekly|$)/i);
    const weeklyAvailability = getField(/Typical Weekly Availability[^\n:=]*[:=]\s*(.*?)(?=\r?\n|Primary Department|$)/i);
    const department = getField(/Primary Department[^\n:=]*[:=]\s*(.*?)(?=\r?\n|Willing to Host|$)/i);
    const willingTrainings = getField(/Willing to Host[^\n:=]*[:=]\s*(.*?)(?=\r?\n|Current LOA|$)/i);
    const loaStatus = getField(/Current LOA Status[^\n:=]*[:=]\s*(.*?)(?=\r?\n|Additional Notes|$)/i);
    const notes = getField(/Additional Notes[^\n:=]*[:=]\s*(.*?)(?=\r?\n|$)/i);

    return {
        discord_id: discordId,
        preferred_name: preferredName,
        roblox_username: robloxUsername,
        roblox_id: robloxId,
        rank: rank,
        joined_staff_at: joinedStaffAt,
        timezone: timezone,
        weekly_availability: weeklyAvailability,
        department: department,
        willing_to_host_trainings: willingTrainings,
        loa_status: loaStatus,
        notes: notes
    };
}

/**
 * Fixes Spelling, Punctuation, and Grammar (SPaG) for text fields
 * using Groq AI with a robust fallback.
 */
async function fixSpagDataEntry(parsed) {
    const apiKey = getDb().isAiEnabled() ? process.env.GROQ_API_KEY : null;
    const correctionsSummary = [];

    // Local deterministic rule-based corrections (always executed first)
    const ruleBasedClean = (str) => {
        if (!str || typeof str !== 'string') return str;
        let s = str.trim();
        // Capitalize standalone lowercase "i" -> "I"
        s = s.replace(/\bi\b/g, 'I');
        // Fix lowercase "i am" / "i'm"
        s = s.replace(/\bi'm\b/gi, "I'm");
        // Capitalize days of the week
        s = s.replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi, (match) => {
            return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
        });
        // Capitalize months
        s = s.replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, (match) => {
            return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
        });
        // Standardize LOA casing
        s = s.replace(/\bloa\b/gi, 'LOA');
        // Capitalize first character of sentence if letter
        if (s.length > 0 && /^[a-z]/.test(s)) {
            s = s.charAt(0).toUpperCase() + s.slice(1);
        }
        return s;
    };

    if (parsed.joined_staff_at) parsed.joined_staff_at = ruleBasedClean(parsed.joined_staff_at);
    if (parsed.weekly_availability) parsed.weekly_availability = ruleBasedClean(parsed.weekly_availability);
    if (parsed.notes) parsed.notes = ruleBasedClean(parsed.notes);
    if (parsed.loa_status) parsed.loa_status = ruleBasedClean(parsed.loa_status);

    // Standardize department
    if (parsed.department) {
        const depLower = parsed.department.toLowerCase();
        if (depLower.includes('manage')) parsed.department = 'Management';
        else if (depLower.includes('till') || depLower.includes('checkout')) parsed.department = 'Till';
        else if (depLower.includes('stock')) parsed.department = 'Stock';
        else if (depLower.includes('security')) parsed.department = 'Security';
        else parsed.department = ruleBasedClean(parsed.department);
    }

    // Standardize Willing to Host
    if (parsed.willing_to_host_trainings) {
        const wLower = parsed.willing_to_host_trainings.toLowerCase();
        if (wLower.startsWith('y') || wLower.includes('yes') || wLower.includes('sure')) {
            parsed.willing_to_host_trainings = 'Yes';
        } else if (wLower.startsWith('n') || wLower.includes('no')) {
            parsed.willing_to_host_trainings = 'No';
        }
    }

    // Standardize Timezone
    if (parsed.timezone) {
        parsed.timezone = parsed.timezone.toUpperCase().replace(/\s+/g, '');
    }

    if (!apiKey) {
        return { parsed, correctionsSummary: ['Applied rule-based capitalization and formatting'] };
    }

    // Pass natural language fields to AI for high-accuracy SPaG polishing
    try {
        const payloadFields = {
            rank: parsed.rank,
            joined_staff_at: parsed.joined_staff_at,
            weekly_availability: parsed.weekly_availability,
            loa_status: parsed.loa_status,
            notes: parsed.notes
        };

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
                        content: 'You fix spelling, punctuation, capitalization, and grammar (SPaG) for staff profile fields in a Roblox supermarket (FreshlyPlaza).\n' +
                                 'CRITICAL RULES:\n' +
                                 '1. Do NOT modify Roblox usernames, Discord IDs, or Roblox IDs.\n' +
                                 '2. Fix typos, capitalization (e.g. capitalize standalone "I", months, days, first letters of sentences), commas, and grammar in text fields.\n' +
                                 '3. Standardize rank names if misspelled (e.g., "Board of Directors").\n' +
                                 '4. Preserve original meaning and tone; do not invent new facts.\n' +
                                 '5. Return JSON: { "corrected_fields": { ... }, "corrections_summary": [ "Brief summary of fixes" ] }'
                    },
                    {
                        role: 'user',
                        content: JSON.stringify(payloadFields)
                    }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1
            }),
            signal: AbortSignal.timeout(6000)
        });

        if (response.ok) {
            const data = await response.json();
            const rawContent = data.choices?.[0]?.message?.content;
            if (rawContent) {
                const result = JSON.parse(rawContent);
                const corrected = result.corrected_fields || {};
                if (corrected.rank) parsed.rank = corrected.rank;
                if (corrected.joined_staff_at) parsed.joined_staff_at = corrected.joined_staff_at;
                if (corrected.weekly_availability) parsed.weekly_availability = corrected.weekly_availability;
                if (corrected.loa_status) parsed.loa_status = corrected.loa_status;
                if (corrected.notes) parsed.notes = corrected.notes;

                if (Array.isArray(result.corrections_summary) && result.corrections_summary.length > 0) {
                    correctionsSummary.push(...result.corrections_summary);
                }
            }
        }
    } catch (aiErr) {
        console.warn('[SPaG AI PARSER WARNING] Falling back to rule-based correction:', aiErr.message);
    }

    return { parsed, correctionsSummary };
}

async function handleDataEntriesMessage(message) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content;
    const channelName = message.channel.name.toLowerCase();

    const isDedicatedDataEntriesChannel = (config.channels.dataEntries && config.channels.dataEntries === message.channel.id) ||
                                          (channelName === 'data-entries' || channelName === '📋・data-entries');

    // STRICT ISOLATION: The AI must ONLY analyze and react inside the dedicated #📋・data-entries channel.
    // Never process or react in support tickets, staff chat, or other channels.
    if (!isDedicatedDataEntriesChannel) {
        return;
    }

    const hasHeader = content.includes('FRESHLYPLAZA STAFF DATA ENTRY') ||
                      (content.includes('Preferred Name') && content.includes('Roblox Username'));

    // If in target channel but no header/template is provided, check if format is followed
    let parsed = parseStaffDataEntry(content, message.author.id);

    // Strict Format Validation:
    // Requires Roblox username, rank, and at least one other standard field (timezone or preferred name)
    const isFormatFollowed = Boolean(
        parsed.roblox_username && 
        parsed.rank && 
        (hasHeader || (parsed.preferred_name && parsed.timezone))
    );

    if (!isFormatFollowed) {
        try {
            await message.react('❌');
        } catch (e) {}
        return;
    }

    try {
        await message.channel.sendTyping();
    } catch (e) {}

    // Automatically fix Spelling, Punctuation, and Grammar (SPaG)
    let spagNotes = [];
    try {
        const spagResult = await fixSpagDataEntry(parsed);
        parsed = spagResult.parsed;
        spagNotes = spagResult.correctionsSummary || [];
    } catch (e) {
        console.error('[SPaG ERROR]', e);
    }

    const db = getDb();

    // If roblox profile ID was omitted, attempt auto-resolution
    let robloxProfile = null;
    if (parsed.roblox_username && !parsed.roblox_id) {
        try {
            robloxProfile = await fetchRobloxUserProfile(parsed.roblox_username);
            if (robloxProfile && robloxProfile.id) {
                parsed.roblox_id = String(robloxProfile.id);
            }
        } catch (e) {}
    } else if (parsed.roblox_id) {
        try {
            robloxProfile = await fetchRobloxUserProfile(parsed.roblox_id);
        } catch (e) {}
    }

    // Save directly to freshlyplaza_db.json
    const updatedProfile = await db.saveStaffDataEntry(parsed);

    // React with emojis to confirm processing
    try {
        await message.react('✅');
        await message.react('📁');
    } catch (e) {}

    // Build rich confirmation response
    const confirmEmbed = new EmbedBuilder()
        .setTitle('📁 Staff Profile Synced & Registered into Database')
        .setDescription(
            `Successfully processed and indexed staff roster credentials for <@${parsed.discord_id}>!\n` +
            `All metrics have been permanently synchronized into \`freshlyplaza_db.json\` with **SPaG (Spelling, Punctuation & Grammar) corrections automatically applied**.`
        )
        .addFields(
            { name: '👤 Staff Member', value: `<@${parsed.discord_id}> (\`${parsed.discord_id}\`)`, inline: true },
            { name: '🏷️ Preferred Name', value: parsed.preferred_name ? `\`${parsed.preferred_name}\`` : '*Not specified*', inline: true },
            { 
                name: '🎮 Roblox Account', 
                value: parsed.roblox_username 
                    ? `[**${parsed.roblox_username}**](https://www.roblox.com/users/${parsed.roblox_id || '0'}/profile) (ID: \`${parsed.roblox_id || 'N/A'}\`)`
                    : '*Not specified*', 
                inline: true 
            },
            { name: '🛡️ Current Rank', value: parsed.rank ? `**${parsed.rank}**` : '*Not specified*', inline: true },
            { name: '🏢 Department', value: parsed.department ? `\`${parsed.department}\`` : '*Not specified*', inline: true },
            { name: '📅 Date Joined', value: parsed.joined_staff_at || '*Not specified*', inline: true },
            { name: '🌐 Timezone', value: parsed.timezone ? `\`${parsed.timezone}\`` : '*Not specified*', inline: true },
            { name: '🎓 Host Trainings', value: parsed.willing_to_host_trainings || '*N/A*', inline: true },
            { name: '🌴 LOA Status', value: parsed.loa_status ? `\`${parsed.loa_status}\`` : '`Active`', inline: true },
            { name: '⏰ Weekly Availability', value: parsed.weekly_availability ? `> ${parsed.weekly_availability}` : '*Not specified*', inline: false }
        )
        .setColor(config.colors.primary)
        .setThumbnail(robloxProfile?.headshotUrl || message.author.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'FreshlyPlaza Roster AI Parser • SPaG Cleaned', iconURL: message.guild.iconURL() })
        .setTimestamp();

    if (parsed.notes) {
        confirmEmbed.addFields({ name: '📝 Additional Notes', value: parsed.notes, inline: false });
    }

    if (spagNotes.length > 0) {
        confirmEmbed.addFields({
            name: '✨ SPaG Enhancements Applied',
            value: spagNotes.slice(0, 3).map(s => `• ${s}`).join('\n'),
            inline: false
        });
    }

    await message.channel.send({
        content: `✅ <@${message.author.id}>, your staff data entry has been grammar-checked, analyzed, and saved to the database!`,
        embeds: [confirmEmbed]
    });
}

module.exports = { handleDataEntriesMessage, parseStaffDataEntry, fixSpagDataEntry };
