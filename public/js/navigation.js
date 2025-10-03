// public/js/navigation.js - Navigation and modal helpers

(function () {
    if (typeof window === 'undefined') {
        return;
    }

    const AppState = window.AppState || {};
    const NON_SALES_GROUPS = Array.isArray(window.NON_SALES_GROUPS) ? window.NON_SALES_GROUPS : [];
    const NON_SALES_TEAM_INDEX = new Map(
        (Array.isArray(window.NON_SALES_TEAMS) ? window.NON_SALES_TEAMS : [])
            .map(team => [Number(team.team_id), team])
    );

    function isNonSalesTeam(teamId) {
        return NON_SALES_TEAM_INDEX.has(Number(teamId));
    }

    function getNonSalesGroupByTeam(teamId) {
        const id = Number(teamId);
        for (const group of NON_SALES_GROUPS) {
            if ((group.teams || []).some(team => Number(team.team_id) === id)) {
                return group;
            }
        }
        return null;
    }

    function initializeSidebar() {
        const nav = document.getElementById('teamNav');
        if (!nav) return;

        nav.innerHTML = '';
        if (AppState.headcountSubtab === 'non-sales') {
            buildNonSalesSidebar(nav);
        } else {
            buildSalesSidebar(nav);
        }

        highlightSidebarSelection();
        updateCurrentTeamLabel();
    }

    function buildSalesSidebar(container) {
        const grouped = {};
        (AppState.teams || []).forEach(team => {
            const key = team.group_name || 'ungrouped';
            if (!grouped[key]) {
                grouped[key] = {
                    displayName: team.group_display_name || key,
                    teams: []
                };
            }
            grouped[key].teams.push(team);
        });

        Object.entries(grouped).forEach(([groupKey, groupData]) => {
            const isActive = AppState.isGroupView && AppState.currentGroup === groupKey;
            const header = createGroupHeader({
                key: groupKey,
                display: groupData.displayName,
                isActive,
                collapsed: !isActive,
                onToggle: () => toggleGroup(header),
                onSelect: () => switchToGroup(groupKey),
                showArrow: true
            });
            header.dataset.groupDisplay = groupData.displayName;
            container.appendChild(header);

            const groupItems = document.createElement('div');
            groupItems.className = 'group-items';
            if (!isActive) {
                groupItems.classList.add('collapsed');
            }

            groupData.teams.forEach(team => {
                const item = createTeamListItem({
                    team,
                    category: 'sales',
                    groupKey
                });
                groupItems.appendChild(item);
            });

            container.appendChild(groupItems);
        });
    }

    function buildNonSalesSidebar(container) {
        const groups = Array.isArray(NON_SALES_GROUPS) ? NON_SALES_GROUPS : [];
        const activeGroupKey = AppState.currentNonSalesGroup || (groups[0]?.key);

        groups.forEach(group => {
            const header = createGroupHeader({
                key: group.key,
                display: group.displayName,
                isActive: group.key === activeGroupKey,
                collapsed: false,
                onSelect: () => switchToNonSalesGroup(group.key),
                showArrow: false
            });
            container.appendChild(header);
        });
    }

    function createGroupHeader({ key, display, isActive, collapsed, onToggle, onSelect, showArrow = true }) {
        const header = document.createElement('div');
        header.className = 'group-header';
        header.dataset.groupKey = key;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-name';
        nameSpan.textContent = display;
        header.appendChild(nameSpan);

        if (showArrow) {
            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'arrow';
            header.appendChild(arrowSpan);
            if (collapsed) {
                header.classList.add('collapsed');
            }
        } else {
            header.classList.add('group-header--static');
        }

        if (isActive) {
            header.classList.add('active');
        }

        header.addEventListener('click', (event) => {
            const isArrow = showArrow && event.target.closest('.arrow');
            if (isArrow) {
                onToggle?.(header);
            } else {
                onSelect?.(header);
            }
        });

        return header;
    }

    function createTeamListItem({ team, category, groupKey }) {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = team.team_name;
        link.dataset.teamId = team.team_id;
        link.addEventListener('click', (event) => {
            event.preventDefault();
            switchTeam(team.team_id, { category, groupKey });
        });
        li.appendChild(link);
        return li;
    }

    function toggleGroup(header) {
        if (!header) return;
        header.classList.toggle('collapsed');
        const groupItems = header.nextElementSibling;
        if (groupItems && groupItems.classList.contains('group-items')) {
            groupItems.classList.toggle('collapsed');
        }
    }

    async function switchTeam(teamNumber, options = {}) {
        const teamId = Number(teamNumber);
        if (!Number.isFinite(teamId)) return;

        const category = options.category || (isNonSalesTeam(teamId) ? 'non-sales' : 'sales');
        const currentWrapper = getActiveWrapper();
        if (currentWrapper) {
            const key = getScrollKeyForState();
            AppState.scrollPositions[key] = currentWrapper.scrollLeft;
        }

        if (category === 'non-sales') {
            const group = options.groupKey ? NON_SALES_GROUPS.find(g => g.key === options.groupKey) : getNonSalesGroupByTeam(teamId);
            const resolvedGroupKey = group?.key || AppState.currentNonSalesGroup || (NON_SALES_GROUPS[0]?.key);
            AppState.currentNonSalesGroup = resolvedGroupKey;
            AppState.lastSelectedGroups = AppState.lastSelectedGroups || {};
            AppState.lastSelectedGroups.nonSales = resolvedGroupKey;
            AppState.teamCategory = 'non-sales';
            AppState.isGroupView = false;
            AppState.currentGroup = null;
            AppState.currentTeam = group?.teams?.[0]?.team_id || teamId;

            highlightSidebarSelection();
            updateCurrentTeamLabel();

            if (typeof window.renderCurrentTab === 'function') {
                await window.renderCurrentTab();
            }

            restoreScrollAfterLoad();
            return;
        }

        AppState.currentTeam = teamId;
        AppState.teamCategory = 'sales';
        AppState.isGroupView = false;
        AppState.currentGroup = null;
        AppState.lastSelectedTeams = AppState.lastSelectedTeams || {};
        AppState.lastSelectedTeams.sales = teamId;

        highlightSidebarSelection(teamId);
        updateCurrentTeamLabel();

        try {
            if (typeof window.loadTeamData === 'function') {
                await window.loadTeamData(teamId);
            }
        } catch (error) {
            console.error('Failed to load team data:', error);
        }

        restoreScrollAfterLoad();
    }

    async function switchToGroup(groupKey) {
        if (!groupKey) return;

        const currentWrapper = getActiveWrapper();
        if (currentWrapper) {
            const key = getScrollKeyForState();
            AppState.scrollPositions[key] = currentWrapper.scrollLeft;
        }

        AppState.currentGroup = groupKey;
        AppState.isGroupView = true;
        AppState.teamCategory = 'sales';

        document.querySelectorAll('.team-nav a').forEach(link => link.classList.remove('active'));
        document.querySelectorAll('.team-nav .group-header').forEach(header => {
            header.classList.toggle('active', header.dataset.groupKey === groupKey);
        });

        const displayName = document.querySelector(`.group-header[data-group-key="${groupKey}"] .group-name`)?.textContent || groupKey;
        const label = document.getElementById('currentTeamDisplay');
        if (label) {
            label.innerHTML = `${displayName} <span class="group-view-indicator">Read Only</span>`;
        }

        if (typeof window.renderCurrentTab === 'function') {
            await window.renderCurrentTab();
        }

        restoreScrollAfterLoad();
    }

    async function switchToNonSalesGroup(groupKey) {
        if (!groupKey) return;

        const currentWrapper = getActiveWrapper();
        if (currentWrapper) {
            const key = getScrollKeyForState();
            AppState.scrollPositions[key] = currentWrapper.scrollLeft;
        }

        AppState.teamCategory = 'non-sales';
        AppState.isGroupView = false;
        AppState.currentGroup = null;
        AppState.currentNonSalesGroup = groupKey;
        AppState.lastSelectedGroups = AppState.lastSelectedGroups || {};
        AppState.lastSelectedGroups.nonSales = groupKey;

        const group = NON_SALES_GROUPS.find(g => g.key === groupKey);
        if (group?.teams?.length) {
            AppState.currentTeam = group.teams[0].team_id;
            AppState.lastSelectedTeams = AppState.lastSelectedTeams || { sales: AppState.currentTeam || 1, nonSales: null };
            AppState.lastSelectedTeams.nonSales = AppState.currentTeam;
        }

        highlightSidebarSelection();
        updateCurrentTeamLabel();

        if (typeof window.renderCurrentTab === 'function') {
            await window.renderCurrentTab();
        }

        restoreScrollAfterLoad();
    }

    function highlightSidebarSelection(teamId = AppState.currentTeam) {
        if (AppState.headcountSubtab === 'non-sales') {
            const groupKey = AppState.currentNonSalesGroup;
            document.querySelectorAll('.team-nav .group-header').forEach(header => {
                header.classList.toggle('active', header.dataset.groupKey === groupKey);
            });
            return;
        }

        const numericId = Number(teamId);
        document.querySelectorAll('.team-nav a').forEach(link => {
            const matches = Number(link.dataset.teamId) === numericId;
            link.classList.toggle('active', matches);
            if (matches) {
                const groupItems = link.closest('.group-items');
                if (groupItems) {
                    groupItems.classList.remove('collapsed');
                    const header = groupItems.previousElementSibling;
                    if (header && header.classList.contains('group-header')) {
                        header.classList.remove('collapsed');
                        header.classList.add('active');
                    }
                }
            }
        });

        if (!AppState.isGroupView) {
            const team = (AppState.teams || []).find(t => t.team_id === numericId);
            const groupKey = team?.group_name;
            document.querySelectorAll('.team-nav .group-header').forEach(header => {
                header.classList.toggle('active', header.dataset.groupKey === groupKey);
            });
        }
    }

    function updateCurrentTeamLabel() {
        const label = document.getElementById('currentTeamDisplay');
        if (!label) return;

        if (AppState.isGroupView && AppState.currentGroup) {
            const display = document.querySelector(`.group-header[data-group-key="${AppState.currentGroup}"] .group-name`)?.textContent || AppState.currentGroup;
            label.innerHTML = `${display} <span class="group-view-indicator">Read Only</span>`;
            return;
        }

        if (AppState.teamCategory === 'non-sales') {
            const group = NON_SALES_GROUPS.find(g => g.key === AppState.currentNonSalesGroup);
            label.textContent = group ? group.displayName : 'Non-Sales';
            return;
        }

        const team = (AppState.teams || []).find(t => t.team_id === Number(AppState.currentTeam));
        label.textContent = team ? team.team_name : (AppState.currentTeam ? `Team ${AppState.currentTeam}` : '');
    }

    function restoreScrollAfterLoad() {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const wrapper = getActiveWrapper();
                const key = getScrollKeyForState();
                if (wrapper && AppState.scrollPositions[key] !== undefined) {
                    wrapper.scrollLeft = AppState.scrollPositions[key];
                } else if (typeof window.scrollToJan2024 === 'function' && AppState.currentTab === 'headcount') {
                    window.scrollToJan2024();
                }
            });
        });
    }

    window.initializeSidebar = initializeSidebar;
    window.toggleGroup = toggleGroup;
    window.switchTeam = switchTeam;
    window.switchToGroup = switchToGroup;
    window.highlightSidebarSelection = highlightSidebarSelection;
    window.updateCurrentTeamLabel = updateCurrentTeamLabel;
    window.switchToNonSalesGroup = switchToNonSalesGroup;
})();
