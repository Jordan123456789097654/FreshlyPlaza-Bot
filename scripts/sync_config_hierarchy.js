const fs = require('fs');
const path = require('path');

const hierarchy = JSON.parse(fs.readFileSync(path.join(__dirname, 'hierarchy_roles.json'), 'utf8'));
const keyRoles = hierarchy.keyToRoleId;

const configPath = path.join(__dirname, '../config.js');
let configContent = fs.readFileSync(configPath, 'utf8');

const updatedRolesObj = {
    shiftPing: keyRoles.shiftPing,
    trainingPing: keyRoles.trainingPing,
    eventsPing: keyRoles.eventsPing,
    announcementsPing: keyRoles.announcementsPing,
    qotdPing: keyRoles.qotdPing,
    staff: keyRoles.staff,
    mr: keyRoles.mr,
    hr: keyRoles.hr,
    cSuite: hierarchy.rankToRoleId['252'] || keyRoles.founder,
    boardOfDirectors: keyRoles.boardOfDirectors,
    founder: keyRoles.founder,
    coFounder: keyRoles.coFounder,
    trainee: keyRoles.trainee,
    storeAssociate: keyRoles.storeAssociate,
    seniorAssociate: keyRoles.seniorAssociate,
    security: keyRoles.security,
    shiftLead: keyRoles.shiftLead,
    supervisor: keyRoles.supervisor,
    assistantManager: keyRoles.assistantManager,
    storeManager: keyRoles.storeManager,
    corporateOfficer: hierarchy.rankToRoleId['104'] || keyRoles.hr,
    customer: keyRoles.customer,
    unverified: keyRoles.unverified,
    honeypot: keyRoles.honeypot,
    loa: keyRoles.loa,
    underInvestigation: keyRoles.honeypot,
    birthday: keyRoles.customer,
    verified: keyRoles.verified,
    leadDev: keyRoles.leadDev,
    groupDev: keyRoles.groupDev,
    bestDev: keyRoles.leadDev,
    supportGeneral: keyRoles.supportGeneral,
    supportReport: keyRoles.supportReport,
    supportManagement: keyRoles.supportManagement,
    supportTechnical: keyRoles.supportTechnical,
    supportAppeals: keyRoles.supportAppeals
};

const roleBlock = '    // Role IDs\n    roles: ' + JSON.stringify(updatedRolesObj, null, 8).replace(/}$/, '    },') + ',';
configContent = configContent.replace(/\/\/\s*Role IDs[\s\S]*?autoRoles:\s*\[/, roleBlock + '\n\n    // Auto Roles assigned on member join\n    autoRoles: [');

configContent = configContent.replace(/autoRoles:\s*\[[\s\S]*?\]/, "autoRoles: [\n        '" + keyRoles.customer + "' // 🛍️ │ Store Customer\n    ]");

fs.writeFileSync(configPath, configContent, 'utf8');
console.log('Successfully updated config.js with hierarchy roles!');
