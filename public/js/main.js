// public/js/main.js - Main application logic

// Global state
const AppState = {
    currentTeam: 1,
    currentGroup: null,
    isGroupView: false,
    currentTab: 'headcount',
    currentForecast: null,
    currentVersion: null,
    teams: [],
    forecastVersions: [],
    calendarPeriods: [],
    teamData: {},
    selectedInputs: [],
    undoStack: [],
    redoStack: [],
    scrollPositions: { headcount: 0, production: 0 },
    currentUser: 'testuser@test.com' // Use email format
};

// Constants
const PG_LEVELS = ['PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'PG6', 'PG7'];
const PRODUCTS = ['Product A', 'Product B', 'Product C', 'Product D'];
const ADDITIONAL_PRODUCTS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];
let GROUPS = {}; // Will be populated from API

// Initialize application
async function initializeApp() {
    try {
        showLoadingIndicator('Initializing application...');
        
        // Check API health
        await API.checkHealth();
        
        // Load initial data including groups
        const [teams, versions, periods, groupsData] = await Promise.all([
            API.teams.getAll(),
            API.forecasts.getVersions(),
            API.actuals.getPeriods(),
            API.teams.getGroups() 
        ]);

        AppState.teams = teams;
        AppState.forecastVersions = versions;
        AppState.calendarPeriods = periods;

        // Build GROUPS object dynamically
        GROUPS = {};
        Object.entries(groupsData).forEach(([groupName, groupConfig]) => {
            // Store team IDs for consistency
            GROUPS[groupName] = groupConfig.teams.map(team => team.id);
        });
        
        AppState.teams = teams;
        AppState.forecastVersions = versions;
        AppState.calendarPeriods = periods;
        
        // Set default forecast version
        if (versions.length > 0) {
            AppState.currentVersion = versions[0];
            AppState.currentForecast = versions[0].version_name;
        }
        
        // Initialize UI components
        initializeSidebar();
        initializeForecastSelector();
        
        // Initialize global selection event listeners
        initializeSelectionListeners();
        
        // Initialize keyboard shortcuts
        initializeKeyboardShortcuts();
        
        // Load initial team data
        await loadTeamData(AppState.currentTeam);
        
        hideLoadingIndicator();
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        showError('Failed to initialize application. Please refresh the page.');
    }
}

// Initialize global selection event listeners
function initializeSelectionListeners() {
    // Global mouseup handler
    document.addEventListener('mouseup', () => {
        const selection = window.currentSelection;
        if (!selection) return;
        
        if (selection.isSelecting && AppState.selectedInputs.length > 1) {
            // Check if all selected are inputs
            const allInputs = AppState.selectedInputs.every(cell => cell.classList.contains('selectable-input'));
            if (allInputs) {
                // Check if all inputs are the same type
                const firstMetric = AppState.selectedInputs[0].dataset.metric;
                const allSameMetric = AppState.selectedInputs.every(input => input.dataset.metric === firstMetric);
                if (allSameMetric) {
                    openPercentageModal();
                }
            }
        }
        
        // Reset selection state
        if (window.currentSelection) {
            window.currentSelection.isSelecting = false;
            window.currentSelection.isDragging = false;
            window.currentSelection.selectionType = null;
        }
    });
    
    // Clear selection when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.matches('.selectable-input') && 
            !e.target.matches('td.actual-col') &&
            !e.target.matches('td.forecast-col') &&
            !e.target.closest('.modal') &&
            !e.target.closest('#statsBar') &&
            !e.shiftKey && !e.ctrlKey) {
            AppState.selectedInputs.forEach(c => c.classList.remove('selected'));
            AppState.selectedInputs = [];
            updateSelectionStats();
        }
    });
    
    // Prevent text selection during drag
    document.addEventListener('selectstart', (e) => {
        const selection = window.currentSelection;
        if (selection && (selection.isDragging || selection.isSelecting)) {
            e.preventDefault();
        }
    });
}

// Initialize keyboard shortcuts
function initializeKeyboardShortcuts() {
    // Track when Ctrl or Shift is held for selection mode
    document.addEventListener('keydown', (e) => {
        // Add selecting class when Ctrl or Shift is held
        if (e.ctrlKey || e.shiftKey) {
            document.body.classList.add('selecting');
        }
        
        // Escape key to close modal
        if (e.key === 'Escape') {
            const modal = document.getElementById('percentageModal');
            if (modal && modal.style.display === 'block') {
                closeModal();
            }
        }
        
        // Ctrl+Z for undo
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        
        // Ctrl+Y or Ctrl+Shift+Z for redo
        if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
            e.preventDefault();
            redo();
        }
        
        // Ctrl+A to select all visible cells (optional feature)
        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            selectAllVisibleCells();
        }
    });
    
    // Remove selecting class when Ctrl/Shift is released
    document.addEventListener('keyup', (e) => {
        if (!e.ctrlKey && !e.shiftKey) {
            document.body.classList.remove('selecting');
        }
    });
    
    // Enter key support in the modal
    const percentageInput = document.getElementById('percentageInput');
    if (percentageInput) {
        percentageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyValueChange();
            }
        });
    }
}

// Optional: Add select all functionality
function selectAllVisibleCells() {
    // Clear previous selection
    AppState.selectedInputs.forEach(c => c.classList.remove('selected'));
    AppState.selectedInputs = [];
    
    // Select all visible cells in the current tab
    const currentTabElement = document.querySelector('.tab-content.active');
    if (currentTabElement) {
        const selectableCells = currentTabElement.querySelectorAll(
            'td.actual-col, td.forecast-col, .selectable-input, input[type="number"]'
        );
        
        selectableCells.forEach(cell => {
            // Skip header cells
            if (!cell.closest('thead')) {
                AppState.selectedInputs.push(cell);
                cell.classList.add('selected');
            }
        });
        
        updateSelectionStats();
    }
}

// Initialize sidebar with teams and groups
function initializeSidebar() {
    const teamNav = document.getElementById('teamNav');
    teamNav.innerHTML = '';
    
    // Group teams by their groups using the loaded teams data
    const teamsByGroup = {};
    AppState.teams.forEach(team => {
        if (!teamsByGroup[team.group_name]) {
            teamsByGroup[team.group_name] = {
                displayName: team.group_display_name || team.group_name,
                teams: []
            };
        }
        teamsByGroup[team.group_name].teams.push(team);
    });
    
    // Create UI for each group
    Object.entries(teamsByGroup).forEach(([groupName, groupData]) => {
        // Create group header
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
        groupHeader.innerHTML = `
            <span class="group-name">${groupData.displayName}</span>
            <span class="arrow">▼</span>
        `;
        
        groupHeader.onclick = (e) => {
            e.stopPropagation();
            if (e.target.classList.contains('arrow')) {
                toggleGroup(groupHeader);
            } else {
                switchToGroup(groupName);
            }
        };
        
        teamNav.appendChild(groupHeader);
        
        // Create group items container
        const groupItems = document.createElement('div');
        groupItems.className = 'group-items';
        
        groupData.teams.forEach(team => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = team.team_name;
            a.onclick = (e) => {
                e.preventDefault();
                switchTeam(team.team_id);
            };
            if (team.team_id === 1) a.classList.add('active');
            li.appendChild(a);
            groupItems.appendChild(li);
        });
        
        teamNav.appendChild(groupItems);
    });
}

// Initialize forecast selector
function initializeForecastSelector() {
    const forecastSelect = document.getElementById('forecastSelect');
    forecastSelect.innerHTML = '';
    
    AppState.forecastVersions.forEach(version => {
        const option = document.createElement('option');
        option.value = version.version_id;
        option.textContent = version.version_name;
        forecastSelect.appendChild(option);
    });
    
    if (AppState.currentVersion) {
        forecastSelect.value = AppState.currentVersion.version_id;
    }
}

// Load team data
async function loadTeamData(teamId) {
    try {
        showLoadingIndicator('Loading team data...');
        
        const data = await API.teamData.get(
            teamId,
            AppState.currentVersion.version_id
        );
        
        // Transform and store data
        const transformedData = transformApiData(data);
        
        if (!AppState.teamData[AppState.currentForecast]) {
            AppState.teamData[AppState.currentForecast] = {};
        }
        AppState.teamData[AppState.currentForecast][`Team ${teamId}`] = transformedData;
        
        renderCurrentTab();
        hideLoadingIndicator();
        
    } catch (error) {
        console.error('Failed to load team data:', error);
        showError('Failed to load team data');
    }
}

// Get aggregated data for group
async function getGroupData(groupName) {
    // First ensure we have the groups loaded from database
    if (Object.keys(GROUPS).length === 0) {
        try {
            const groupsResponse = await API.teams.getGroups();
            GROUPS = {};
            Object.entries(groupsResponse).forEach(([key, groupConfig]) => {
                // Store team IDs instead of names for consistency
                GROUPS[key] = groupConfig.teams.map(team => team.id);
            });
        } catch (error) {
            console.error('Failed to load groups from database:', error);
            return null;
        }
    }
    
    const teamIds = GROUPS[groupName];
    if (!teamIds) {
        console.error('Group not found:', groupName);
        return null;
    }
    
    const months = generateMonthList();
    
    try {
        // Try to fetch from API first
        const response = await fetch(`/api/group-data/${groupName}/${AppState.currentVersion.version_id}`);
        if (response.ok) {
            const result = await response.json();
            if (result.data) {
                return transformApiData(result.data);
            }
        }
    } catch (error) {
        console.log('API group data not available, aggregating client-side');
    }
    
    // If API fails, aggregate client-side
    const aggregatedData = {
        forecastStatus: {},
        pgLevels: {},
        productivity: {},
        productMix: {},
        abpa: {},
        additionalProducts: {}
    };
    
    // Initialize data structures
    PG_LEVELS.forEach(pg => {
        aggregatedData.pgLevels[pg] = {};
    });
    
    PRODUCTS.forEach(product => {
        aggregatedData.productMix[product] = {};
        aggregatedData.abpa[product] = {};
    });
    
    // Initialize additional products
    ADDITIONAL_PRODUCTS.forEach(product => {
        aggregatedData.additionalProducts[product] = {
            productivity: {},
            abpa: {}
        };
    });
    
    // Make sure all team data is loaded - using team IDs
    for (const teamId of teamIds) {
        const teamKey = `Team ${teamId}`;
        if (!AppState.teamData[AppState.currentForecast]?.[teamKey]) {
            await loadTeamData(teamId);
        }
    }
    
    // Build array of team keys for aggregation
    const teamKeys = teamIds.map(id => `Team ${id}`);
    
    // Get forecast status from first team
    const firstTeamKey = teamKeys[0];
    if (AppState.teamData[AppState.currentForecast]?.[firstTeamKey]) {
        aggregatedData.forecastStatus = AppState.teamData[AppState.currentForecast][firstTeamKey].forecastStatus;
    }
    
    // Aggregate data for each month
    months.forEach(month => {
        // Sum headcount across all teams - ENSURE NUMBERS NOT STRINGS
        PG_LEVELS.forEach(pg => {
            aggregatedData.pgLevels[pg][month] = teamKeys.reduce((sum, teamKey) => {
                const teamData = AppState.teamData[AppState.currentForecast][teamKey];
                const value = teamData?.pgLevels[pg][month] || 0;
                // FORCE CONVERSION TO NUMBER
                return sum + (typeof value === 'string' ? parseInt(value) : value);
            }, 0);
        });
        
        // Calculate weighted average productivity
        let totalHeadcount = 0;
        let weightedProductivity = 0;
        
        teamKeys.forEach(teamKey => {
            const teamData = AppState.teamData[AppState.currentForecast][teamKey];
            if (!teamData) return;
            
            const teamHeadcount = PG_LEVELS.reduce((sum, pg) => {
                const value = teamData.pgLevels[pg][month] || 0;
                // FORCE CONVERSION TO NUMBER
                return sum + (typeof value === 'string' ? parseInt(value) : value);
            }, 0);
            totalHeadcount += teamHeadcount;
            const productivity = parseFloat(teamData.productivity[month] || 0);
            weightedProductivity += teamHeadcount * productivity;
        });
        
        aggregatedData.productivity[month] = totalHeadcount > 0 ? 
            (weightedProductivity / totalHeadcount).toFixed(2) : '0.00';
        
        // Calculate weighted average product mix and ABPA
        let totalAccounts = 0;
        const productAccounts = {};
        const productBalances = {};
        
        teamKeys.forEach(teamKey => {
            const teamData = AppState.teamData[AppState.currentForecast][teamKey];
            if (!teamData) return;
            
            const teamHeadcount = PG_LEVELS.reduce((sum, pg) => {
                const value = teamData.pgLevels[pg][month] || 0;
                // FORCE CONVERSION TO NUMBER
                return sum + (typeof value === 'string' ? parseInt(value) : value);
            }, 0);
            const teamProductivity = parseFloat(teamData.productivity[month] || 0);
            const monthIndex = months.indexOf(month);
            const businessDays = window.BUSINESS_DAYS?.[monthIndex] || 21;
            const teamAccounts = (teamHeadcount * teamProductivity * businessDays) / 5; // WEEKLY PRODUCTIVITY
            totalAccounts += teamAccounts;
            
            PRODUCTS.forEach(product => {
                const mix = teamData.productMix[product][month] || 0;
                const accounts = teamAccounts * mix;
                const abpa = teamData.abpa[product][month] || 0;
                
                if (!productAccounts[product]) productAccounts[product] = 0;
                if (!productBalances[product]) productBalances[product] = 0;
                
                productAccounts[product] += accounts;
                productBalances[product] += accounts * abpa;
            });
        });
        
        // Calculate final mix and ABPA values
        PRODUCTS.forEach(product => {
            aggregatedData.productMix[product][month] = totalAccounts > 0 ? 
                productAccounts[product] / totalAccounts : 0;
            aggregatedData.abpa[product][month] = productAccounts[product] > 0 ? 
                Math.round(productBalances[product] / productAccounts[product]) : 0;
        });
        
        // Aggregate additional products
        ADDITIONAL_PRODUCTS.forEach(product => {
            let totalAdditionalAccounts = 0;
            let totalAdditionalBalance = 0;
            
            teamKeys.forEach(teamKey => {
                const teamData = AppState.teamData[AppState.currentForecast][teamKey];
                if (!teamData || !teamData.additionalProducts) return;
                
                const teamHeadcount = PG_LEVELS.reduce((sum, pg) => {
                    const value = teamData.pgLevels[pg][month] || 0;
                    return sum + (typeof value === 'string' ? parseInt(value) : value);
                }, 0);
                
                const productProductivity = parseFloat(teamData.additionalProducts[product]?.productivity?.[month] || 0);
                const productAbpa = parseFloat(teamData.additionalProducts[product]?.abpa?.[month] || 0);
                const monthIndex = months.indexOf(month);
                const businessDays = window.BUSINESS_DAYS?.[monthIndex] || 21;
                const productAccounts = (teamHeadcount * productProductivity * businessDays) / 5;
                
                totalAdditionalAccounts += productAccounts;
                totalAdditionalBalance += productAccounts * productAbpa;
            });
            
            // Calculate weighted average productivity
            aggregatedData.additionalProducts[product].productivity[month] = 
                totalHeadcount > 0 ? (totalAdditionalAccounts / ((totalHeadcount * window.BUSINESS_DAYS?.[months.indexOf(month)] || 21) / 5)).toFixed(2) : '0.00';
            
            // Calculate weighted average ABPA
            aggregatedData.additionalProducts[product].abpa[month] = 
                totalAdditionalAccounts > 0 ? Math.round(totalAdditionalBalance / totalAdditionalAccounts) : 0;
        });
    });
    
    return aggregatedData;
}

// Transform API data to frontend format
function transformApiData(apiData) {
    const transformed = {
        forecastStatus: {},
        pgLevels: {
            PG1: {}, PG2: {}, PG3: {}, PG4: {}, PG5: {}, PG6: {}, PG7: {}
        },
        productivity: {},
        productMix: {
            'Product A': {}, 'Product B': {}, 'Product C': {}, 'Product D': {}
        },
        abpa: {
            'Product A': {}, 'Product B': {}, 'Product C': {}, 'Product D': {}
        },
        // Add structure for additional products
        additionalProducts: {}
    };
    
    // Initialize additional products
    ADDITIONAL_PRODUCTS.forEach(product => {
        transformed.additionalProducts[product] = {
            productivity: {},
            abpa: {}
        };
    });
    
    // Extract business days for global use
    const businessDaysMap = {};
    apiData.forEach(row => {
        businessDaysMap[row.period_string] = row.business_days;
    });
    window.BUSINESS_DAYS = Object.values(businessDaysMap);
    
    // Transform data
    apiData.forEach(row => {
        const period = row.period_string;
        
        transformed.forecastStatus[period] = row.data_type === 'forecast' ? 'Forecast' : 'Actual';
        
        // ENSURE ALL HEADCOUNT VALUES ARE NUMBERS
        transformed.pgLevels.PG1[period] = parseInt(row.pg1_headcount) || 0;
        transformed.pgLevels.PG2[period] = parseInt(row.pg2_headcount) || 0;
        transformed.pgLevels.PG3[period] = parseInt(row.pg3_headcount) || 0;
        transformed.pgLevels.PG4[period] = parseInt(row.pg4_headcount) || 0;
        transformed.pgLevels.PG5[period] = parseInt(row.pg5_headcount) || 0;
        transformed.pgLevels.PG6[period] = parseInt(row.pg6_headcount) || 0;
        transformed.pgLevels.PG7[period] = parseInt(row.pg7_headcount) || 0;
        
        // ENSURE PRODUCTIVITY IS ALWAYS 2 DECIMALS
        transformed.productivity[period] = parseFloat(row.productivity || 0).toFixed(2);
        
        transformed.productMix['Product A'][period] = parseFloat(row.product_a_mix) || 0;
        transformed.productMix['Product B'][period] = parseFloat(row.product_b_mix) || 0;
        transformed.productMix['Product C'][period] = parseFloat(row.product_c_mix) || 0;
        transformed.productMix['Product D'][period] = parseFloat(row.product_d_mix) || 0;
        
        transformed.abpa['Product A'][period] = Math.round(parseFloat(row.product_a_abpa) || 0);
        transformed.abpa['Product B'][period] = Math.round(parseFloat(row.product_b_abpa) || 0);
        transformed.abpa['Product C'][period] = Math.round(parseFloat(row.product_c_abpa) || 0);
        transformed.abpa['Product D'][period] = Math.round(parseFloat(row.product_d_abpa) || 0);
        
        // Transform additional products
        ADDITIONAL_PRODUCTS.forEach(product => {
            const prodLower = product.toLowerCase();
            transformed.additionalProducts[product].productivity[period] = 
                parseFloat(row[`product_${prodLower}_productivity`] || 0).toFixed(2);
            transformed.additionalProducts[product].abpa[period] = 
                Math.round(parseFloat(row[`product_${prodLower}_abpa`] || 0));
        });
    });
    
    return transformed;
}

// Switch between teams
async function switchTeam(teamNumber) {
    // Save current scroll position
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (currentWrapper) {
        AppState.scrollPositions[AppState.currentTab] = currentWrapper.scrollLeft;
    }
    
    AppState.currentTeam = teamNumber;
    AppState.currentGroup = null;
    AppState.isGroupView = false;
    
    // Update UI active states
    document.querySelectorAll('.team-nav a, .group-header').forEach(el => {
        el.classList.remove('active');
    });
    
    // Find the correct team and update display
    const team = AppState.teams.find(t => t.team_id === teamNumber);
    if (team) {
        document.querySelectorAll('.team-nav a').forEach((link) => {
            if (link.textContent === team.team_name) {  
                link.classList.add('active');
            }
        });
        
        document.getElementById('currentTeamDisplay').textContent = team.team_name;
    }
    
    // Load team data
    await loadTeamData(teamNumber);
    
    // Restore scroll position
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const newWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
            if (newWrapper && AppState.scrollPositions[AppState.currentTab] !== undefined) {
                newWrapper.scrollLeft = AppState.scrollPositions[AppState.currentTab];
            }
        });
    });
}

// Switch to group view
async function switchToGroup(groupName) {
    // Save current scroll position
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (currentWrapper) {
        AppState.scrollPositions[AppState.currentTab] = currentWrapper.scrollLeft;
    }
    
    AppState.currentGroup = groupName;
    AppState.isGroupView = true;
    
    // Update UI
    document.querySelectorAll('.team-nav a, .group-header').forEach(el => {
        el.classList.remove('active');
    });
    
    // Find the group header that was clicked
    const groupHeaders = document.querySelectorAll('.group-header');
    groupHeaders.forEach(header => {
        if (header.querySelector('.group-name').textContent === groupName) {
            header.classList.add('active');
        }
    });
    
    document.getElementById('currentTeamDisplay').innerHTML = 
        `Group ${groupName} <span class="group-view-indicator">Read Only</span>`;
    
    // Render the group data
    renderCurrentTab();
    
    // Restore scroll position
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const newWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
            if (newWrapper && AppState.scrollPositions[AppState.currentTab] !== undefined) {
                newWrapper.scrollLeft = AppState.scrollPositions[AppState.currentTab];
            }
        });
    });
}

// Switch forecast version
async function switchForecast() {
    // Save current scroll position BEFORE switching
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (currentWrapper) {
        AppState.scrollPositions[AppState.currentTab] = currentWrapper.scrollLeft;
    }
    
    const forecastSelect = document.getElementById('forecastSelect');
    const versionId = parseInt(forecastSelect.value);
    
    AppState.currentVersion = AppState.forecastVersions.find(v => v.version_id === versionId);
    AppState.currentForecast = AppState.currentVersion.version_name;
    
    if (AppState.isGroupView) {
        renderCurrentTab();
    } else {
        await loadTeamData(AppState.currentTeam);
    }
    
    // Restore scroll position AFTER rendering
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const newWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
            if (newWrapper && AppState.scrollPositions[AppState.currentTab] !== undefined) {
                newWrapper.scrollLeft = AppState.scrollPositions[AppState.currentTab];
            }
        });
    });
}

// Switch between tabs
function switchTab(tabName) {
    // Save current scroll position
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (currentWrapper) {
        AppState.scrollPositions[AppState.currentTab] = currentWrapper.scrollLeft;
    }
    
    AppState.currentTab = tabName;
    
    // Update UI
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    renderCurrentTab();
    
    // Restore scroll position
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const newWrapper = document.querySelector(`#${tabName}-tab .data-table-wrapper`);
            if (newWrapper && AppState.scrollPositions[tabName] !== undefined) {
                newWrapper.scrollLeft = AppState.scrollPositions[tabName];
            }
        });
    });
}

// Toggle group collapse/expand
function toggleGroup(header) {
    header.classList.toggle('collapsed');
    const groupItems = header.nextElementSibling;
    groupItems.classList.toggle('collapsed');
}

// Render current tab
async function renderCurrentTab() {
    let data;
    
    if (AppState.isGroupView) {
        data = await getGroupData(AppState.currentGroup);
        if (!data) return;
    } else {
        const teamKey = `Team ${AppState.currentTeam}`;
        data = AppState.teamData[AppState.currentForecast]?.[teamKey];
        if (!data) {
            await loadTeamData(AppState.currentTeam);
            return;
        }
    }
    
    if (AppState.currentTab === 'headcount') {
        renderHeadcountTab(data);
    } else {
        renderProductionTab(data);
        // Validate product mix after rendering
        setTimeout(validateAllProductMix, 100);
    }
}

// Handle headcount changes
async function handleHeadcountChange(input) {
    const month = input.dataset.month;
    const pg = input.dataset.pg;
    const team = input.dataset.team;
    const value = parseInt(input.value) || 0;
    
    // Save for undo
    const teamKey = `Team ${team}`;
    const previousValue = AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month];
    
    AppState.undoStack.push({
        type: 'headcountChange',
        data: { team, pg, month, previousValue, newValue: value }
    });
    AppState.redoStack = [];
    updateUndoRedoButtons();
    
    // Update local data
    AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month] = value;
    
    // Update displays
    updateHeadcountTotals(team, month);
    updateProductionCalculations(team, month);
    
    // Update database
    try {
        const fieldName = `pg${pg.substring(2)}_headcount`;
        await API.forecasts.updateData({
            teamId: parseInt(team),
            periodDate: getPeriodDate(month),
            versionId: AppState.currentVersion.version_id,
            field: fieldName,
            value: value,
            updatedBy: AppState.currentUser
        });
        
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to save change:', error);
        showError('Failed to save change');
    }
}

// Handle production changes
async function handleProductionChange(input) {
    const month = input.dataset.month;
    const team = input.dataset.team;
    const metric = input.dataset.metric;
    const product = input.dataset.product;
    let value = parseFloat(input.value.replace(/,/g, '')) || 0;
    
    const teamKey = `Team ${team}`;
    
    // Save previous value for undo
    let previousValue;
    if (metric === 'productivity') {
        previousValue = AppState.teamData[AppState.currentForecast][teamKey].productivity[month];
    } else if (metric === 'mix') {
        previousValue = AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] * 100;
    } else if (metric === 'abpa') {
        previousValue = AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month];
    }
    
    // Save for undo
    AppState.undoStack.push({
        type: 'productionChange',
        data: { 
            team, 
            month, 
            metric, 
            product, 
            previousValue, 
            newValue: value 
        }
    });
    AppState.redoStack = [];
    updateUndoRedoButtons();
    
    // Update local data
    if (metric === 'productivity') {
        AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = value.toFixed(2);
    } else if (metric === 'mix') {
        AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = value / 100;
    } else if (metric === 'abpa') {
        AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = value;
    }
    
    updateProductionCalculations(team, month);
    
    // Determine database field name
    let fieldName;
    let dbValue = value;
    if (metric === 'productivity') {
        fieldName = 'productivity';
    } else if (metric === 'mix') {
        const productLetter = product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_mix`;
        dbValue = value / 100; // Store as decimal in database
    } else if (metric === 'abpa') {
        const productLetter = product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_abpa`;
    }
    
    // Update database
    try {
        await API.forecasts.updateData({
            teamId: parseInt(team),
            periodDate: getPeriodDate(month),
            versionId: AppState.currentVersion.version_id,
            field: fieldName,
            value: dbValue,
            updatedBy: AppState.currentUser
        });
        
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to save change:', error);
        showError('Failed to save change');
    }
}

// Handle additional product changes
async function handleAdditionalProductChange(input) {
    const month = input.dataset.month;
    const product = input.dataset.product;
    const metric = input.dataset.metric;
    const team = input.dataset.team;
    let value = parseFloat(input.value.replace(/,/g, '')) || 0;
    
    const teamKey = `Team ${team}`;
    
    // Save for undo
    let previousValue;
    if (metric === 'additional-productivity') {
        previousValue = AppState.teamData[AppState.currentForecast][teamKey]
            .additionalProducts[product].productivity[month];
        AppState.teamData[AppState.currentForecast][teamKey]
            .additionalProducts[product].productivity[month] = value.toFixed(2);
    } else if (metric === 'additional-abpa') {
        previousValue = AppState.teamData[AppState.currentForecast][teamKey]
            .additionalProducts[product].abpa[month];
        AppState.teamData[AppState.currentForecast][teamKey]
            .additionalProducts[product].abpa[month] = value;
    }
    
    AppState.undoStack.push({
        type: 'additionalProductChange',
        data: { team, month, product, metric, previousValue, newValue: value }
    });
    AppState.redoStack = [];
    updateUndoRedoButtons();
    
    // Update calculations
    updateAdditionalProductCalculations(team, month, product);
    
    // Determine database field
    const fieldName = metric === 'additional-productivity' 
        ? `product_${product.toLowerCase()}_productivity`
        : `product_${product.toLowerCase()}_abpa`;
    
    // Update database
    try {
        await API.forecasts.updateData({
            teamId: parseInt(team),
            periodDate: getPeriodDate(month),
            versionId: AppState.currentVersion.version_id,
            field: fieldName,
            value: value,
            updatedBy: AppState.currentUser
        });
        
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to save change:', error);
        showError('Failed to save change');
    }
}

// Undo functionality
function undo() {
    if (AppState.undoStack.length === 0) return;
    
    // Save current scroll position
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    const currentScroll = currentWrapper ? currentWrapper.scrollLeft : 0;
    
    const action = AppState.undoStack.pop();
    AppState.redoStack.push(action);
    
    // Apply undo based on action type
    if (action.type === 'headcountChange') {
        const { team, pg, month, previousValue } = action.data;
        AppState.teamData[AppState.currentForecast][`Team ${team}`].pgLevels[pg][month] = previousValue;
        updateHeadcountTotals(team, month);
        updateProductionCalculations(team, month);
    } else if (action.type === 'productionChange') {
        const { team, month, metric, product, previousValue } = action.data;
        const teamKey = `Team ${team}`;
        
        if (metric === 'productivity') {
            AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(previousValue).toFixed(2);
            // Update the input directly
            const input = document.querySelector(`input[data-month="${month}"][data-metric="productivity"][data-team="${team}"]`);
            if (input) input.value = parseFloat(previousValue).toFixed(2);
        } else if (metric === 'mix') {
            AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = previousValue / 100;
            // Update the input directly
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="mix"][data-team="${team}"]`);
            if (input) input.value = previousValue;
        } else if (metric === 'abpa') {
            AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = previousValue;
            // Update the input directly
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="abpa"][data-team="${team}"]`);
            if (input) input.value = formatNumber(previousValue);
        }
        
        updateProductionCalculations(team, month);
    } else if (action.type === 'additionalProductChange') {
        const { team, month, product, metric, previousValue } = action.data;
        const teamKey = `Team ${team}`;
        
        if (metric === 'additional-productivity') {
            AppState.teamData[AppState.currentForecast][teamKey]
                .additionalProducts[product].productivity[month] = parseFloat(previousValue).toFixed(2);
            // Update the input directly
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-productivity"][data-team="${team}"]`);
            if (input) input.value = parseFloat(previousValue).toFixed(2);
        } else if (metric === 'additional-abpa') {
            AppState.teamData[AppState.currentForecast][teamKey]
                .additionalProducts[product].abpa[month] = parseInt(previousValue);
            // Update the input directly
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-abpa"][data-team="${team}"]`);
            if (input) input.value = formatNumber(previousValue);
        }
        
        updateAdditionalProductCalculations(team, month, product);
    } else if (action.type === 'percentageChange') {
        action.data.forEach(state => {
            const teamKey = `Team ${state.team}`;
            
            if (state.metric === 'productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].productivity[state.month] = parseFloat(state.previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month="${state.month}"][data-metric="productivity"][data-team="${state.team}"]`);
                if (input) input.value = parseFloat(state.previousValue).toFixed(2);
            } else if (state.metric === 'mix') {
                AppState.teamData[AppState.currentForecast][teamKey].productMix[state.product][state.month] = parseFloat(state.previousValue) / 100;
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="mix"][data-team="${state.team}"]`);
                if (input) input.value = state.previousValue;
            } else if (state.metric === 'abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].abpa[state.product][state.month] = parseInt(state.previousValue);
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="abpa"][data-team="${state.team}"]`);
                if (input) input.value = formatNumber(state.previousValue);
            } else if (state.metric === 'additional-productivity') {
                AppState.teamData[AppState.currentForecast][teamKey]
                    .additionalProducts[state.product].productivity[state.month] = parseFloat(state.previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="additional-productivity"][data-team="${state.team}"]`);
                if (input) input.value = parseFloat(state.previousValue).toFixed(2);
            } else if (state.metric === 'additional-abpa') {
                AppState.teamData[AppState.currentForecast][teamKey]
                    .additionalProducts[state.product].abpa[state.month] = parseInt(state.previousValue);
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="additional-abpa"][data-team="${state.team}"]`);
                if (input) input.value = formatNumber(state.previousValue);
            }
            
            updateProductionCalculations(state.team, state.month);
            if (state.metric === 'additional-productivity' || state.metric === 'additional-abpa') {
                updateAdditionalProductCalculations(state.team, state.month, state.product);
            }
        });
    }
    
    updateUndoRedoButtons();
    
    // Restore scroll position
    requestAnimationFrame(() => {
        const wrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
        if (wrapper) {
            wrapper.scrollLeft = currentScroll;
        }
    });
}

// Redo functionality
function redo() {
    if (AppState.redoStack.length === 0) return;
    
    // Save current scroll position
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    const currentScroll = currentWrapper ? currentWrapper.scrollLeft : 0;
    
    const action = AppState.redoStack.pop();
    AppState.undoStack.push(action);
    
    // Apply redo based on action type
    if (action.type === 'headcountChange') {
        const { team, pg, month, newValue } = action.data;
        AppState.teamData[AppState.currentForecast][`Team ${team}`].pgLevels[pg][month] = newValue;
        updateHeadcountTotals(team, month);
        updateProductionCalculations(team, month);
    } else if (action.type === 'productionChange') {
        const { team, month, metric, product, newValue } = action.data;
        const teamKey = `Team ${team}`;
        
        if (metric === 'productivity') {
            AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(newValue).toFixed(2);
            const input = document.querySelector(`input[data-month="${month}"][data-metric="productivity"][data-team="${team}"]`);
            if (input) input.value = parseFloat(newValue).toFixed(2);
        } else if (metric === 'mix') {
            AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = newValue / 100;
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="mix"][data-team="${team}"]`);
            if (input) input.value = newValue;
        } else if (metric === 'abpa') {
            AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = newValue;
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="abpa"][data-team="${team}"]`);
            if (input) input.value = formatNumber(newValue);
        }
        
        updateProductionCalculations(team, month);
    } else if (action.type === 'additionalProductChange') {
        const { team, month, product, metric, newValue } = action.data;
        const teamKey = `Team ${team}`;
        
        if (metric === 'additional-productivity') {
            AppState.teamData[AppState.currentForecast][teamKey]
                .additionalProducts[product].productivity[month] = parseFloat(newValue).toFixed(2);
            // Update the input directly
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-productivity"][data-team="${team}"]`);
            if (input) input.value = parseFloat(newValue).toFixed(2);
        } else if (metric === 'additional-abpa') {
            AppState.teamData[AppState.currentForecast][teamKey]
                .additionalProducts[product].abpa[month] = parseInt(newValue);
            // Update the input directly
            const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-abpa"][data-team="${team}"]`);
            if (input) input.value = formatNumber(newValue);
        }
        
        updateAdditionalProductCalculations(team, month, product);
    } else if (action.type === 'percentageChange') {
        action.data.forEach(state => {
            const teamKey = `Team ${state.team}`;
            
            if (state.metric === 'productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].productivity[state.month] = parseFloat(state.newValue).toFixed(2);
                const input = document.querySelector(`input[data-month="${state.month}"][data-metric="productivity"][data-team="${state.team}"]`);
                if (input) input.value = parseFloat(state.newValue).toFixed(2);
            } else if (state.metric === 'mix') {
                AppState.teamData[AppState.currentForecast][teamKey].productMix[state.product][state.month] = parseFloat(state.newValue) / 100;
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="mix"][data-team="${state.team}"]`);
                if (input) input.value = state.newValue;
            } else if (state.metric === 'abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].abpa[state.product][state.month] = parseInt(state.newValue);
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="abpa"][data-team="${state.team}"]`);
                if (input) input.value = formatNumber(state.newValue);
            } else if (state.metric === 'additional-productivity') {
                AppState.teamData[AppState.currentForecast][teamKey]
                    .additionalProducts[state.product].productivity[state.month] = parseFloat(state.newValue).toFixed(2);
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="additional-productivity"][data-team="${state.team}"]`);
                if (input) input.value = parseFloat(state.newValue).toFixed(2);
            } else if (state.metric === 'additional-abpa') {
                AppState.teamData[AppState.currentForecast][teamKey]
                    .additionalProducts[state.product].abpa[state.month] = parseInt(state.newValue);
                const input = document.querySelector(`input[data-month="${state.month}"][data-product="${state.product}"][data-metric="additional-abpa"][data-team="${state.team}"]`);
                if (input) input.value = formatNumber(state.newValue);
            }
            
            updateProductionCalculations(state.team, state.month);
            if (state.metric === 'additional-productivity' || state.metric === 'additional-abpa') {
                updateAdditionalProductCalculations(state.team, state.month, state.product);
            }
        });
    }
    
    updateUndoRedoButtons();
    
    // Restore scroll position
    requestAnimationFrame(() => {
        const wrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
        if (wrapper) {
            wrapper.scrollLeft = currentScroll;
        }
    });
}

// Update the openPercentageModal function
function openPercentageModal() {
    const modal = document.getElementById('percentageModal');
    const info = document.getElementById('selectionInfo');
    const label = document.getElementById('modalLabel');
    
    if (!modal) {
        console.error('Percentage modal not found');
        return;
    }
    
    // Determine the metric type from the first selected input
    const firstInput = AppState.selectedInputs[0];
    const metric = firstInput.dataset.metric;
    
    if (metric === 'productivity' || metric === 'additional-productivity') {
        label.textContent = 'Change by percentage (%):';
        info.textContent = `${AppState.selectedInputs.length} productivity cells selected`;
    } else if (metric === 'mix') {
        label.textContent = 'Set all values to (%):';
        info.textContent = `${AppState.selectedInputs.length} product mix cells selected`;
    } else if (metric === 'abpa' || metric === 'additional-abpa') {
        label.textContent = 'Set all values to:';
        info.textContent = `${AppState.selectedInputs.length} ABPA cells selected`;
    }
    
    modal.style.display = 'block';
    document.getElementById('percentageInput').focus();
}

// Update selection statistics
function updateSelectionStats() {
    if (AppState.selectedInputs.length < 2) {
        document.getElementById('statsBar').style.display = 'none';
        return;
    }
    
    let count = 0;
    let sum = 0;
    
    AppState.selectedInputs.forEach(cell => {
        let value = 0;
        
        // Check if it's an input element
        if (cell.tagName === 'INPUT') {
            value = parseFloat(cell.value.replace(/,/g, '')) || 0;
        } 
        // Check if it's a cell that contains an input
        else if (cell.querySelector('input')) {
            const input = cell.querySelector('input');
            value = parseFloat(input.value.replace(/,/g, '')) || 0;
        } 
        // It's a static cell
        else {
            const text = cell.textContent.trim();
            // Remove $ and M for millions, % for percentages
            const cleanText = text.replace(/[$%M]/g, '').replace(/,/g, '');
            value = parseFloat(cleanText) || 0;
            // If it was millions, multiply back
            if (text.includes('M')) {
                value = value * 1000000;
            }
        }
        count++;
        sum += value;
    });
    
    const average = count > 0 ? sum / count : 0;
    
    document.getElementById('statsCount').textContent = count;
    document.getElementById('statsSum').textContent = sum.toLocaleString(undefined, { maximumFractionDigits: 2 });
    document.getElementById('statsAverage').textContent = average.toLocaleString(undefined, { maximumFractionDigits: 2 });
    document.getElementById('statsBar').style.display = 'flex';
}

// Apply percentage change
function applyValueChange() {
    const inputValue = parseFloat(document.getElementById('percentageInput').value);
    if (isNaN(inputValue)) {
        alert('Please enter a valid value');
        return;
    }
    
    const firstInput = AppState.selectedInputs[0];
    const metric = firstInput.dataset.metric;
    
    // Save state for undo
    const previousState = AppState.selectedInputs.map(input => {
        const rawValue = input.value.replace(/,/g, '');
        const currentValue = parseFloat(rawValue) || 0;
        let newValue;
        
        if (metric === 'productivity' || metric === 'additional-productivity') {
            // Increase by percentage
            newValue = (currentValue * (1 + inputValue / 100)).toFixed(2);
        } else if (metric === 'mix') {
            // Set to specific value
            newValue = inputValue;
        } else if (metric === 'abpa' || metric === 'additional-abpa') {
            // Set to specific value
            newValue = inputValue;
        }
        
        return {
            team: input.dataset.team,
            month: input.dataset.month,
            metric: input.dataset.metric,
            product: input.dataset.product,
            pg: input.dataset.pg,
            previousValue: currentValue,
            newValue: parseFloat(newValue)
        };
    });
    
    AppState.undoStack.push({
        type: 'percentageChange',
        data: previousState
    });
    AppState.redoStack = [];
    updateUndoRedoButtons();
    
    // Apply changes
    previousState.forEach(state => {
        const input = AppState.selectedInputs.find(i => 
            i.dataset.month === state.month && 
            i.dataset.metric === state.metric &&
            (i.dataset.product === state.product || i.dataset.pg === state.pg)
        );
        if (input) {
            if (metric === 'abpa' || metric === 'additional-abpa') {
                input.value = state.newValue.toLocaleString();
            } else if (metric === 'productivity' || metric === 'additional-productivity') {
                input.value = state.newValue.toFixed(2);
            } else {
                input.value = state.newValue;
            }
            // Trigger change event
            input.dispatchEvent(new Event('change'));
        }
    });
    
    closeModal();
    showSaveIndicator();
}

// Close modal
function closeModal() {
    document.getElementById('percentageModal').style.display = 'none';
    document.getElementById('percentageInput').value = '';
    AppState.selectedInputs.forEach(input => input.classList.remove('selected'));
    AppState.selectedInputs = [];
    updateSelectionStats();
}

// Validate all product mix columns
function validateAllProductMix() {
    const months = generateMonthList();
    months.forEach(month => {
        validateProductMix(month);
    });
}

// Helper function to get period date from month string
function getPeriodDate(monthString) {
    const [monthName, year] = monthString.split('-');
    const monthMap = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
        'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
        'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };
    return `20${year}-${monthMap[monthName]}-01`;
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);