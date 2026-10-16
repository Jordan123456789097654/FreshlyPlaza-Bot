module.exports = {
    guildId: '1504761883566280735',
    testGuildId: '1558519063649587301',
    robloxGroupId: '1110376670',
    storeName: 'FreshlyPlaza',
    robloxGameLink: 'https://www.roblox.com/games/76637220767393/FreshlyPlazza-V2',
    
    // Brand Colors
    colors: {
        primary: 0x2ECC71,   // Fresh Green
        secondary: 0x3498DB, // Clean Blue
        warning: 0xF1C40F,   // Yellow
        danger: 0xE74C3C,    // Red
        neutral: 0x95A5A6    // Gray
    },

    // Channel IDs
    channels: {
        shifts: '1505309843219546223',
        shiftLogs: '1511043137261535392',
        trainingSessions: '1505309891244589066',
        greggsTraining: '1510548086953349150',
        trainingLogs: '1511043321814843576',
        events: '1510644873114423338',
        bugsReport: '1528501240969957447',
        knownBugs: '1528883412595904673',
        suggestions: '1526869423917498388',
        honeypot: '1529254082274000927',
        modLogs: '1524174852980736150',
        punishmentLogs: '1511043475150209276',
        demoteLogs: '1511043393336115270',
        botCommands: '1510384518534795334',
        verification: '1505203971839496344',
        qotd: '1505621550064472244',
        ticketsCategory: '1525187246016434267',
        staffAnnouncements: '1509272778711367860',
        staffHeadquarters: '1505203529403596922',
        activityAppeals: '1505309938715725866',
        loaAnnouncements: '1559311276176441434',
        systemStatus: '1559314210800803860',
        guessTheNumber: '1560038674551406603',
        devUpdates: '1505307362494255386',
        ticketLogs: '1560290501100576878',
        supportCenter: '1560290502815785041',
        dataEntries: '1560356498264166541',
        corporateAnnouncements: '1541943644536180836',
        hiringAnnouncements: '1559311276176441434',
        staffSubAnnouncements: '1559311276176441434'
    },

    // Role IDs
    roles: {
        shiftPing: '1505467482188550174',
        trainingPing: '1505467644202057849',
        eventsPing: '1505467779191537724',
        announcementsPing: '1505467534437257217',
        staff: '1510381899472834560',
        mr: '1510381780845465660',
        hr: '1510381803305828422',
        trainee: '1510380082731159552',
        customer: '1510380083955765349',
        honeypot: '1529254081443528808',
        loa: '1529080794675417239',
        underInvestigation: '1527345840082128898',
        birthday: '1530990957795741878',
        verified: '1511068524376883451',
        leadDev: '1541297344778080276',
        groupDev: '1528451538341728396',
        bestDev: '1528083645926084801',
        supportGeneral: '1560290487783657472',
        supportReport: '1560290488479653964',
        supportManagement: '1560290490589642855',
        supportTechnical: '1560290491189436598',
        supportAppeals: '1560290493055762434'
    },

    // LOA Ping Protection
    loaPing: {
        enabled: true,
        strikeThreshold: 0,   // Auto-issue 1 strike after this many LOA-ping warnings (0 = disabled)
        deleteMessage: false  // Delete the offending message after warning
    },

    // Exempt Users (ignored from inactive checks / termination sweeps)
    ignoredUserIds: [
        '1468030071242625098' // SECRET_DEVJED
    ]
};
