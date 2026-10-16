const https = require('https');
require('dotenv').config();

let csrfToken = null;

const COOKIE = process.env.ROBLOX_COOKIE;
const GROUP_ID = process.env.ROBLOX_GROUP_ID || '1110376670';

function robloxRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FreshlyPlazaBot/1.0',
            ...(options.headers || {})
        };

        if (COOKIE) {
            headers['Cookie'] = `.ROBLOSECURITY=${COOKIE}`;
        }
        if (csrfToken && ['POST', 'PATCH', 'DELETE'].includes(options.method || 'GET')) {
            headers['X-CSRF-TOKEN'] = csrfToken;
        }
        if (postData) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = https.request({ ...options, headers }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 403 && res.headers['x-csrf-token']) {
                    csrfToken = res.headers['x-csrf-token'];
                    return robloxRequest(options, postData).then(resolve).catch(reject);
                }

                try {
                    const parsed = data ? JSON.parse(data) : {};
                    resolve({ statusCode: res.statusCode, data: parsed, raw: data });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: null, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

const RobloxManager = {
    getGroupId() {
        return GROUP_ID;
    },

    async checkCookieHealth() {
        try {
            const res = await robloxRequest({
                hostname: 'users.roblox.com',
                path: '/v1/users/authenticated',
                method: 'GET'
            });

            if (res.statusCode === 200 && res.data && res.data.id) {
                return { valid: true, user: res.data };
            }
            return { valid: false, error: res.data?.errors?.[0]?.message || `HTTP ${res.statusCode}` };
        } catch (e) {
            return { valid: false, error: e.message };
        }
    },

    async getUserIdByUsername(username) {
        try {
            const postBody = JSON.stringify({ usernames: [username], excludeBannedUsers: false });
            const res = await robloxRequest({
                hostname: 'users.roblox.com',
                path: '/v1/usernames/users',
                method: 'POST'
            }, postBody);

            if (res.statusCode === 200 && res.data && res.data.data && res.data.data.length > 0) {
                return res.data.data[0];
            }
            return null;
        } catch (e) {
            console.error('[ROBLOX MANAGER] Failed getUserIdByUsername:', e);
            return null;
        }
    },

    async getGroupRoles(groupId = GROUP_ID) {
        try {
            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path: `/v1/groups/${groupId}/roles`,
                method: 'GET'
            });

            if (res.statusCode === 200 && res.data && res.data.roles) {
                return res.data.roles;
            }
            return [];
        } catch (e) {
            console.error('[ROBLOX MANAGER] Failed getGroupRoles:', e);
            return [];
        }
    },

    async getUserRankInGroup(userId, groupId = GROUP_ID) {
        try {
            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path: `/v2/users/${userId}/groups/roles`,
                method: 'GET'
            });

            if (res.statusCode === 200 && res.data && res.data.data) {
                const groupData = res.data.data.find(g => String(g.group.id) === String(groupId));
                if (groupData) {
                    return groupData.role;
                }
            }
            return null;
        } catch (e) {
            console.error('[ROBLOX MANAGER] Failed getUserRankInGroup:', e);
            return null;
        }
    },

    async setRank(userId, roleId, groupId = GROUP_ID) {
        try {
            const postBody = JSON.stringify({ roleId: Number(roleId) });
            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path: `/v1/groups/${groupId}/users/${userId}`,
                method: 'PATCH'
            }, postBody);

            if (res.statusCode === 200) {
                return { success: true };
            }
            return {
                success: false,
                error: res.data?.errors?.[0]?.message || `HTTP ${res.statusCode}`
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async promoteUser(userId, groupId = GROUP_ID) {
        const roles = await this.getGroupRoles(groupId);
        if (!roles.length) return { success: false, error: 'Could not fetch group roles' };

        const sortedRoles = roles.sort((a, b) => a.rank - b.rank);
        const currentRole = await this.getUserRankInGroup(userId, groupId);
        if (!currentRole) return { success: false, error: 'User is not in group' };

        const currentRankIndex = sortedRoles.findIndex(r => r.id === currentRole.id);
        if (currentRankIndex === -1 || currentRankIndex >= sortedRoles.length - 1) {
            return { success: false, error: 'User is already at the maximum rank' };
        }

        const nextRole = sortedRoles[currentRankIndex + 1];
        const res = await this.setRank(userId, nextRole.id, groupId);
        if (res.success) {
            return { success: true, oldRole: currentRole, newRole: nextRole };
        }
        return res;
    },

    async demoteUser(userId, groupId = GROUP_ID) {
        const roles = await this.getGroupRoles(groupId);
        if (!roles.length) return { success: false, error: 'Could not fetch group roles' };

        const sortedRoles = roles.sort((a, b) => a.rank - b.rank);
        const currentRole = await this.getUserRankInGroup(userId, groupId);
        if (!currentRole) return { success: false, error: 'User is not in group' };

        const currentRankIndex = sortedRoles.findIndex(r => r.id === currentRole.id);
        if (currentRankIndex <= 1) {
            return { success: false, error: 'User is already at the lowest member rank' };
        }

        const prevRole = sortedRoles[currentRankIndex - 1];
        const res = await this.setRank(userId, prevRole.id, groupId);
        if (res.success) {
            return { success: true, oldRole: currentRole, newRole: prevRole };
        }
        return res;
    },

    async exileUser(userId, groupId = GROUP_ID) {
        try {
            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path: `/v1/groups/${groupId}/users/${userId}`,
                method: 'DELETE'
            });

            if (res.statusCode === 200) {
                return { success: true };
            }
            return {
                success: false,
                error: res.data?.errors?.[0]?.message || `HTTP ${res.statusCode}`
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async postShout(message, groupId = GROUP_ID) {
        try {
            const postBody = JSON.stringify({ message: message || '' });
            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path: `/v1/groups/${groupId}/status`,
                method: 'PATCH'
            }, postBody);

            if (res.statusCode === 200) {
                return { success: true, shout: res.data };
            }
            return {
                success: false,
                error: res.data?.errors?.[0]?.message || `HTTP ${res.statusCode}`
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async deleteWallPost(postId, groupId = GROUP_ID) {
        try {
            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path: `/v1/groups/${groupId}/wall/posts/${postId}`,
                method: 'DELETE'
            });

            return res.statusCode === 200 ? { success: true } : { success: false, error: `HTTP ${res.statusCode}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async getGroupAuditLogs(actionType = null, limit = 10, groupId = GROUP_ID) {
        try {
            let path = `/v1/groups/${groupId}/audit-log?limit=${limit}&sortOrder=Desc`;
            if (actionType) path += `&actionType=${actionType}`;

            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path,
                method: 'GET'
            });

            if (res.statusCode === 200 && res.data && res.data.data) {
                return res.data.data;
            }
            return [];
        } catch (e) {
            console.error('[ROBLOX MANAGER] Failed getGroupAuditLogs:', e);
            return [];
        }
    },

    async getGroupInfo(groupId = GROUP_ID) {
        try {
            const res = await robloxRequest({
                hostname: 'groups.roblox.com',
                path: `/v1/groups/${groupId}`,
                method: 'GET'
            });
            return res.statusCode === 200 ? res.data : null;
        } catch (e) {
            return null;
        }
    },

    async getGameStats(placeId = '76637220767393') {
        try {
            const uniRes = await robloxRequest({
                hostname: 'apis.roblox.com',
                path: `/universes/v1/places/${placeId}/universe`,
                method: 'GET'
            });

            if (uniRes.statusCode === 200 && uniRes.data && uniRes.data.universeId) {
                const uId = uniRes.data.universeId;
                const gameRes = await robloxRequest({
                    hostname: 'games.roblox.com',
                    path: `/v1/games?universeIds=${uId}`,
                    method: 'GET'
                });
                if (gameRes.statusCode === 200 && gameRes.data?.data?.[0]) {
                    return { universeId: uId, ...gameRes.data.data[0] };
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    }
};

module.exports = RobloxManager;
