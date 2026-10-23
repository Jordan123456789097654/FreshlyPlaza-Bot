const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const { getDb } = require('../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Configure roles automatically assigned to members on join')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('View all roles currently assigned to new members on join')
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a role to be automatically given to members on join')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('The role to automatically assign')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a role from being automatically given on join')
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('The role to remove from auto-assignment')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const member = interaction.member;
        const isAuthorized = member.permissions.has(PermissionFlagsBits.ManageRoles) ||
                             member.roles.cache.has(config.roles.hr) ||
                             member.roles.cache.has(config.roles.mr) ||
                             (config.ignoredUserIds || []).includes(interaction.user.id);

        if (!isAuthorized) {
            return interaction.reply({
                content: '❌ Only Grandway Shopping Staff Management can configure auto-roles.',
                flags: MessageFlags.Ephemeral
            });
        }

        const db = getDb();
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const dbRoles = db.getAutoRoles();
            const activeRoleIds = dbRoles.length > 0 ? dbRoles : (config.autoRoles || [config.roles.customer]);

            const roleMentions = activeRoleIds
                .map(id => {
                    const r = interaction.guild.roles.cache.get(id);
                    return r ? `• <@&${r.id}> (\`${r.name}\` - ID: \`${r.id}\`)` : `• Unknown Role (\`${id}\`)`;
                })
                .join('\n');

            const embed = new EmbedBuilder()
                .setTitle('🎭 Grandway Shopping — Auto-Role Configuration')
                .setDescription(
                    `The following role(s) are automatically assigned to every new member when they join the server:\n\n` +
                    (roleMentions || '*No auto-roles configured.*') +
                    `\n\n*Use \`/autorole add\` or \`/autorole remove\` to update.*`
                )
                .setColor(config.colors.primary)
                .setFooter({ text: 'Grandway Shopping Member Onboarding' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'add') {
            const role = interaction.options.getRole('role');

            if (role.managed) {
                return interaction.reply({
                    content: '❌ You cannot add managed / bot-integration roles to auto-role.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const botMember = interaction.guild.members.me;
            if (botMember && role.position >= botMember.roles.highest.position) {
                return interaction.reply({
                    content: `⚠️ The role <@&${role.id}> is higher than or equal to my highest role position. Move my bot role above <@&${role.id}> in Server Settings > Roles so I can assign it.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            db.addAutoRole(role.id);

            return interaction.reply({
                content: `✅ Added <@&${role.id}> to the auto-role list! New members will now automatically receive this role upon joining.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'remove') {
            const role = interaction.options.getRole('role');
            db.removeAutoRole(role.id);

            return interaction.reply({
                content: `✅ Removed <@&${role.id}> from the auto-role list.`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
