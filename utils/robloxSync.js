const config = require('../config');

// Group rank number to role key mapping for Roblox Group 505768378
const RANK_MAPPING = [
    { minRank: 255, roleKey: 'founder' },
    { minRank: 254, roleKey: 'coFounder' },
    { minRank: 253, roleKey: 'boardOfDirectors' },
    { minRank: 250, roleKey: 'cSuite' },
    { minRank: 212, roleKey: 'leadDev' },
    { minRank: 211, roleKey: 'groupDev' },
    { minRank: 200, roleKey: 'hr' },
    { minRank: 100, roleKey: 'corporateOfficer' },
    { minRank: 34,  roleKey: 'storeManager' },
    { minRank: 33,  roleKey: 'assistantManager' },
    { minRank: 32,  roleKey: 'supervisor' },
    { minRank: 31,  roleKey: 'shiftLead' },
    { minRank: 30,  roleKey: 'mr' },
    { minRank: 20,  roleKey: 'security' },
    { minRank: 13,  roleKey: 'seniorAssociate' },
    { minRank: 11,  roleKey: 'storeAssociate' },
    { minRank: 10,  roleKey: 'trainee' },
    { minRank: 1,   roleKey: 'customer' }
];

/**
 * Syncs Discord roles for a guild member based on their Roblox group rank
 * @param {import('discord.js').GuildMember} member
 * @param {number} rankNumber Roblox group rank (0-255)
 * @param {string} rankName Roblox group role name
 */
async function syncMemberRobloxRoles(member, rankNumber, rankName) {
    if (!member || !member.guild) return [];

    const rolesToAdd = [];
    const rolesToRemove = [];

    // Verified role is always granted
    if (config.roles.verified && !member.roles.cache.has(config.roles.verified)) {
        rolesToAdd.push(config.roles.verified);
    }

    // Customer role is granted to all group members & customers
    if (config.roles.customer && !member.roles.cache.has(config.roles.customer)) {
        rolesToAdd.push(config.roles.customer);
    }

    // Remove unverified role if present
    if (config.roles.unverified && member.roles.cache.has(config.roles.unverified)) {
        rolesToRemove.push(config.roles.unverified);
    }

    // Determine staff level
    if (rankNumber >= 10) {
        // Any rank 10+ is a staff member
        if (config.roles.staff && !member.roles.cache.has(config.roles.staff)) {
            rolesToAdd.push(config.roles.staff);
        }
    }

    // Determine MR level (30 - 99)
    if (rankNumber >= 30 && rankNumber < 100) {
        if (config.roles.mr && !member.roles.cache.has(config.roles.mr)) {
            rolesToAdd.push(config.roles.mr);
        }
    }

    // Determine HR level (100+)
    if (rankNumber >= 100) {
        if (config.roles.hr && !member.roles.cache.has(config.roles.hr)) {
            rolesToAdd.push(config.roles.hr);
        }
        if (config.roles.mr && !member.roles.cache.has(config.roles.mr)) {
            rolesToAdd.push(config.roles.mr);
        }
    }

    // Specific title role
    for (const mapping of RANK_MAPPING) {
        if (rankNumber >= mapping.minRank) {
            const roleId = config.roles[mapping.roleKey];
            if (roleId && !member.roles.cache.has(roleId)) {
                rolesToAdd.push(roleId);
            }
            break;
        }
    }

    const applied = [];
    if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd, `Roblox Group Sync: ${rankName} (Rank ${rankNumber})`).catch(e => console.warn('Could not add roles:', e.message));
        applied.push(...rolesToAdd);
    }

    if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove, `Roblox Group Sync: Verified`).catch(e => console.warn('Could not remove roles:', e.message));
    }

    return applied;
}

module.exports = { syncMemberRobloxRoles, RANK_MAPPING };
