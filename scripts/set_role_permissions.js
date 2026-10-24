require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

client.once('ready', async () => {
    console.log(`[Role Perms] Logged in as ${client.user.tag}`);
    const guild = await client.guilds.fetch(config.guildId);
    const roles = await guild.roles.fetch();

    console.log(`Assigning tailored permissions across roles...`);

    // Standard baseline for community members: Send messages, add reactions, attach files, use voice
    const customerPerms = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AddReactions,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
        PermissionsBitField.Flags.UseVAD
    ];

    // Staff baseline: Community perms + Manage Messages, Timeout/Moderate, Move Voice
    const staffPerms = [
        ...customerPerms,
        PermissionsBitField.Flags.ManageMessages,
        PermissionsBitField.Flags.ModerateMembers,
        PermissionsBitField.Flags.MoveMembers
    ];

    // MR baseline: Staff perms + Mute Members, Deafen Members
    const mrPerms = [
        ...staffPerms,
        PermissionsBitField.Flags.MuteMembers,
        PermissionsBitField.Flags.DeafenMembers,
        PermissionsBitField.Flags.PrioritySpeaker
    ];

    // HR baseline: MR perms + Kick, Ban, Mention Everyone/Roles, Manage Nicknames
    const hrPerms = [
        ...mrPerms,
        PermissionsBitField.Flags.KickMembers,
        PermissionsBitField.Flags.BanMembers,
        PermissionsBitField.Flags.ManageNicknames,
        PermissionsBitField.Flags.MentionEveryone
    ];

    // Executive / Founder: Administrator
    const adminPerms = [
        PermissionsBitField.Flags.Administrator
    ];

    for (const role of roles.values()) {
        if (role.managed || role.name === '@everyone' || role.name === '*') continue;

        let targetPerms = null;
        const name = role.name;

        if (name.includes('Founder') || name.includes('Co-Founder') || name.includes('Board of Directors') || name.includes('Chief Executive Officer')) {
            targetPerms = adminPerms;
        } else if (name.includes('High Rank') || name.includes('Director of') || name.includes('Trust & Safety') || name.includes('Corporate Officer') || name.includes('Chief Operating') || name.includes('Chief Financial')) {
            targetPerms = hrPerms;
        } else if (name.includes('Management (MR)') || name.includes('Store Manager') || name.includes('Supervisor') || name.includes('Shift Lead') || name.includes('Management Intern')) {
            targetPerms = mrPerms;
        } else if (name.includes('Staff Member') || name.includes('Security') || name.includes('Associate') || name.includes('Trainee') || name.includes('Support')) {
            targetPerms = staffPerms;
        } else if (name.includes('Store Customer') || name.includes('Verified Member') || name.includes('Valued') || name.includes('Noted') || name.includes('Alliance')) {
            targetPerms = customerPerms;
        } else if (name.includes('Unverified Member') || name.includes('Under Investigation')) {
            targetPerms = [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.ReadMessageHistory
            ];
        }

        if (targetPerms) {
            try {
                await role.setPermissions(targetPerms, 'Grandway Custom Role Permissions Setup');
                console.log(`Updated permissions for: ${role.name}`);
                await sleep(350);
            } catch (err) {
                console.warn(`Could not set permissions for ${role.name}: ${err.message}`);
            }
        }
    }

    console.log('[Role Perms] Finished assigning custom role permissions!');
    await client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
