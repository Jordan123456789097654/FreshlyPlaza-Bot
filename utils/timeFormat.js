/**
 * Smart natural language & formatted string time parser
 * Parses inputs like "1:00 PM", "1:00pm", "13:00", "5pm", "Oct 28 2026 13:00", "<t:1793204954:R>", "in 2 hours", "in 30 mins"
 */
function parseScheduledTime(str, refDate = new Date()) {
    if (!str || typeof str !== 'string') return null;
    str = str.trim();

    // 1. Discord timestamp tag <t:1730138400:F> or raw unix timestamp
    const discordTzMatch = str.match(/<t:(\d+)(?::[a-zA-Z])?>/);
    if (discordTzMatch) {
        const sec = parseInt(discordTzMatch[1], 10);
        return new Date(sec * 1000);
    }
    if (/^\d{10}$/.test(str)) {
        return new Date(parseInt(str, 10) * 1000);
    }

    // 2. Relative time like "in 2 hours", "in 45 mins", "in 30m"
    const relMatch = str.match(/in\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|days)/i);
    if (relMatch) {
        const amount = parseInt(relMatch[1], 10);
        const unit = relMatch[2].toLowerCase();
        let addMs = 0;
        if (unit.startsWith('m')) addMs = amount * 60 * 1000;
        else if (unit.startsWith('h')) addMs = amount * 60 * 60 * 1000;
        else if (unit.startsWith('d')) addMs = amount * 24 * 60 * 60 * 1000;
        return new Date(refDate.getTime() + addMs);
    }

    // 3. Direct standard Date string (e.g. "Oct 28 2026 13:00", "2026-10-28 1:00 PM")
    const directDate = new Date(str);
    if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 2020) {
        return directDate;
    }

    // 4. Time format like "1:00 PM", "1pm", "13:00", "5:30 am"
    const timeMatch = str.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const mins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const meridian = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

        if (meridian === 'pm' && hours < 12) hours += 12;
        if (meridian === 'am' && hours === 12) hours = 0;

        const target = new Date(refDate);
        target.setSeconds(0, 0);
        target.setHours(hours, mins);

        // If time is earlier than reference time by more than 30 mins, assume tomorrow
        if (target.getTime() < refDate.getTime() - 30 * 60 * 1000) {
            target.setDate(target.getDate() + 1);
        }
        return target;
    }

    return null;
}

/**
 * Utility to format a timestamp across multiple major global timezones
 * for international community members (UK/BST/GMT, US Eastern, US Central, US Pacific, CET/Europe, AEST/Australia).
 */
function formatWorldTime(dateOrTimestamp) {
    const d = typeof dateOrTimestamp === 'number' 
        ? new Date(dateOrTimestamp * (dateOrTimestamp < 1e11 ? 1000 : 1))
        : new Date(dateOrTimestamp);

    if (isNaN(d.getTime())) return null;

    const unixSec = Math.floor(d.getTime() / 1000);

    const timezones = [
        { name: '🇬🇧 UK (GMT / BST)', zone: 'Europe/London' },
        { name: '🇺🇸 US Eastern (ET)', zone: 'America/New_York' },
        { name: '🇺🇸 US Central (CT)', zone: 'America/Chicago' },
        { name: '🇺🇸 US Pacific (PT)', zone: 'America/Los_Angeles' },
        { name: '🇪🇺 Central Europe (CET)', zone: 'Europe/Berlin' },
        { name: '🇦🇺 Australia (AEST)', zone: 'Australia/Sydney' }
    ];

    const lines = timezones.map(tz => {
        try {
            const timeStr = d.toLocaleTimeString('en-US', {
                timeZone: tz.zone,
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            const dateStr = d.toLocaleDateString('en-US', {
                timeZone: tz.zone,
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
            return `• **${tz.name}:** \`${timeStr}\` (${dateStr})`;
        } catch (e) {
            return null;
        }
    }).filter(Boolean);

    return {
        unixSec,
        discordTag: `<t:${unixSec}:F> (<t:${unixSec}:R>)`,
        shortTag: `<t:${unixSec}:t> (<t:${unixSec}:R>)`,
        relativeTag: `<t:${unixSec}:R>`,
        worldTimesList: lines.join('\n'),
        fullFieldText: `🌐 **Local Time:** <t:${unixSec}:F> (<t:${unixSec}:R>)\n\n**World Timezones:**\n${lines.join('\n')}`
    };
}

module.exports = { formatWorldTime, parseScheduledTime };
