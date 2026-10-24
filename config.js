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
        "welcome": "1563651075792441556",
        "verification": "1563651078627528746",
        "informationRules": "1563651081567731764",
        "announcements": "1563651085246140558",
        "events": "1563651089624998048",
        "shifts": "1563651095467794452",
        "shiftLogs": "1563651178816868372",
        "trainingSessions": "1563651098932158525",
        "greggsTraining": "1563651103059345508",
        "trainingLogs": "1563651181589434548",
        "supportCenter": "1563651106049884181",
        "generalChat": "1563651111213334649",
        "botCommands": "1563651114237431958",
        "media": "1563651117185900694",
        "guessTheNumber": "1563651120197410856",
        "qotd": "1563651123259383858",
        "suggestions": "1563651129684791466",
        "bugsReport": "1563651132658679839",
        "knownBugs": "1563651134818881718",
        "staffAnnouncements": "1563651140724199425",
        "staffHeadquarters": "1563651142813094061",
        "staffChat": "1563651142813094061",
        "loaAnnouncements": "1563651146092912640",
        "manualPunishments": "1563651148978855966",
        "staffLoungeVoice": "1563651152061403186",
        "managementChat": "1563651158357057537",
        "dataEntries": "1563651161679073421",
        "corporateAnnouncements": "1563651164762022211",
        "modLogs": "1563651172387000432",
        "punishmentLogs": "1563651175796973598",
        "demoteLogs": "1563651183883714680",
        "ticketLogs": "1563651186937303194",
        "devUpdates": "1563651190036762756",
        "honeypot": "1563651193425895706",
        "ticketsCategory": "1563651196659433552",
        "activityAppeals": "1560274579082182778",
        "systemStatus": "1563651190036762756",
        "hiringAnnouncements": "1563651085246140558",
        "staffSubAnnouncements": "1563651140724199425",
        "serverBanLogs": "1563651175796973598"
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
