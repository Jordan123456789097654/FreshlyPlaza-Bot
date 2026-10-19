const { 
    SlashCommandBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ia-whistleblow')
        .setDescription('Submit an encrypted, confidential whistleblower report directly to Internal Affairs.'),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('modal_ia_whistleblow_submit')
            .setTitle('Classified Whistleblower Submission');

        const accusedInput = new TextInputBuilder()
            .setCustomId('wb_accused')
            .setLabel('Accused Staff Member / Individual')
            .setPlaceholder('Username, tag, or User ID of subject')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const categoryInput = new TextInputBuilder()
            .setCustomId('wb_category')
            .setLabel('Violation Type')
            .setPlaceholder('e.g. Admin Abuse, Exploit Facilitation, Leaking, Bribery')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const detailsInput = new TextInputBuilder()
            .setCustomId('wb_details')
            .setLabel('Detailed Confidential Statement')
            .setPlaceholder('Explain what happened, dates, times, and context...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const evidenceInput = new TextInputBuilder()
            .setCustomId('wb_evidence')
            .setLabel('Links to Evidence / Screenshots / Clips')
            .setPlaceholder('Imgur, YouTube, Streamable, or Google Drive links...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(accusedInput),
            new ActionRowBuilder().addComponents(categoryInput),
            new ActionRowBuilder().addComponents(detailsInput),
            new ActionRowBuilder().addComponents(evidenceInput)
        );

        await interaction.showModal(modal);
    }
};
