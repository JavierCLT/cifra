// public/js/api.js - API communication layer

const API = {
    baseURL: '/api',
    
    // Generic request handler
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Request failed');
            }
            
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    },
    
    // Teams API
    teams: {
        async getAll() {
            const result = await API.request('/teams');
            return result.data;
        },
        
        async getById(teamId) {
            const result = await API.request(`/teams/${teamId}`);
            return result.data;
        },
        
        async getGroups() {
            const result = await API.request('/teams/groups/all');
            return result.data;
        }
    },
    
    // Forecasts API
    forecasts: {
        async getVersions() {
            const result = await API.request('/forecasts/versions');
            return result.data;
        },
        
        async createVersion(data) {
            return await API.request('/forecasts/versions', {
                method: 'POST',
                body: JSON.stringify(data)
            });
        },
        
        async updateData(data) {
            return await API.request('/forecasts/data', {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        },
        
        async bulkUpdate(data) {
            return await API.request('/forecasts/data/bulk', {
                method: 'PUT',
                body: JSON.stringify(data)
            });
        },
        
        async getAuditLog(teamId, versionId) {
            const params = versionId ? `?versionId=${versionId}` : '';
            const result = await API.request(`/forecasts/audit/${teamId}${params}`);
            return result.data;
        }
    },
    
    // Combined data API
    teamData: {
        async get(teamId, versionId, startDate, endDate) {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            
            const result = await API.request(
                `/team-data/${teamId}/${versionId}?${params}`
            );
            return result.data;
        },
        
        async getGroup(groupName, versionId, startDate, endDate) {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            
            const result = await API.request(
                `/group-data/${groupName}/${versionId}?${params}`
            );
            return result.data;
        }
    },
    
    // Actuals API
    actuals: {
        async getTeamActuals(teamId, startDate, endDate) {
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);

            const result = await API.request(
                `/actuals/team/${teamId}?${params}`
            );
            return result.data;
        },

        async getPeriods() {
            const result = await API.request('/actuals/periods');
            return result.data;
        },

        async getCalendar(year) {
            const params = year ? `?year=${year}` : '';
            const result = await API.request(`/actuals/calendar${params}`);
            return result.data;
        }
    },

    productionConfig: {
        async get(versionId) {
            if (!versionId) {
                throw new Error('versionId is required');
            }
            const params = new URLSearchParams({ versionId: String(versionId) });
            const result = await API.request(`/production-config?${params.toString()}`);
            return result.data;
        },

        async save(payload) {
            if (!payload || typeof payload !== 'object') {
                throw new Error('payload is required to save production settings');
            }
            return await API.request('/production-config', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
        }
    },

    // Health check
    async checkHealth() {
        return await API.request('/health');
    }
};

// Non-Sales Headcount API
API.nonSales = {
    async getGroup(groupKey, versionId) {
        if (!groupKey) {
            throw new Error('groupKey is required to fetch non-sales data');
        }
        const query = new URLSearchParams();
        if (versionId != null) {
            query.append('versionId', versionId);
        }
        const suffix = query.toString();
        const endpoint = `/non-sales/group/${groupKey}${suffix ? `?${suffix}` : ''}`;
        const result = await API.request(endpoint);
        return result.data;
    },
    async updateData(data) {
        return await API.request('/non-sales/data', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
};

