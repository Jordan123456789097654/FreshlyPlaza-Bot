const config = require('../config');
const fs = require('fs');
const path = require('path');

let hierarchyData = null;
try {
    hierarchyData = JSON.parse(fs.readFileSync(path.join(__dirname, '../scripts/hierarchy_roles.json'), 'utf8'));
} catch (e) {
    console.warn('Could not read hierarchy_roles.json:', e.message);
}

/**
 * Syncs Discord roles for a guild member based on their Roblox group rank
 * Assigns their EXACT matching Roblox Group rank role (e.g. "Store Manager", "Senior Security Officer", etc.)
 * PLUS contextual group tier roles (Staff, MR, HR, Verified, Customer).
 * @param {import('discord.js').GuildMember} member
 * @param {number} rankNumber Roblox group rank (0-255)
 * @param {string} rankName Roblox group role name
 */
async function syncMemberRobloxRoles(member, rankNumber, rankName) {
    if (!member || !member.guild) return [];

    const rolesToAdd = new Set();
    const rolesToRemove = new Set();

    // 1. Core verification role
    if (config.roles.verified) {
        rolesToAdd.add(config.roles.verified);
    }

    // 2. Remove unverified role if present
    if (config.roles.unverified && member.roles.cache.has(config.roles.unverified)) {
        rolesToRemove.add(config.roles.unverified);
    }

    // 3. Customer role is granted to all group members / customers
    if (config.roles.customer) {
        rolesToAdd.add(config.roles.customer);
    }

    // 4. EXACT MATCH FOR ROBLOX GROUP RANK
    if (hierarchyData && hierarchyData.rankToRoleId) {
        const exactRoleId = hierarchyData.rankToRoleId[String(rankNumber)];
        if (exactRoleId) {
            rolesToAdd.add(exactRoleId);
        }

        // Remove any previous exact rank roles they no longer hold (if they were promoted/demoted)
        for (const [rNumStr, rId] of Object.entries(hierarchyData.rankToRoleId)) {
            const num = Number(rNumStr);
            if (num !== rankNumber && num > 1) { // don't remove customer
                if (member.roles.cache.has(rId) && rId !== exactRoleId) {
                    rolesToRemove.add(rId);
                }
            }
        }
    }

    // 5. Tiered Organizational Roles
    // Trainee / Staff Tier (Rank 10+)
    if (rankNumber >= 10) {
        if (config.roles.staff) rolesToAdd.add(config.roles.staff);
    } else {
        if (config.roles.staff && member.roles.cache.has(config.roles.staff)) {
            rolesToRemove.add(config.roles.staff);
        }
    }

    // Middle Management (MR) Tier (Rank 30 to 99)
    if (rankNumber >= 30 && rankNumber < 100) {
        if (config.roles.mr) rolesToAdd.add(config.roles.mr);
    }

    // High Rank (HR) Tier (Rank 100 to 249)
    if (rankNumber >= 100) {
        if (config.roles.hr) rolesToAdd.add(config.roles.hr);
        if (config.roles.mr) rolesToAdd.add(config.roles.mr); // HR inherits MR permissions
    }

    // Executive Suite Tier (Rank 250+)
    if (rankNumber >= 250) {
        if (config.roles.cSuite) rolesToAdd.add(config.roles.cSuite);
        if (config.roles.hr) rolesToAdd.add(config.roles.hr);
        if (config.roles.mr) rolesToAdd.add(config.roles.mr);
    }

    // Specific Founder / Co-Founder
    if (rankNumber === 255 && config.roles.founder) rolesToAdd.add(config.roles.founder);
    if (rankNumber === 254 && config.roles.coFounder) rolesToAdd.add(config.roles.coFounder);
    if (rankNumber === 253 && config.roles.boardOfDirectors) rolesToAdd.add(config.roles.boardOfDirectors);

    // Filter out roles already on member
    const finalAddList = [...rolesToAdd].filter(id => id && !member.roles.cache.has(id));
    const finalRemoveList = [...rolesToRemove].filter(id => id && member.roles.cache.has(id));

    if (finalAddList.length > 0) {
        await member.roles.add(finalAddList, `Roblox Group Sync: ${rankName} (Rank ${rankNumber})`).catch(e => console.warn('Role add notice:', e.message));
    }

    if (finalRemoveList.length > 0) {
        await member.roles.remove(finalRemoveList, `Roblox Group Sync: Outdated Ranks`).catch(e => console.warn('Role remove notice:', e.message));
    }

    return finalAddList;
}

module.exports = { syncMemberRobloxRoles, hierarchyData };
