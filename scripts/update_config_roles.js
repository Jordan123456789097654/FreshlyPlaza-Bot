const fs = require('fs');
const path = require('path');

const newRoles = JSON.parse(fs.readFileSync(path.join(__dirname, 'remade_roles.json'), 'utf8'));
const configPath = path.join(__dirname, '../config.js');
let configContent = fs.readFileSync(configPath, 'utf8');

const updatedRolesObj = {
    shiftPing: newRoles.shiftPing,
    trainingPing: newRoles.trainingPing,
    eventsPing: newRoles.eventsPing,
    announcementsPing: newRoles.announcementsPing,
    qotdPing: newRoles.qotdPing,
    staff: newRoles.staff,
    mr: newRoles.mr,
    hr: newRoles.hr,
    cSuite: newRoles.cSuite,
    boardOfDirectors: newRoles.boardOfDirectors,
    founder: newRoles.founder,
    coFounder: newRoles.coFounder,
    trainee: newRoles.trainee,
    storeAssociate: newRoles.storeAssociate,
    seniorAssociate: newRoles.seniorAssociate,
    security: newRoles.security,
    shiftLead: newRoles.shiftLead,
    supervisor: newRoles.supervisor,
    assistantManager: newRoles.assistantManager,
    storeManager: newRoles.storeManager,
    corporateOfficer: newRoles.corporateOfficer,
    customer: newRoles.customer,
    unverified: newRoles.unverified,
    honeypot: newRoles.honeypot,
    loa: newRoles.loa,
    underInvestigation: newRoles.honeypot,
    birthday: newRoles.customer,
    verified: newRoles.verified,
    leadDev: newRoles.leadDev,
    groupDev: newRoles.groupDev,
    bestDev: newRoles.leadDev,
    supportGeneral: newRoles.supportGeneral,
    supportReport: newRoles.supportReport,
    supportManagement: newRoles.supportManagement,
    supportTechnical: newRoles.supportTechnical,
    supportAppeals: newRoles.supportAppeals
};

const roleBlock = '    // Role IDs\n    roles: ' + JSON.stringify(updatedRolesObj, null, 8).replace(/}$/, '    },') + ',';
configContent = configContent.replace(/\/\/\s*Role IDs[\s\S]*?autoRoles:\s*\[/, roleBlock + '\n\n    // Auto Roles assigned on member join\n    autoRoles: [');

configContent = configContent.replace(/autoRoles:\s*\[[\s\S]*?\]/, "autoRoles: [\n        '" + newRoles.customer + "' // 🛍️ │ Store Customer\n    ]");

fs.writeFileSync(configPath, configContent, 'utf8');
console.log('Successfully updated config.js with new role mappings!');
