const config = require('../config');

/**
 * Roblox User & Profile Lookup Helper for Grandway Shopping Support Tickets
 * Fetches user info, avatar headshot, account creation date, and group rank in Grandway Shopping.
 */
async function fetchRobloxUserProfile(username) {
    if (!username || typeof username !== 'string') return null;
    const cleanUser = username.trim().replace(/^@/, '');
    if (!cleanUser) return null;

    try {
        // 1. Resolve username to ID
        const resUser = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [cleanUser], excludeBannedUsers: false }),
            signal: AbortSignal.timeout(5000)
        });

        if (!resUser.ok) return null;
        const userData = await resUser.json();
        if (!userData.data || userData.data.length === 0) return null;

        const user = userData.data[0];
        const userId = user.id;

        // 2. Fetch avatar thumbnail & user details & group rank in parallel
        const [avatarRes, detailRes, groupsRes] = await Promise.allSettled([
            fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
            fetch(`https://users.roblox.com/v1/users/${userId}`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
            fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`, { signal: AbortSignal.timeout(4000) }).then(r => r.json())
        ]);

        let headshotUrl = null;
        if (avatarRes.status === 'fulfilled' && avatarRes.value.data && avatarRes.value.data[0]) {
            headshotUrl = avatarRes.value.data[0].imageUrl;
        }

        let createdAt = null;
        if (detailRes.status === 'fulfilled' && detailRes.value.created) {
            createdAt = detailRes.value.created;
        }

        let groupRank = 'Non-Member / Guest';
        const targetGroupId = Number(config.robloxGroupId || 1110376670);
        if (groupsRes.status === 'fulfilled' && groupsRes.value.data) {
            const foundGroup = groupsRes.value.data.find(g => g.group && g.group.id === targetGroupId);
            if (foundGroup && foundGroup.role) {
                groupRank = foundGroup.role.name || 'Member';
            }
        }

        return {
            id: userId,
            username: user.name,
            displayName: user.displayName || user.name,
            profileUrl: `https://www.roblox.com/users/${userId}/profile`,
            headshotUrl,
            createdAt,
            groupRank
        };
    } catch (e) {
        console.warn(`[ROBLOX LOOKUP WARNING] Could not fetch profile for "${cleanUser}":`, e.message);
        return null;
    }
}

module.exports = { fetchRobloxUserProfile };
