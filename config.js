module.exports = {
    guildId: '1558519063649587301',
    testGuildId: null,
    trustAndSafetyGuildId: '1561767415044378694',
    robloxGroupId: '505768378',
    storeName: 'Grandway Shopping',
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
        shifts: '1558519067525124145',
        shiftLogs: '1558519068494135420',
        trainingSessions: '1558519067998949442',
        greggsTraining: '1558519067998949443',
        trainingLogs: '1558519068494135423',
        events: '1558519067998949437',
        bugsReport: '1558519067525124137',
        knownBugs: '1558519067525124136',
        suggestions: '1558519066904232014',
        honeypot: '1558519066904232010',
        modLogs: '1558519066904232009',
        punishmentLogs: '1558519068951187496',
        demoteLogs: '1558519068494135424',
        botCommands: '1558519067998949446',
        verification: '1558519067525124141',
        qotd: '1558519067998949438',
        ticketsCategory: '1558519068951187498',
        staffAnnouncements: '1558519066904232008',
        staffHeadquarters: '1558519066904232008',
        activityAppeals: '1560274579082182778',
        loaAnnouncements: '1558519066904232008',
        systemStatus: '1558519068494135419',
        guessTheNumber: '1558519068317978626',
        devUpdates: '1558519068494135417',
        ticketLogs: '1560274624888049745',
        supportCenter: '1560283581144633344',
        dataEntries: '1558519068317978629',
        corporateAnnouncements: '1558519068951187500',
        hiringAnnouncements: '1558519066904232008',
        staffSubAnnouncements: '1558519066904232008',
        serverBanLogs: '1558519068494135425'
    },

    // Role IDs
    roles: {
        shiftPing: '1558519063716569152',
        trainingPing: '1558519063716569153',
        eventsPing: '1558519063716569156',
        announcementsPing: '1558519063716569155',
        staff: '1558519063737802844',
        mr: '1558519063729405989',
        hr: '1558519063729405990',
        trainee: '1558519063737802843',
        customer: '1558519063737802842',
        honeypot: '1558519063683010659',
        loa: '1558519063808974918',
        underInvestigation: '1558519063683010659',
        birthday: '1558519063649587309',
        verified: '1558519063729405983',
        leadDev: '1558519063808974916',
        groupDev: '1558519063808974917',
        bestDev: '1558519063808974916',
        supportGeneral: '1560274559087673364',
        supportReport: '1560274579086250084',
        supportManagement: '1560274579400958042',
        supportTechnical: '1560274579111411785',
        supportAppeals: '1560274579082182778'
    },

    // Auto Roles assigned on member join
    autoRoles: [
        '1558519063737802842' // 🛍️ │ Store Customer
    ],

    // LOA Ping Protection
    loaPing: {
        enabled: true,
        strikeThreshold: 0,   // Auto-issue 1 strike after this many LOA-ping warnings (0 = disabled)
        deleteMessage: false  // Delete the offending message after warning
    },

    // AI assistant default state (runtime changes via /config ai are persisted in the database)
    ai: {
        enabled: true
    },

    // Ticket override: this user can view, speak in, and manage every ticket channel
    // and is treated as staff for ticket buttons and commands.
    ticketOverride: {
        userId: '1046538179399929957',
        username: 'JordanDanielsGames2'
    },

    // Exempt Users (ignored from inactive checks / termination sweeps)
    ignoredUserIds: [
        '1468030071242625098' // SECRET_DEVJED
    ]
};
