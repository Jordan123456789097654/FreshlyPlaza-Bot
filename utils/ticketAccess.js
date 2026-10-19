const { PermissionFlagsBits, ChannelType } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

/**
 * Ticket Override Access
 * ----------------------
 * One Discord user (configured in config.ticketOverride) is granted full access
 * to every support ticket channel: existing ones (synced on startup), newly
 * created ones (every ticket creation path wraps its permission overwrites with
 * withTicketOverride), and the bot-level staff checks used by ticket buttons and
 * commands (hasTicketOverride).
 */

const OVERRIDE_USER_ID = config.ticketOverride.userId;

const OVERRIDE_PERMISSION_NAMES = [
    'ViewChannel',
    'SendMessages',
    'ReadMessageHistory',
    'AttachFiles',
    'EmbedLinks',
    'ManageMessages',
    'ManageChannels'
];

const OVERRIDE_ALLOW_FLAGS = OVERRIDE_PERMISSION_NAMES.map(name => PermissionFlagsBits[name]);
const OVERRIDE_EDIT_OBJECT = Object.fromEntries(OVERRIDE_PERMISSION_NAMES.map(name => [name, true]));

// Support category IDs used across the bot (same list the ticket creators use)
const SUPPORT_CATEGORY_IDS = [config.channels.ticketsCategory, '1558519068951187498'].filter(Boolean);

/** True when the member (or user) is the ticket override user. */
function hasTicketOverride(memberOrUser) {
    if (!memberOrUser) return false;
    const id = memberOrUser.id || (memberOrUser.user && memberOrUser.user.id);
    return id === OVERRIDE_USER_ID;
}

/**
 * Returns a copy of a permissionOverwrites array with the override user
 * allowed in the channel. Removes any existing entry for that user first so
 * Discord never receives duplicate overwrite IDs.
 */
function withTicketOverride(overwrites = []) {
    const list = overwrites.filter(o => o.id !== OVERRIDE_USER_ID);
    list.push({ id: OVERRIDE_USER_ID, allow: OVERRIDE_ALLOW_FLAGS });
    return list;
}

/** Staff check for ticket actions: override user, staff/MR/HR roles, or ManageMessages. */
function isTicketStaff(member) {
    if (!member) return false;
    if (hasTicketOverride(member)) return true;
    const cache = member.roles && member.roles.cache;
    const hasRole = id => Boolean(cache && id && cache.has(id));
    return hasRole(config.roles.staff) || hasRole(config.roles.mr) || hasRole(config.roles.hr) ||
        Boolean(member.permissions && member.permissions.has(PermissionFlagsBits.ManageMessages));
}

/** Applies the override user's permissions to one existing channel. */
async function applyTicketOverrideToChannel(channel) {
    try {
        await channel.permissionOverwrites.edit(OVERRIDE_USER_ID, OVERRIDE_EDIT_OBJECT);
        return true;
    } catch (e) {
        console.warn(`[TICKET OVERRIDE] Could not update #${channel.name} (${channel.id}):`, e.message);
        return false;
    }
}

/**
 * Grants the override user access to every ticket channel in the guild:
 * any channel tracked as a ticket in the database, plus any text channel
 * inside the support tickets category.
 */
async function syncTicketOverrides(guild) {
    if (!guild) return { updated: 0, failed: 0 };

    const tickets = getDb().getData().tickets || [];
    const ticketChannelIds = new Set(tickets.map(t => t.channel_id).filter(Boolean));

    let updated = 0;
    let failed = 0;
    for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildText) continue;
        const isTicket = ticketChannelIds.has(channel.id) || SUPPORT_CATEGORY_IDS.includes(channel.parentId);
        if (!isTicket) continue;

        if (await applyTicketOverrideToChannel(channel)) updated++;
        else failed++;
    }

    console.log(`[TICKET OVERRIDE] Synced ${updated} ticket channel(s) for override user (${failed} failed).`);
    return { updated, failed };
}

module.exports = {
    OVERRIDE_USER_ID,
    hasTicketOverride,
    isTicketStaff,
    withTicketOverride,
    applyTicketOverrideToChannel,
    syncTicketOverrides
};
