require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// All Roblox Group roles to create in Discord
// Desired Order:
// TOP:
// 👑 Founder & Leadership
// 💎 High Ranks & Directors
// 👔 Management (MR)
// 🛡️ Staff & Associates
// 🎫 Support Roles
// 🔔 Ping Roles
// ✅ Verified Member
// 🛍️ Store Customer (Bottom of hierarchy, or above everyone)
// @everyone
const ROLES_ORDER = [
    // --- EXECUTIVE & FOUNDER ---
    { name: '👑 │ Founder', rank: 255, color: 0xF1C40F, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
    { name: '👑 │ Co-Founder', rank: 254, color: 0xF39C12, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
    { name: '🏛️ │ Board of Directors', rank: 253, color: 0xE74C3C, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
    { name: '💼 │ Chief Executive Officer (CEO)', rank: 252, color: 0x9B59B6, hoist: true, mentionable: true },
    { name: '💼 │ Chief Operating Officer (COO)', rank: 251, color: 0x8E44AD, hoist: true, mentionable: true },
    { name: '💰 │ Chief Financial Officer (CFO)', rank: 250, color: 0x2980B9, hoist: true, mentionable: true },
    { name: '━━━ 👑 EXECUTIVE SUITE ━━━', color: 0x2C2F33, hoist: false, mentionable: false },

    // --- HIGH RANKS & DIRECTORS ---
    { name: '💎 │ High Rank (HR)', color: 0x3498DB, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.MuteMembers, PermissionsBitField.Flags.DeafenMembers, PermissionsBitField.Flags.MoveMembers] },
    { name: '🛠️ │ Lead Developer', rank: 212, color: 0x1ABC9C, hoist: true, mentionable: true },
    { name: '💻 │ Group Developer', rank: 211, color: 0x16A085, hoist: true, mentionable: true },
    { name: '📋 │ Director of Operations', rank: 204, color: 0x3498DB, hoist: true, mentionable: false },
    { name: '👥 │ Director of Human Resources', rank: 203, color: 0x5DADE2, hoist: true, mentionable: false },
    { name: '📢 │ Director of Public Relations', rank: 202, color: 0x85C1E9, hoist: true, mentionable: false },
    { name: '🛡️ │ Director of Trust & Safety', rank: 201, color: 0x2E86C1, hoist: true, mentionable: false },
    { name: '🛡️ │ Trust & Safety Specialist', rank: 200, color: 0x1B4F72, hoist: true, mentionable: false },
    { name: '👔 │ Head Corporate Officer', rank: 104, color: 0x7FB3D5, hoist: true, mentionable: false },
    { name: '👔 │ Senior Corporate Officer', rank: 103, color: 0xA9CCE3, hoist: true, mentionable: false },
    { name: '📢 │ Public Relations Officer', rank: 102, color: 0xAED6F1, hoist: true, mentionable: false },
    { name: '👥 │ Human Resources Officer', rank: 101, color: 0xD4E6F1, hoist: true, mentionable: false },
    { name: '💼 │ Corporate Intern', rank: 100, color: 0xEBF5FB, hoist: true, mentionable: false },
    { name: '━━━ 💎 HIGH RANKS ━━━', color: 0x2C2F33, hoist: false, mentionable: false },

    // --- MANAGEMENT (MR) ---
    { name: '👔 │ Management (MR)', color: 0xE67E22, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.MuteMembers] },
    { name: '🏬 │ General Store Manager', rank: 35, color: 0xD35400, hoist: true, mentionable: false },
    { name: '🏬 │ Store Manager', rank: 34, color: 0xE67E22, hoist: true, mentionable: false },
    { name: '🏬 │ Assistant Store Manager', rank: 33, color: 0xEB984E, hoist: true, mentionable: false },
    { name: '👔 │ Department Supervisor', rank: 32, color: 0xF0B27A, hoist: true, mentionable: false },
    { name: '🎖️ │ Shift Lead', rank: 31, color: 0xF5CBA7, hoist: true, mentionable: false },
    { name: '💼 │ Management Intern', rank: 30, color: 0xEDBB99, hoist: true, mentionable: false },
    { name: '━━━ 👔 MANAGEMENT ━━━', color: 0x2C2F33, hoist: false, mentionable: false },

    // --- SECURITY & LOSS PREVENTION ---
    { name: '🛡️ │ Security Supervisor', rank: 24, color: 0x27AE60, hoist: false, mentionable: false },
    { name: '🔍 │ Loss Prevention Specialist', rank: 23, color: 0x2ECC71, hoist: false, mentionable: false },
    { name: '🛡️ │ Senior Security Officer', rank: 22, color: 0x58D68D, hoist: false, mentionable: false },
    { name: '🛡️ │ Security Officer', rank: 21, color: 0x82E0AA, hoist: false, mentionable: false },
    { name: '🛡️ │ Trainee Security Officer', rank: 20, color: 0xA9DFBF, hoist: false, mentionable: false },

    // --- STORE STAFF & ASSOCIATES ---
    { name: '💼 │ Staff Member', color: 0x2ECC71, hoist: true, mentionable: false },
    { name: '🛒 │ Senior Store Associate', rank: 13, color: 0x48C9B0, hoist: false, mentionable: false },
    { name: '🛒 │ Store Associate', rank: 12, color: 0x76D7C4, hoist: false, mentionable: false },
    { name: '🛒 │ Junior Store Associate', rank: 11, color: 0xA3E4D7, hoist: false, mentionable: false },
    { name: '🎓 │ Trainee', rank: 10, color: 0xD1F2EB, hoist: false, mentionable: false },
    { name: '🏝️ │ Leave of Absence', color: 0x95A5A6, hoist: false, mentionable: false },
    { name: '━━━ 🛡️ STORE STAFF ━━━', color: 0x2C2F33, hoist: false, mentionable: false },

    // --- SPECIAL RANKS ---
    { name: '⚠️ │ Suspended / Under Investigation', rank: 6, color: 0x922B21, hoist: false, mentionable: false },
    { name: '🎖️ │ Honorary Staff', rank: 5, color: 0x9B59B6, hoist: false, mentionable: false },
    { name: '🤝 │ Alliance Representative', rank: 4, color: 0x3498DB, hoist: false, mentionable: false },
    { name: '⭐ │ Noted Customer', rank: 3, color: 0xF1C40F, hoist: false, mentionable: false },
    { name: '✨ │ Valued Customer', rank: 2, color: 0xF39C12, hoist: false, mentionable: false },

    // --- MODMAIL SUPPORT ROLES ---
    { name: '━━━ 🎫 MODMAIL SUPPORT ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { name: '🎫 │ General Support', color: 0x3498DB, hoist: false, mentionable: true },
    { name: '🚨 │ Report Support', color: 0xE74C3C, hoist: false, mentionable: true },
    { name: '👔 │ Management Support', color: 0xF1C40F, hoist: false, mentionable: true },
    { name: '🛠️ │ Technical Support', color: 0x9B59B6, hoist: false, mentionable: true },
    { name: '⚖️ │ Appeals Support', color: 0x1ABC9C, hoist: false, mentionable: true },

    // --- NOTIFICATION PINGS ---
    { name: '━━━ 🔔 NOTIFICATION PINGS ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { name: '🛒 │ Shift Ping', color: 0xAF7AC5, hoist: false, mentionable: true },
    { name: '🎓 │ Training Ping', color: 0xBB8FCE, hoist: false, mentionable: true },
    { name: '🎉 │ Events Ping', color: 0xE8DAEF, hoist: false, mentionable: true },
    { name: '📢 │ Announcements Ping', color: 0xD7BDE2, hoist: false, mentionable: true },
    { name: '❓ │ QOTD Ping', color: 0xF4ECF7, hoist: false, mentionable: true },

    // --- COMMUNITY & VERIFICATION ---
    { name: '━━━ 🛍️ COMMUNITY ━━━', color: 0x2C2F33, hoist: false, mentionable: false },
    { name: '✅ │ Verified Member', color: 0x2ECC71, hoist: false, mentionable: false },
    { name: '❌ │ Unverified Member', color: 0x7F8C8D, hoist: false, mentionable: false },
    { name: '🛍️ │ Store Customer', rank: 1, color: 0xBDC3C7, hoist: false, mentionable: false },
    { name: '⚠️ │ Under Investigation', color: 0x34495E, hoist: false, mentionable: false }
];

client.once('ready', async () => {
    console.log(`[Hierarchy Builder] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);
    const me = await guild.members.fetchMe();
    console.log(`[Hierarchy Builder] Bot highest role: ${me.roles.highest.name} (${me.roles.highest.id})`);

    // Fetch existing roles
    const existingRoles = await guild.roles.fetch();
    console.log(`Found ${existingRoles.size} existing roles.`);

    const protectedIds = new Set([
        guild.roles.everyone.id,
        me.roles.highest.id
    ]);
    for (const r of existingRoles.values()) {
        if (r.managed) protectedIds.add(r.id);
    }

    // Capture existing member assignments
    const members = await guild.members.fetch();
    const memberRoleMap = {};
    for (const [id, m] of members) {
        memberRoleMap[id] = m.roles.cache.map(r => r.name);
    }

    // Delete existing custom roles below bot
    console.log('Deleting previous roles to establish correct hierarchy...');
    for (const r of existingRoles.values()) {
        if (protectedIds.has(r.id) || r.position >= me.roles.highest.position) continue;
        try {
            await r.delete('Rebuilding correct role hierarchy');
            console.log(`Deleted: ${r.name}`);
            await sleep(350);
        } catch (e) {
            console.warn(`Could not delete ${r.name}: ${e.message}`);
        }
    }

    // Create in REVERSE of desired hierarchy (bottom to top)
    // Discord stacks new roles at position 1 (above @everyone), pushing older ones upward!
    // So the FIRST one created ends up higher, and subsequent ones push it or end up below.
    // Wait! In Discord API:
    // When you create a role, it is placed at position 1 (just above @everyone).
    // The NEXT role created will be placed at position 1, pushing the previous one up to position 2!
    // Therefore:
    // To make role A higher than role B, role A should be created AFTER role B!
    // That means: Creating from BOTTOM of hierarchy to TOP of hierarchy places TOP at the highest position!
    // Let's verify:
    // 1. Create Customer -> pos 1
    // 2. Create Verified -> pos 1 (Customer becomes pos 2)
    // 3. ...
    // 4. Create Founder -> pos 1 (all others pushed up, so Founder would be at pos 1? NO!)
    // Wait! In discord.js:
    // When guild.roles.create() is called without position, Discord places it at position 1 by default, OR just below the bot!
    // Let's test with role.setPosition or bulk setPositions to guarantee exact positions!

    console.log('Creating all defined roles...');
    const createdRoles = [];
    for (const def of ROLES_ORDER) {
        try {
            const role = await guild.roles.create({
                name: def.name,
                color: def.color,
                hoist: def.hoist || false,
                mentionable: def.mentionable || false,
                permissions: def.permissions || [],
                reason: 'Grandway Hierarchy Setup'
            });
            createdRoles.push({ role, def });
            console.log(`Created: ${role.name} (${role.id})`);
            await sleep(350);
        } catch (err) {
            console.error(`Failed to create ${def.name}:`, err.message);
        }
    }

    // Now set exact hierarchy positions explicitly!
    // We want the FIRST item in ROLES_ORDER to be HIGHEST position (just below bot).
    // And the LAST item to be LOWEST position (just above @everyone).
    console.log('Setting explicit role positions...');
    const botPos = me.roles.highest.position;
    const positionsPayload = [];

    // ROLES_ORDER[0] gets botPos - 1
    // ROLES_ORDER[1] gets botPos - 2
    // etc.
    let targetPos = botPos - 1;
    for (let i = 0; i < createdRoles.length; i++) {
        const item = createdRoles[i];
        positionsPayload.push({
            role: item.role.id,
            position: Math.max(1, targetPos--)
        });
    }

    try {
        await guild.roles.setPositions(positionsPayload);
        console.log('Successfully set explicit role hierarchy positions!');
    } catch (err) {
        console.warn('setPositions notice:', err.message);
    }

    // Map roles for config and roblox group rank matching
    const rankToRoleId = {};
    const keyToRoleId = {};

    for (const item of createdRoles) {
        const name = item.def.name;
        const id = item.role.id;

        if (item.def.rank !== undefined) {
            rankToRoleId[item.def.rank] = id;
        }

        // Map key names
        if (name.includes('Founder') && !name.includes('Co-Founder')) keyToRoleId.founder = id;
        if (name.includes('Co-Founder')) keyToRoleId.coFounder = id;
        if (name.includes('Board of Directors')) keyToRoleId.boardOfDirectors = id;
        if (name.includes('High Rank (HR)')) keyToRoleId.hr = id;
        if (name.includes('Management (MR)')) keyToRoleId.mr = id;
        if (name.includes('Staff Member')) keyToRoleId.staff = id;
        if (name.includes('Lead Developer')) keyToRoleId.leadDev = id;
        if (name.includes('Group Developer')) keyToRoleId.groupDev = id;
        if (name.includes('Trainee') && !name.includes('Security')) keyToRoleId.trainee = id;
        if (name.includes('Store Associate') && !name.includes('Senior') && !name.includes('Junior')) keyToRoleId.storeAssociate = id;
        if (name.includes('Senior Store Associate')) keyToRoleId.seniorAssociate = id;
        if (name.includes('Security Officer') && !name.includes('Senior') && !name.includes('Trainee')) keyToRoleId.security = id;
        if (name.includes('Shift Lead')) keyToRoleId.shiftLead = id;
        if (name.includes('Department Supervisor')) keyToRoleId.supervisor = id;
        if (name.includes('Assistant Store Manager')) keyToRoleId.assistantManager = id;
        if (name.includes('Store Manager') && !name.includes('Assistant') && !name.includes('General')) keyToRoleId.storeManager = id;
        if (name.includes('Verified Member')) keyToRoleId.verified = id;
        if (name.includes('Store Customer')) keyToRoleId.customer = id;
        if (name.includes('Unverified Member')) keyToRoleId.unverified = id;
        if (name.includes('Leave of Absence')) keyToRoleId.loa = id;
        if (name.includes('Under Investigation')) keyToRoleId.honeypot = id;
        if (name.includes('Shift Ping')) keyToRoleId.shiftPing = id;
        if (name.includes('Training Ping')) keyToRoleId.trainingPing = id;
        if (name.includes('Events Ping')) keyToRoleId.eventsPing = id;
        if (name.includes('Announcements Ping')) keyToRoleId.announcementsPing = id;
        if (name.includes('QOTD Ping')) keyToRoleId.qotdPing = id;
        if (name.includes('General Support')) keyToRoleId.supportGeneral = id;
        if (name.includes('Report Support')) keyToRoleId.supportReport = id;
        if (name.includes('Management Support')) keyToRoleId.supportManagement = id;
        if (name.includes('Technical Support')) keyToRoleId.supportTechnical = id;
        if (name.includes('Appeals Support')) keyToRoleId.supportAppeals = id;
    }

    fs.writeFileSync(path.join(__dirname, 'hierarchy_roles.json'), JSON.stringify({
        keyToRoleId,
        rankToRoleId,
        allRoles: createdRoles.map(c => ({ id: c.role.id, name: c.def.name, rank: c.def.rank }))
    }, null, 2));

    // Reassign key roles to users
    console.log('Restoring member roles...');
    for (const [memberId, member] of members) {
        if (member.user.bot) continue;
        const oldRoles = memberRoleMap[memberId] || [];
        const toAdd = [];

        if (memberId === guild.ownerId || oldRoles.some(r => r.includes('Founder'))) {
            toAdd.push(
                keyToRoleId.founder,
                keyToRoleId.hr,
                keyToRoleId.mr,
                keyToRoleId.staff,
                keyToRoleId.supportGeneral,
                keyToRoleId.supportReport,
                keyToRoleId.supportManagement,
                keyToRoleId.supportTechnical,
                keyToRoleId.supportAppeals,
                keyToRoleId.verified,
                keyToRoleId.customer
            );
        } else if (oldRoles.some(r => r.includes('Director') || r.includes('High Rank') || r.includes('Board'))) {
            toAdd.push(
                keyToRoleId.hr,
                keyToRoleId.mr,
                keyToRoleId.staff,
                keyToRoleId.supportGeneral,
                keyToRoleId.supportReport,
                keyToRoleId.supportManagement,
                keyToRoleId.supportTechnical,
                keyToRoleId.supportAppeals,
                keyToRoleId.verified,
                keyToRoleId.customer
            );
        } else if (oldRoles.some(r => r.includes('Developer'))) {
            toAdd.push(
                keyToRoleId.groupDev,
                keyToRoleId.staff,
                keyToRoleId.verified,
                keyToRoleId.customer
            );
        } else {
            toAdd.push(keyToRoleId.customer);
            if (oldRoles.some(r => r.includes('Verified'))) {
                toAdd.push(keyToRoleId.verified);
            }
        }

        const validToAdd = toAdd.filter(Boolean);
        if (validToAdd.length > 0) {
            await member.roles.add(validToAdd, 'Hierarchy Setup').catch(e => console.warn(e.message));
            console.log(`Re-assigned ${validToAdd.length} roles to ${member.user.tag}`);
            await sleep(350);
        }
    }

    console.log('Hierarchy overhaul script complete!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error(err);
    process.exit(1);
});
