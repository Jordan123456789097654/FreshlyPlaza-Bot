require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Hierarchy definition from top to bottom
const ROLE_DEFINITIONS = [
    // Top admin / owner
    { key: 'founder', name: '👑 │ Founder', color: 0xF1C40F, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
    { key: 'coFounder', name: '👑 │ Co-Founder', color: 0xF39C12, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
    { key: 'boardOfDirectors', name: '🏛️ │ Board of Directors', color: 0xE74C3C, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
    { key: 'cSuite', name: '💼 │ Corporate Executive (C-Suite)', color: 0x9B59B6, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.ManageGuild, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.BanMembers] },
    
    // High Ranks & Leadership
    { key: 'dividerHr', name: '━━━ 💎 HIGH RANKS ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { key: 'hr', name: '💎 │ High Rank (HR)', color: 0x3498DB, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers, PermissionsBitField.Flags.MoveMembers] },
    { key: 'corporateOfficer', name: '👔 │ Corporate Officer', color: 0x5DADE2, hoist: true, mentionable: false },
    { key: 'leadDev', name: '🛠️ │ Lead Developer', color: 0x1ABC9C, hoist: true, mentionable: true },
    { key: 'groupDev', name: '💻 │ Group Developer', color: 0x16A085, hoist: true, mentionable: true },

    // Middle Management
    { key: 'dividerMr', name: '━━━ 👔 MANAGEMENT ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { key: 'mr', name: '👔 │ Management (MR)', color: 0xE67E22, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.MuteMembers] },
    { key: 'storeManager', name: '🏬 │ Store Manager', color: 0xF39C12, hoist: true, mentionable: false },
    { key: 'assistantManager', name: '🏬 │ Assistant Store Manager', color: 0xF1C40F, hoist: true, mentionable: false },
    { key: 'supervisor', name: '👔 │ Department Supervisor', color: 0xF5B041, hoist: true, mentionable: false },
    { key: 'shiftLead', name: '🎖️ │ Shift Lead', color: 0xF8C471, hoist: true, mentionable: false },

    // Security & Operations Staff
    { key: 'dividerStaff', name: '━━━ 🛡️ STORE STAFF ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { key: 'staff', name: '💼 │ Staff Member', color: 0x2ECC71, hoist: true, mentionable: false },
    { key: 'security', name: '🛡️ │ Store Security', color: 0x27AE60, hoist: false, mentionable: false },
    { key: 'seniorAssociate', name: '🛒 │ Senior Store Associate', color: 0x58D68D, hoist: false, mentionable: false },
    { key: 'storeAssociate', name: '🛒 │ Store Associate', color: 0x82E0AA, hoist: false, mentionable: false },
    { key: 'trainee', name: '🎓 │ Trainee', color: 0xA9DFBF, hoist: false, mentionable: false },
    { key: 'loa', name: '🏝️ │ Leave of Absence', color: 0x95A5A6, hoist: false, mentionable: false },

    // Support Roles (ModMail routing)
    { key: 'dividerSupport', name: '━━━ 🎫 MODMAIL SUPPORT ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { key: 'supportGeneral', name: '🎫 │ General Support', color: 0x3498DB, hoist: false, mentionable: true },
    { key: 'supportReport', name: '🚨 │ Report Support', color: 0xE74C3C, hoist: false, mentionable: true },
    { key: 'supportManagement', name: '👔 │ Management Support', color: 0xF1C40F, hoist: false, mentionable: true },
    { key: 'supportTechnical', name: '🛠️ │ Technical Support', color: 0x9B59B6, hoist: false, mentionable: true },
    { key: 'supportAppeals', name: '⚖️ │ Appeals Support', color: 0x1ABC9C, hoist: false, mentionable: true },

    // Community & Verification
    { key: 'dividerCommunity', name: '━━━ 🛍️ COMMUNITY ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { key: 'verified', name: '✅ │ Verified Member', color: 0x2ECC71, hoist: false, mentionable: false },
    { key: 'customer', name: '🛍️ │ Store Customer', color: 0xBDC3C7, hoist: false, mentionable: false },
    { key: 'unverified', name: '❌ │ Unverified Member', color: 0x7F8C8D, hoist: false, mentionable: false },

    // Pings
    { key: 'dividerPings', name: '━━━ 🔔 NOTIFICATION PINGS ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { key: 'shiftPing', name: '🛒 │ Shift Ping', color: 0xAF7AC5, hoist: false, mentionable: true },
    { key: 'trainingPing', name: '🎓 │ Training Ping', color: 0xBB8FCE, hoist: false, mentionable: true },
    { key: 'eventsPing', name: '🎉 │ Events Ping', color: 0xE8DAEF, hoist: false, mentionable: true },
    { key: 'announcementsPing', name: '📢 │ Announcements Ping', color: 0xD7BDE2, hoist: false, mentionable: true },
    { key: 'qotdPing', name: '❓ │ QOTD Ping', color: 0xF4ECF7, hoist: false, mentionable: true },

    // Security & Bot integration
    { key: 'honeypot', name: '⚠️ │ Under Investigation', color: 0x34495E, hoist: false, mentionable: false }
];

client.once('ready', async () => {
    console.log(`[Remake Roles] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);
    console.log(`[Remake Roles] Guild: ${guild.name} (${guild.id})`);

    const me = await guild.members.fetchMe();
    const botHighestPos = me.roles.highest.position;
    console.log(`[Remake Roles] Bot highest role pos: ${botHighestPos} (${me.roles.highest.name})`);

    // 1. Fetch existing roles
    const existingRoles = await guild.roles.fetch();
    console.log(`[Remake Roles] Found ${existingRoles.size} existing roles.`);

    // Record members and their key roles before deleting/replacing
    const members = await guild.members.fetch();
    const userRoleAssignments = {}; // userId -> array of role names / keys
    for (const [memberId, member] of members) {
        userRoleAssignments[memberId] = member.roles.cache.map(r => r.name);
    }

    // Identify roles we should NOT touch:
    // - @everyone
    // - Managed roles (bot-owned roles like carl-bot, Dyno, counting, FlaviBot, Honeypot, FreshlyPlaza Utils)
    // - The bot's own administrative role '*' (position 89)
    const protectedRoleIds = new Set([
        guild.roles.everyone.id,
        me.roles.highest.id
    ]);

    for (const role of existingRoles.values()) {
        if (role.managed) protectedRoleIds.add(role.id);
    }

    // 2. Delete existing unmanaged custom roles below the bot's highest role
    console.log(`[Remake Roles] Deleting old clutter roles...`);
    for (const role of existingRoles.values()) {
        if (protectedRoleIds.has(role.id)) continue;
        if (role.position >= botHighestPos) {
            console.log(`Skipping role above bot: ${role.name}`);
            continue;
        }

        try {
            await role.delete('Server Role Remake Overhaul');
            console.log(`Deleted role: ${role.name}`);
            await sleep(350);
        } catch (err) {
            console.warn(`Could not delete role ${role.name}: ${err.message}`);
        }
    }

    // 3. Create fresh roles in reverse order (bottom to top so Discord stacks them properly)
    console.log(`[Remake Roles] Creating new structured roles...`);
    const createdRoleMap = {};
    const reversedDefs = [...ROLE_DEFINITIONS].reverse();

    for (const def of reversedDefs) {
        try {
            const newRole = await guild.roles.create({
                name: def.name,
                color: def.color,
                hoist: def.hoist,
                mentionable: def.mentionable,
                permissions: def.permissions || [],
                reason: 'Grandway Shopping Role Hierarchy Overhaul'
            });
            createdRoleMap[def.key] = newRole.id;
            console.log(`Created role: ${def.name} (${newRole.id})`);
            await sleep(350);
        } catch (err) {
            console.error(`Failed to create role ${def.name}:`, err.message);
        }
    }

    // 4. Re-assign appropriate roles to members
    console.log(`[Remake Roles] Restoring roles to members...`);
    for (const [memberId, member] of members) {
        if (member.user.bot) continue;
        const oldRoles = userRoleAssignments[memberId] || [];
        const toAdd = [];

        // Check founder / owner
        if (memberId === guild.ownerId || oldRoles.some(r => r.includes('Founder'))) {
            if (createdRoleMap.founder) toAdd.push(createdRoleMap.founder);
            if (createdRoleMap.cSuite) toAdd.push(createdRoleMap.cSuite);
            if (createdRoleMap.hr) toAdd.push(createdRoleMap.hr);
            if (createdRoleMap.mr) toAdd.push(createdRoleMap.mr);
            if (createdRoleMap.staff) toAdd.push(createdRoleMap.staff);
            if (createdRoleMap.supportGeneral) toAdd.push(createdRoleMap.supportGeneral);
            if (createdRoleMap.supportReport) toAdd.push(createdRoleMap.supportReport);
            if (createdRoleMap.supportManagement) toAdd.push(createdRoleMap.supportManagement);
            if (createdRoleMap.supportTechnical) toAdd.push(createdRoleMap.supportTechnical);
            if (createdRoleMap.supportAppeals) toAdd.push(createdRoleMap.supportAppeals);
            if (createdRoleMap.verified) toAdd.push(createdRoleMap.verified);
            if (createdRoleMap.customer) toAdd.push(createdRoleMap.customer);
        } else if (oldRoles.some(r => r.includes('Executive Director') || r.includes('Board') || r.includes('High Rank'))) {
            if (createdRoleMap.cSuite) toAdd.push(createdRoleMap.cSuite);
            if (createdRoleMap.hr) toAdd.push(createdRoleMap.hr);
            if (createdRoleMap.mr) toAdd.push(createdRoleMap.mr);
            if (createdRoleMap.staff) toAdd.push(createdRoleMap.staff);
            if (createdRoleMap.supportGeneral) toAdd.push(createdRoleMap.supportGeneral);
            if (createdRoleMap.supportReport) toAdd.push(createdRoleMap.supportReport);
            if (createdRoleMap.supportManagement) toAdd.push(createdRoleMap.supportManagement);
            if (createdRoleMap.supportTechnical) toAdd.push(createdRoleMap.supportTechnical);
            if (createdRoleMap.supportAppeals) toAdd.push(createdRoleMap.supportAppeals);
            if (createdRoleMap.verified) toAdd.push(createdRoleMap.verified);
            if (createdRoleMap.customer) toAdd.push(createdRoleMap.customer);
        } else if (oldRoles.some(r => r.includes('Group Developer'))) {
            if (createdRoleMap.groupDev) toAdd.push(createdRoleMap.groupDev);
            if (createdRoleMap.staff) toAdd.push(createdRoleMap.staff);
            if (createdRoleMap.verified) toAdd.push(createdRoleMap.verified);
            if (createdRoleMap.customer) toAdd.push(createdRoleMap.customer);
        } else {
            // General member
            if (oldRoles.some(r => r.includes('Verified'))) {
                if (createdRoleMap.verified) toAdd.push(createdRoleMap.verified);
            }
            if (createdRoleMap.customer) toAdd.push(createdRoleMap.customer);
        }

        if (toAdd.length > 0) {
            try {
                await member.roles.add(toAdd, 'Grandway Role Overhaul Assignment');
                console.log(`Assigned ${toAdd.length} roles to ${member.user.tag}`);
                await sleep(350);
            } catch (err) {
                console.warn(`Could not assign roles to ${member.user.tag}: ${err.message}`);
            }
        }
    }

    // 5. Save mappings to file
    fs.writeFileSync(path.join(__dirname, 'remade_roles.json'), JSON.stringify(createdRoleMap, null, 2));
    console.log('[Remake Roles] Finished role overhaul! Saved to remade_roles.json');

    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('Failed to login:', err);
    process.exit(1);
});
