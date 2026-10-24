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
        "shiftPing": "1563653680555626591",
        "trainingPing": "1563653683491905706",
        "eventsPing": "1563653686834499725",
        "announcementsPing": "1563653689304940577",
        "qotdPing": "1563653691276263435",
        "staff": "1563653613467861035",
        "mr": "1563653574989324483",
        "hr": "1563653514738008104",
        "cSuite": "1563653504386736199",
        "boardOfDirectors": "1563653501874077828",
        "founder": "1563653496434069555",
        "coFounder": "1563653499324203059",
        "trainee": "1563653625794793513",
        "storeAssociate": "1563653620325417131",
        "seniorAssociate": "1563653616579907688",
        "security": "1563653607738319008",
        "shiftLead": "1563653587744329864",
        "supervisor": "1563653585382932624",
        "assistantManager": "1563653583247777893",
        "storeManager": "1563653580446105740",
        "corporateOfficer": "1563653553698897990",
        "customer": "1563653702617661560",
        "unverified": "1563653700197687317",
        "honeypot": "1563653707017617438",
        "loa": "1563653627472642171",
        "underInvestigation": "1563653707017617438",
        "birthday": "1563653702617661560",
        "verified": "1563653697693683893",
        "leadDev": "1563653517434953748",
        "groupDev": "1563653519700008980",
        "bestDev": "1563653517434953748",
        "supportGeneral": "1563653650226876507",
        "supportReport": "1563653653011767426",
        "supportManagement": "1563653655104716823",
        "supportTechnical": "1563653672724996248",
        "supportAppeals": "1563653675748954323"
    },

    // Auto Roles assigned on member join
    autoRoles: [
        '1563653702617661560' // 🛍️ │ Store Customer
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
