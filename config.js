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
        "shiftPing": "1563652422252101746",
        "trainingPing": "1563652419206905929",
        "eventsPing": "1563652416811966617",
        "announcementsPing": "1563652413703856260",
        "qotdPing": "1563652410587750543",
        "staff": "1563652471186923675",
        "mr": "1563652488869978145",
        "hr": "1563652504116404304",
        "cSuite": "1563652509459816539",
        "boardOfDirectors": "1563652511745839267",
        "founder": "1563652517768732702",
        "coFounder": "1563652514702958755",
        "trainee": "1563652458264400052",
        "storeAssociate": "1563652461351141589",
        "seniorAssociate": "1563652464027373631",
        "security": "1563652468695507044",
        "shiftLead": "1563652477197357178",
        "supervisor": "1563652480150147226",
        "assistantManager": "1563652483111461086",
        "storeManager": "1563652485976170539",
        "corporateOfficer": "1563652500769480895",
        "customer": "1563652430091124900",
        "unverified": "1563652428119670904",
        "honeypot": "1563652408431607828",
        "loa": "1563652455890296842",
        "underInvestigation": "1563652408431607828",
        "birthday": "1563652430091124900",
        "verified": "1563652433039851631",
        "leadDev": "1563652497409843320",
        "groupDev": "1563652494825885727",
        "bestDev": "1563652497409843320",
        "supportGeneral": "1563652450924101705",
        "supportReport": "1563652447828836362",
        "supportManagement": "1563652442913247292",
        "supportTechnical": "1563652440660770918",
        "supportAppeals": "1563652437976416376"
    },

    // Auto Roles assigned on member join
    autoRoles: [
        '1563652430091124900' // 🛍️ │ Store Customer
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
