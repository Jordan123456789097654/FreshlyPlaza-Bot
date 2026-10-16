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
        discordTag: `<t:${unixSec}:F> (<t:${unixSec}:R>)`,
        shortTag: `<t:${unixSec}:t> (<t:${unixSec}:R>)`,
        worldTimesList: lines.join('\n'),
        fullFieldText: `🌐 **Local Time:** <t:${unixSec}:F> (<t:${unixSec}:R>)\n\n**World Timezones:**\n${lines.join('\n')}`
    };
}

module.exports = { formatWorldTime };
