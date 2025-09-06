// public/js/main.js - Main application logic

// Global state
const AppState = {
    currentTeam: 1,
    currentGroup: null,
    isGroupView: false,
    isBulkPasting: false,
    isProgrammaticChange: false,
    currentTab: 'headcount',
    headcountSubtab: 'sales', // 'sales' | 'non-sales'
    productionSubtab: 'investments', // 'investments' | 'banking'
    currentForecast: null,
    currentVersion: null,
    teams: [],
    forecastVersions: [],
    calendarPeriods: [],
    teamData: {},
    nonSalesData: {}, // mirrors teamData shape but only pgLevels/forecastStatus
    selectedInputs: [],
    undoStack: [],
    redoStack: [],
    scrollPositions: { 
        headcount: 0,
        headcount_sales: 0,
        headcount_non_sales: 0,
        production: 0,
        production_investments: 0,
        production_banking: 0,
        referrals: 0,
        incentive: 0,
        kmpc: 0,
        finance: 0
    },
    currentUser: 'testuser@test.com' // Use email format
};

// Constants
const PG_LEVELS = ['PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'PG6', 'PG7'];
const PRODUCTS = ['Product A', 'Product B', 'Product C', 'Product D'];
const ADDITIONAL_PRODUCTS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];
let GROUPS = {}; // Will be populated from API

// Helpers to manage scroll per (tab, subtab)
function getScrollKeyForState(tabName = AppState.currentTab) {
    if (tabName === 'headcount') {
        return AppState.headcountSubtab === 'sales' ? 'headcount_sales' : 'headcount_non_sales';
    }
    if (tabName === 'production') {
        return AppState.productionSubtab === 'investments' ? 'production_investments' : 'production_banking';
    }
    return tabName;
}

function getActiveWrapper() {
    if (AppState.currentTab === 'headcount') {
        const id = AppState.headcountSubtab === 'sales' ? 'sales-headcount-subtab' : 'non-sales-headcount-subtab';
        return document.querySelector(`#${id} .data-table-wrapper`) || document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    } else if (AppState.currentTab === 'production') {
        const id = AppState.productionSubtab === 'investments' ? 'production-investments-subtab' : 'production-banking-subtab';
        return document.querySelector(`#${id} .data-table-wrapper`) || document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    }
    return document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
}

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

        // Initialize cross-tab sync for Incentive Admin changes
        initializeIncentiveConfigSync();
        // Initialize paste handlers for Excel-style multi-cell paste
        initializePasteHandlers();

        
        
        // Load initial team data
        await loadTeamData(AppState.currentTeam);
        
        // Scroll to Jan-24 after initial load
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollToJan2024();
            });
        });

        hideLoadingIndicator();
        
    } catch (error) {
        console.error('Failed to initialize application:', error);
        showError('Failed to initialize application. Please refresh the page.');
    }
}

// Listen for Incentive Admin saves and refresh Incentive tab if relevant
function initializeIncentiveConfigSync() {
    try {
        const bc = new BroadcastChannel('incentiveConfig');
        bc.onmessage = (ev) => {
            const msg = ev.data || {};
            const teamId = parseInt(msg.teamId);
            const versionId = parseInt(msg.versionId);
            if (!teamId || !versionId) return;
            if (teamId === AppState.currentTeam && AppState.currentVersion && AppState.currentVersion.version_id === versionId) {
                if (AppState.currentTab === 'incentive') {
                    // Preserve current horizontal scroll before re-render
                    const wrapper = document.querySelector('#incentive-tab .data-table-wrapper');
                    if (wrapper) {
                        AppState.scrollPositions.incentive = wrapper.scrollLeft || 0;
                    }
                    renderCurrentTab();
                }
            }
        };
        window.__incentiveBC = bc;
    } catch (e) {
        // Fallback via localStorage events if BroadcastChannel not available
        window.addEventListener('storage', (e) => {
            if (e.key !== 'incentive_config_updated') return;
            try {
                const msg = JSON.parse(e.newValue || '{}');
                const teamId = parseInt(msg.teamId);
                const versionId = parseInt(msg.versionId);
                if (!teamId || !versionId) return;
                if (teamId === AppState.currentTeam && AppState.currentVersion && AppState.currentVersion.version_id === versionId) {
                    if (AppState.currentTab === 'incentive') {
                        const wrapper = document.querySelector('#incentive-tab .data-table-wrapper');
                        if (wrapper) {
                            AppState.scrollPositions.incentive = wrapper.scrollLeft || 0;
                        }
                        renderCurrentTab();
                    }
                }
            } catch {}
        });
    }
}

// Initialize global paste handlers for Excel-style pasting
function initializePasteHandlers() {
    document.addEventListener('paste', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'INPUT') return;
        // Only handle inputs that are part of our tables (must have a month dataset)
        if (!target.dataset || !target.dataset.month) return;

        const clipboard = (e.clipboardData || window.clipboardData);
        if (!clipboard) return;
        const text = clipboard.getData('text');
        if (!text) return;

        // Only intercept when multiple cells likely (tabs/newlines present)
        if (!/[\t\n\r]/.test(text)) {
            // Single value paste – let default behavior happen
            return;
        }

        e.preventDefault();
        try {
            handleMatrixPaste(target, text);
        } catch (err) {
            console.error('Paste failed:', err);
            showError('Paste failed. Please check the data format.');
        }
    });
}

// Parse clipboard text into a 2D matrix (rows x columns)
function parseClipboardMatrix(rawText) {
    // Normalize newlines and trim trailing blank lines
    const lines = rawText
        .replace(/\r/g, '\n')
        .split('\n')
        .filter((line, idx, arr) => line.length > 0 || (idx < arr.length - 1 && arr[idx + 1].length > 0));
    const matrix = lines
        .map(line => line.split('\t'))
        // Remove trailing empty columns if line ends with tab(s)
        .map(cols => {
            let end = cols.length;
            while (end > 0 && (cols[end - 1] === '' || cols[end - 1] == null)) end--;
            return cols.slice(0, end);
        })
        .filter(row => row.length > 0);
    return matrix;
}

function getMetricKeyFromInput(input) {
    if (input.dataset.metric) return input.dataset.metric;
    if (input.dataset.pg) return 'headcount';
    return null;
}

function rowMatchesMetric(rowEl, metricKey) {
    if (!rowEl) return false;
    switch (metricKey) {
        case 'headcount':
            return !!rowEl.querySelector('input[data-pg]');
        case 'productivity':
            return !!rowEl.querySelector('input[data-metric="productivity"]');
        case 'mix':
            return !!rowEl.querySelector('input[data-metric="mix"]');
        case 'abpa':
            return !!rowEl.querySelector('input[data-metric="abpa"]');
        case 'additional-productivity':
            return !!rowEl.querySelector('input[data-metric="additional-productivity"]');
        case 'additional-abpa':
            return !!rowEl.querySelector('input[data-metric="additional-abpa"]');
        default:
            return false;
    }
}

function getInputsForRowByMetric(rowEl, metricKey) {
    switch (metricKey) {
        case 'headcount':
            return Array.from(rowEl.querySelectorAll('input[data-pg]'));
        case 'productivity':
            return Array.from(rowEl.querySelectorAll('input[data-metric="productivity"]'));
        case 'mix':
            return Array.from(rowEl.querySelectorAll('input[data-metric="mix"]'));
        case 'abpa':
            return Array.from(rowEl.querySelectorAll('input[data-metric="abpa"]'));
        case 'additional-productivity':
            return Array.from(rowEl.querySelectorAll('input[data-metric="additional-productivity"]'));
        case 'additional-abpa':
            return Array.from(rowEl.querySelectorAll('input[data-metric="additional-abpa"]'));
        default:
            return [];
    }
}

function findNextRowWithMetric(currentRow, metricKey) {
    let row = currentRow.nextElementSibling;
    while (row) {
        if (rowMatchesMetric(row, metricKey)) return row;
        row = row.nextElementSibling;
    }
    return null;
}

function parsePastedValue(metricKey, raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === '') return null;
    // Remove thousand separators and currency symbols
    s = s.replace(/[,\$]/g, '');
    // Remove millions marker (M) if present; values are expected as absolute in UI
    s = s.replace(/\s*M\s*$/i, '');

    if (metricKey === 'mix') {
        const hasPercent = /%/.test(s);
        s = s.replace(/%/g, '').trim();
        let v = parseFloat(s);
        if (isNaN(v)) return null;
        // If no % sign and value looks like a fraction, treat as percent
        if (!hasPercent && v <= 1) v = v * 100;
        // Clamp to [0,100]
        if (v < 0) v = 0; if (v > 100) v = 100;
        return { display: String(v), stored: v };
    }

    if (metricKey === 'productivity' || metricKey === 'additional-productivity') {
        let v = parseFloat(s);
        if (isNaN(v)) return null;
        v = Math.round(v * 100) / 100;
        return { display: v.toFixed(2), stored: v };
    }

    if (metricKey === 'abpa' || metricKey === 'additional-abpa') {
        let v = parseFloat(s);
        if (isNaN(v)) return null;
        // ABPA displays with thousand separators
        return { display: Number(v).toLocaleString(), stored: v };
    }

    if (metricKey === 'headcount') {
        let v = parseInt(s, 10);
        if (isNaN(v)) v = 0;
        return { display: String(v), stored: v };
    }

    // Default fallback
    const v = parseFloat(s);
    if (isNaN(v)) return null;
    return { display: String(v), stored: v };
}

function getDbFieldAndValue(input, metricKey, storedValue) {
    let fieldName;
    let dbValue = storedValue;
    if (metricKey === 'headcount') {
        fieldName = `pg${input.dataset.pg.substring(2)}_headcount`;
    } else if (metricKey === 'productivity') {
        fieldName = 'productivity';
    } else if (metricKey === 'mix') {
        const productLetter = input.dataset.product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_mix`;
        dbValue = storedValue / 100; // store as decimal
    } else if (metricKey === 'abpa') {
        const productLetter = input.dataset.product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_abpa`;
    } else if (metricKey === 'additional-productivity') {
        fieldName = `product_${input.dataset.product.toLowerCase()}_productivity`;
    } else if (metricKey === 'additional-abpa') {
        fieldName = `product_${input.dataset.product.toLowerCase()}_abpa`;
    }
    return { fieldName, dbValue };
}

// Build field and db value without an input element (for undo/redo)
function getFieldAndDbValueFromState(metricKey, product, pg, value) {
    let fieldName;
    let dbValue = value;
    if (metricKey === 'headcount') {
        fieldName = `pg${pg.substring(2)}_headcount`;
    } else if (metricKey === 'productivity') {
        fieldName = 'productivity';
    } else if (metricKey === 'mix') {
        const productLetter = product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_mix`;
        dbValue = (parseFloat(value) || 0) / 100;
    } else if (metricKey === 'abpa') {
        const productLetter = product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_abpa`;
    } else if (metricKey === 'additional-productivity') {
        fieldName = `product_${product.toLowerCase()}_productivity`;
    } else if (metricKey === 'additional-abpa') {
        fieldName = `product_${product.toLowerCase()}_abpa`;
    }
    return { fieldName, dbValue };
}

function getCurrentUiValueFromState(input, metricKey) {
    const teamKey = `Team ${input.dataset.team}`;
    const month = input.dataset.month;
    if (metricKey === 'headcount') {
        return parseInt(AppState.teamData[AppState.currentForecast][teamKey].pgLevels[input.dataset.pg][month] || 0);
    }
    if (metricKey === 'productivity') {
        return parseFloat(AppState.teamData[AppState.currentForecast][teamKey].productivity[month] || 0);
    }
    if (metricKey === 'mix') {
        const product = input.dataset.product;
        const v = AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] || 0;
        return v * 100; // convert to percent for UI
    }
    if (metricKey === 'abpa') {
        const product = input.dataset.product;
        return parseFloat(AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] || 0);
    }
    if (metricKey === 'additional-productivity') {
        const product = input.dataset.product;
        return parseFloat(AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].productivity[month] || 0);
    }
    if (metricKey === 'additional-abpa') {
        const product = input.dataset.product;
        return parseFloat(AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].abpa[month] || 0);
    }
    return 0;
}

// Apply matrix paste starting from a focused input
function handleMatrixPaste(startInput, rawText) {
    const matrix = parseClipboardMatrix(rawText);
    if (!matrix || matrix.length === 0) return;

    const metricKey = getMetricKeyFromInput(startInput);
    if (!metricKey) return; // Not a supported field

    const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
    const startMonth = startInput.dataset.month;

    const updates = [];
    const changes = [];
    AppState.isBulkPasting = true;
    try {
        let currentRow = startInput.closest('tr');
        for (let r = 0; r < matrix.length; r++) {
            if (!currentRow || !rowMatchesMetric(currentRow, metricKey)) break;

            const allInputs = getInputsForRowByMetric(currentRow, metricKey);
            if (allInputs.length === 0) break;

            // Sort inputs in month order to ensure correct mapping
            const sorted = allInputs.slice().sort((a, b) => {
                const ai = months.indexOf(a.dataset.month);
                const bi = months.indexOf(b.dataset.month);
                return ai - bi;
            });

            let startIdx = sorted.findIndex(i => i.dataset.month === startMonth);
            if (startIdx < 0) startIdx = 0;

            const cols = matrix[r];
            for (let c = 0; c < cols.length; c++) {
                const targetInput = sorted[startIdx + c];
                if (!targetInput) break;
                const parsed = parsePastedValue(metricKey, cols[c]);
                if (!parsed) continue;
                const previousValue = getCurrentUiValueFromState(targetInput, metricKey);
                // Apply to UI
                targetInput.value = parsed.display;
                // Build DB update
                const { fieldName, dbValue } = getDbFieldAndValue(targetInput, metricKey, parsed.stored);
                // Push update
                updates.push({
                    teamId: parseInt(targetInput.dataset.team),
                    periodDate: getPeriodDate(targetInput.dataset.month),
                    field: fieldName,
                    newValue: dbValue
                });
                // Track change for grouped undo
                changes.push({
                    team: targetInput.dataset.team,
                    month: targetInput.dataset.month,
                    metric: metricKey,
                    product: targetInput.dataset.product,
                    pg: targetInput.dataset.pg,
                    previousValue: previousValue,
                    newValue: parsed.stored
                });
                // Trigger change to update local state and calculations (API suppressed)
                targetInput.dispatchEvent(new Event('change'));
            }

            // Move to next row (for multi-row paste)
            currentRow = findNextRowWithMetric(currentRow, metricKey);
        }
    } finally {
        AppState.isBulkPasting = false;
    }

    // Push single undo action for this paste
    if (changes.length > 0) {
        const ctx = { tab: AppState.currentTab, subtab: (AppState.currentTab === 'headcount' ? AppState.headcountSubtab : (AppState.currentTab === 'production' ? AppState.productionSubtab : null)) };
        AppState.undoStack.push({ type: 'bulkPaste', data: changes, context: ctx });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }

    // Send bulk update
    if (updates.length > 0) {
        const showBusy = updates.length > 50;
        if (showBusy) showLoadingIndicator('Pasting...');
        API.forecasts.bulkUpdate({
            updates: updates,
            versionId: AppState.currentVersion.version_id,
            updatedBy: AppState.currentUser
        }).then(() => {
            showSaveIndicator();
            if (showBusy) hideLoadingIndicator();
        }).catch((error) => {
            console.error('Bulk update failed:', error);
            showError('Failed to save pasted values');
            if (showBusy) hideLoadingIndicator();
        });
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
                // Only open modal for supported metrics (exclude headcount)
                if (allSameMetric && firstMetric && firstMetric !== 'headcount') {
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
    // Save current scroll position (aware of subtabs)
    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[getScrollKeyForState()] = currentWrapper.scrollLeft;
    }
    
    AppState.currentTeam = teamNumber;
    AppState.currentGroup = null;
    AppState.isGroupView = false;
    
    // Clear scroll positions to trigger Jan-24 scroll on new team
    AppState.scrollPositions = { headcount: 0, production: 0 };
    
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
    
    // Restore scroll position AFTER rendering (aware of subtabs)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const newWrapper = getActiveWrapper();
            const key = getScrollKeyForState();
            if (newWrapper && AppState.scrollPositions[key] !== undefined) {
                newWrapper.scrollLeft = AppState.scrollPositions[key];
            }
        });
    });
}

// Switch between tabs (callable from code or click)
function switchTab(tabName) {
    // Save current scroll position
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (currentWrapper) {
        AppState.scrollPositions[AppState.currentTab] = currentWrapper.scrollLeft;
    }
    
    AppState.currentTab = tabName;
    
    // Update UI
    const tabButtons = document.querySelectorAll('.tabs .tab');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    // Activate matching button when called programmatically
    const match = Array.from(tabButtons).find(btn => (btn.textContent || '').trim().toLowerCase() === tabName.toLowerCase());
    if (match) match.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Show/minimize headcount mini-tabs based on active tab
    const hcSubtabs = document.getElementById('headcount-subtabs');
    if (hcSubtabs) {
        hcSubtabs.style.display = (tabName === 'headcount') ? 'flex' : 'none';
        // Ensure content panes visibility aligns with selected subtab
        const salesC = document.getElementById('sales-headcount-subtab');
        const nsC = document.getElementById('non-sales-headcount-subtab');
        if (tabName === 'headcount') {
            if (AppState.headcountSubtab === 'sales') { if (salesC) salesC.style.display=''; if (nsC) nsC.style.display='none'; }
            else { if (salesC) salesC.style.display='none'; if (nsC) nsC.style.display=''; }
        }
    }

    // Show/minimize production mini-tabs based on active tab
    const pdSubtabs = document.getElementById('production-subtabs');
    if (pdSubtabs) {
        pdSubtabs.style.display = (tabName === 'production') ? 'flex' : 'none';
        const invC = document.getElementById('production-investments-subtab');
        const bankC = document.getElementById('production-banking-subtab');
        if (tabName === 'production') {
            if (AppState.productionSubtab === 'investments') { if (invC) invC.style.display=''; if (bankC) bankC.style.display='none'; }
            else { if (invC) invC.style.display='none'; if (bankC) bankC.style.display=''; }
        }
    }

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
    
    switch(AppState.currentTab) {
        case 'headcount':
            // Ensure subtabs are visible
            const subtabs = document.getElementById('headcount-subtabs');
            if (subtabs) subtabs.style.display = 'flex';

            // Ensure containers visibility matches selected subtab
            const salesContainer = document.getElementById('sales-headcount-subtab');
            const nsContainer = document.getElementById('non-sales-headcount-subtab');
            if (AppState.headcountSubtab === 'sales') {
                if (salesContainer) salesContainer.style.display = '';
                if (nsContainer) nsContainer.style.display = 'none';
                renderHeadcountTab(data, { containerId: 'sales-headcount-subtab', mode: 'sales' });
            } else {
                // Prepare non-sales data if missing
                const teamKey = `Team ${AppState.currentTeam}`;
                if (!AppState.nonSalesData[AppState.currentForecast]) {
                    AppState.nonSalesData[AppState.currentForecast] = {};
                }
                if (!AppState.nonSalesData[AppState.currentForecast][teamKey]) {
                    const months = generateMonthList();
                    const ns = { forecastStatus: {}, pgLevels: {} };
                    // clone forecast/actual flags from sales data, init zeros
                    ns.forecastStatus = { ...data.forecastStatus };
                    PG_LEVELS.forEach(pg => {
                        ns.pgLevels[pg] = {};
                        months.forEach(m => { ns.pgLevels[pg][m] = 0; });
                    });
                    AppState.nonSalesData[AppState.currentForecast][teamKey] = ns;
                }
                const nsData = AppState.nonSalesData[AppState.currentForecast][teamKey];

                // Attempt to load Non-Sales ACTUALS then any saved FORECAST rows from backend
                try {
                    // 1) Actuals
                    const actualsRows = await API.nonSales.getActualsTeam(AppState.currentTeam);
                    if (Array.isArray(actualsRows) && actualsRows.length) {
                        const toMonthStr = (dateStr) => {
                            if (!dateStr) return null;
                            const [y, m] = String(dateStr).slice(0,10).split('-');
                            const map = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            const mm = parseInt(m, 10);
                            if (!mm || mm < 1 || mm > 12) return null;
                            return `${map[mm-1]}-${y.slice(-2)}`;
                        };
                        actualsRows.forEach(r => {
                            const mon = toMonthStr(r.period_date);
                            if (!mon || nsData.forecastStatus[mon] !== 'Actual') return;
                            for (let i=1;i<=7;i++) {
                                const val = parseInt(r[`ns_pg${i}_headcount`] || 0, 10);
                                if (!Number.isNaN(val)) nsData.pgLevels[`PG${i}`][mon] = val;
                            }
                        });
                    }

                    // 2) Forecast rows (override forecast months only)
                    const rows = await API.nonSales.getTeam(
                        AppState.currentTeam,
                        AppState.currentVersion?.version_id
                    );
                    if (Array.isArray(rows) && rows.length) {
                        // Helper to convert 'YYYY-MM-01' -> 'Mon-YY'
                        const toMonthStr = (dateStr) => {
                            if (!dateStr) return null;
                            const [y, m] = dateStr.split('-');
                            const map = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            const mm = parseInt(m, 10);
                            if (!mm || mm < 1 || mm > 12) return null;
                            return `${map[mm-1]}-${y.slice(-2)}`;
                        };
                        rows.forEach(r => {
                            const mon = toMonthStr(String(r.period_date).slice(0,10));
                            if (!mon || nsData.forecastStatus[mon] !== 'Forecast') return;
                            // Fill each ns_pgX_headcount field if present
                            for (let i=1;i<=7;i++) {
                                const key = `ns_pg${i}_headcount`;
                                if (r.hasOwnProperty(key)) {
                                    const val = parseInt(r[key] || 0, 10);
                                    if (!Number.isNaN(val)) {
                                        const pg = `PG${i}`;
                                        if (!nsData.pgLevels[pg]) nsData.pgLevels[pg] = {};
                                        nsData.pgLevels[pg][mon] = val;
                                    }
                                }
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Non-sales fetch failed; using defaults', e);
                }
                if (salesContainer) salesContainer.style.display = 'none';
                if (nsContainer) nsContainer.style.display = '';
                renderHeadcountTab(nsData, { containerId: 'non-sales-headcount-subtab', mode: 'non-sales' });
            }
            break;
        case 'production':
            // Hide headcount subtabs when other main tabs are active
            const hcSubtabs = document.getElementById('headcount-subtabs');
            if (hcSubtabs) hcSubtabs.style.display = 'none';

            // Ensure production subtabs are visible
            const pSub = document.getElementById('production-subtabs');
            if (pSub) pSub.style.display = 'flex';

            const invC = document.getElementById('production-investments-subtab');
            const bankC = document.getElementById('production-banking-subtab');
            if (AppState.productionSubtab === 'investments') {
                if (invC) invC.style.display = '';
                if (bankC) bankC.style.display = 'none';
                renderProductionTab(data, { containerId: 'production-investments-subtab', mode: 'investments' });
                setTimeout(validateAllProductMix, 100);
            } else {
                if (invC) invC.style.display = 'none';
                if (bankC) bankC.style.display = '';
                renderProductionTab(data, { containerId: 'production-banking-subtab', mode: 'banking' });
            }
            break;
        case 'referrals':
            const hcSubtabs2 = document.getElementById('headcount-subtabs');
            if (hcSubtabs2) hcSubtabs2.style.display = 'none';
            renderReferralsTab(data);
            break;
        case 'incentive':
            const hcSubtabs3 = document.getElementById('headcount-subtabs');
            if (hcSubtabs3) hcSubtabs3.style.display = 'none';
            renderIncentiveTab(data);
            break;
        case 'kmpc':
            const hcSubtabs4 = document.getElementById('headcount-subtabs');
            if (hcSubtabs4) hcSubtabs4.style.display = 'none';
            renderKMPCTab(data);
            break;
        case 'finance':
            const hcSubtabs5 = document.getElementById('headcount-subtabs');
            if (hcSubtabs5) hcSubtabs5.style.display = 'none';
            renderFinanceTab(data);
            break;
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const tabName = AppState.currentTab;
            const savedPosition = AppState.scrollPositions[tabName];
            const wrapper = document.querySelector(`#${tabName}-tab .data-table-wrapper`);
            if (!wrapper) return;
            if (tabName === 'incentive') {
                // For Incentive, always restore saved position (including 0) to avoid jump
                if (savedPosition !== undefined) {
                    wrapper.scrollLeft = savedPosition;
                }
            } else {
                if (savedPosition !== undefined && savedPosition !== 0) {
                    wrapper.scrollLeft = savedPosition;
                } else {
                    scrollToJan2024();
                }
            }
        });
    });
}

// Handle headcount changes
async function handleHeadcountChange(input) {
    const month = input.dataset.month;
    const pg = input.dataset.pg;
    const team = input.dataset.team;
    const raw = (input.value || '').trim();
    if (raw === '' || raw === '-') {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');
    const value = parseInt(raw, 10) || 0;
    
    // Save for undo
    const teamKey = `Team ${team}`;
    const previousValue = AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month];
    
    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        AppState.undoStack.push({
            type: 'headcountChange',
            data: { team, pg, month, previousValue, newValue: value },
            context: { tab: 'headcount', subtab: 'sales' }
        });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }
    
    // Update local data
    AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month] = value;
    
    // Update displays
    updateHeadcountTotals(team, month);
    updateProductionCalculations(team, month);
    
    // Update database (skip when bulk pasting; handled by bulkUpdate)
    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
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
}

// Handle production changes
async function handleProductionChange(input) {
    const month = input.dataset.month;
    const team = input.dataset.team;
    const metric = input.dataset.metric;
    const product = input.dataset.product;
    const rawIn = (input.value || '').trim();
    if (rawIn === '' || rawIn === '-') {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');
    let value = parseFloat(rawIn.replace(/,/g, '')) || 0;
    
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
    if (!AppState.isBulkPasting) {
        AppState.undoStack.push({
            type: 'productionChange',
            data: { 
                team, 
                month, 
                metric, 
                product, 
                previousValue, 
                newValue: value 
            },
            context: { tab: 'production', subtab: 'investments' }
        });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }
    
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
    
    // Update database (skip when bulk pasting; handled by bulkUpdate)
    if (!AppState.isBulkPasting) {
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
}

// Handle additional product changes
async function handleAdditionalProductChange(input) {
    const month = input.dataset.month;
    const product = input.dataset.product;
    const metric = input.dataset.metric;
    const team = input.dataset.team;
    const rawIn = (input.value || '').trim();
    if (rawIn === '' || rawIn === '-') {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');
    let value = parseFloat(rawIn.replace(/,/g, '')) || 0;
    
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
    
    if (!AppState.isBulkPasting) {
        AppState.undoStack.push({
            type: 'additionalProductChange',
            data: { team, month, product, metric, previousValue, newValue: value },
            context: { tab: 'production', subtab: 'banking' }
        });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }
    
    // Update calculations
    updateAdditionalProductCalculations(team, month, product);
    
    // Determine database field
    const fieldName = metric === 'additional-productivity' 
        ? `product_${product.toLowerCase()}_productivity`
        : `product_${product.toLowerCase()}_abpa`;
    
    // Update database (skip when bulk pasting; handled by bulkUpdate)
    if (!AppState.isBulkPasting) {
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
}

// Recompute Additional Product derived cells for a given month/product
function updateAdditionalProductCalculations(team, month, product) {
    const teamKey = `Team ${team}`;
    const data = AppState.teamData[AppState.currentForecast][teamKey];
    if (!data) return;

    // Sum headcount
    const headcount = PG_LEVELS.reduce((sum, pg) => sum + (parseInt(data.pgLevels[pg]?.[month] || 0)), 0);
    // Business days for the month
    const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
    const idx = months.indexOf(month);
    const businessDays = window.BUSINESS_DAYS?.[idx] || 21;

    // Current inputs
    const weeklyProd = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
    const abpa = parseFloat(data.additionalProducts?.[product]?.abpa?.[month] || 0);

    // Calculations mirror render-tables.js
    const accounts = Math.round((headcount * weeklyProd * businessDays) / 5);
    const balance = accounts * abpa;

    // Update UI cells if present
    const accCell = document.getElementById(`additional-accounts-${product}-${month}`);
    if (accCell) accCell.textContent = (accounts).toLocaleString();
    const balCell = document.getElementById(`additional-balance-${product}-${month}`);
    if (balCell) balCell.textContent = `$${(balance / 1_000_000).toFixed(1)}M`;
}

// Undo functionality
function undo() {
    if (AppState.undoStack.length === 0) return;
    
    // Save current scroll position
    const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    const currentScroll = currentWrapper ? currentWrapper.scrollLeft : 0;
    
    const action = AppState.undoStack.pop();

    // Navigate to originating tab/subtab if different
    const ctx = action.context || (action.type === 'headcountChange' || action.type === 'nonSalesHeadcountChange' ? { tab: 'headcount', subtab: (action.type === 'nonSalesHeadcountChange' ? 'non-sales' : 'sales') } : { tab: 'production', subtab: (action.type === 'additionalProductChange' ? 'banking' : 'investments') });
    if (ctx && (AppState.currentTab !== ctx.tab || (ctx.tab === 'headcount' && AppState.headcountSubtab !== ctx.subtab) || (ctx.tab === 'production' && AppState.productionSubtab !== ctx.subtab))) {
        // Switch main tab
        if (AppState.currentTab !== ctx.tab) {
            switchTab(ctx.tab);
        }
        // Switch subtab
        if (ctx.tab === 'headcount' && AppState.headcountSubtab !== ctx.subtab) {
            switchHeadcountSubtab(ctx.subtab);
        } else if (ctx.tab === 'production' && AppState.productionSubtab !== ctx.subtab) {
            switchProductionSubtab(ctx.subtab);
        }
    }
    AppState.redoStack.push(action);
    
    // Apply undo based on action type
    if (action.type === 'headcountChange') {
        const { team, pg, month, previousValue } = action.data;
        AppState.teamData[AppState.currentForecast][`Team ${team}`].pgLevels[pg][month] = previousValue;
        const setValUndo = () => {
            const containerId = AppState.headcountSubtab === 'non-sales' ? 'non-sales-headcount-subtab' : 'sales-headcount-subtab';
            const input = document.querySelector(`#${containerId} input[data-month="${month}"][data-pg="${pg}"][data-team="${team}"]`);
            if (input) input.value = parseInt(previousValue) || 0;
            updateHeadcountTotals(team, month);
            updateProductionCalculations(team, month);
        };
        requestAnimationFrame(() => { renderCurrentTab(); requestAnimationFrame(setValUndo); });
    } else if (action.type === 'nonSalesHeadcountChange') {
        const { team, pg, month, previousValue } = action.data;
        const teamKey = `Team ${team}`;
        const nsData = AppState.nonSalesData?.[AppState.currentForecast]?.[teamKey];
        if (nsData) {
            nsData.pgLevels[pg][month] = parseInt(previousValue) || 0;
            // Update total cell for the month
            const totalCell = document.getElementById(`ns-headcount-total-${month}`);
            if (totalCell) {
                const total = PG_LEVELS.reduce((sum, level) => sum + (nsData.pgLevels[level][month] || 0), 0);
                totalCell.textContent = total;
            }
        }
        requestAnimationFrame(() => {
            renderCurrentTab();
            requestAnimationFrame(() => {
                const nsContainerId = 'non-sales-headcount-subtab';
                const input = document.querySelector(`#${nsContainerId} input[data-month="${month}"][data-pg="${pg}"][data-team="${team}"]`);
                if (input) input.value = parseInt(previousValue) || 0;
                const totalCell = document.getElementById(`ns-headcount-total-${month}`);
                if (totalCell) {
                    const total = PG_LEVELS.reduce((sum, level) => sum + ((AppState.nonSalesData?.[AppState.currentForecast]?.[`Team ${team}`]?.pgLevels[level][month]) || 0), 0);
                    totalCell.textContent = total;
                }
            });
        });
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
    } else if (action.type === 'bulkPaste') {
        // Revert all pasted changes
        action.data.forEach(state => {
            const teamKey = `Team ${state.team}`;
            const month = state.month;
            const metric = state.metric;
            const product = state.product;
            const pg = state.pg;
            const previousValue = state.previousValue;

            if (metric === 'headcount') {
                AppState.teamData[AppState.currentForecast][`Team ${state.team}`].pgLevels[pg][month] = parseInt(previousValue) || 0;
                updateHeadcountTotals(state.team, month);
                updateProductionCalculations(state.team, month);
                const input = document.querySelector(`input[data-month="${month}"][data-pg="${pg}"][data-team="${state.team}"]`);
                if (input) input.value = parseInt(previousValue) || 0;
            } else if (metric === 'productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month="${month}"][data-metric="productivity"][data-team="${state.team}"]`);
                if (input) input.value = parseFloat(previousValue).toFixed(2);
                updateProductionCalculations(state.team, month);
            } else if (metric === 'mix') {
                AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = (parseFloat(previousValue) || 0) / 100;
                const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="mix"][data-team="${state.team}"]`);
                if (input) input.value = parseFloat(previousValue) || 0;
                updateProductionCalculations(state.team, month);
            } else if (metric === 'abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = parseFloat(previousValue) || 0;
                const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="abpa"][data-team="${state.team}"]`);
                if (input) input.value = formatNumber(previousValue || 0);
                updateProductionCalculations(state.team, month);
            } else if (metric === 'additional-productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].productivity[month] = parseFloat(previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-productivity"][data-team="${state.team}"]`);
                if (input) input.value = parseFloat(previousValue).toFixed(2);
                updateAdditionalProductCalculations(state.team, month, product);
            } else if (metric === 'additional-abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].abpa[month] = parseFloat(previousValue) || 0;
                const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-abpa"][data-team="${state.team}"]`);
                if (input) input.value = formatNumber(previousValue || 0);
                updateAdditionalProductCalculations(state.team, month, product);
            }
        });
    }
    
    // Persist undo to DB in bulk
    try {
        const updates = [];
        if (action.type === 'headcountChange') {
            const { team, pg, month, previousValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState('headcount', null, pg, previousValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'productionChange') {
            const { team, month, metric, product, previousValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, previousValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'additionalProductChange') {
            const { team, month, product, metric, previousValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, previousValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'percentageChange' || action.type === 'bulkPaste') {
            const states = action.data || [];
            states.forEach(state => {
                const { fieldName, dbValue } = getFieldAndDbValueFromState(state.metric, state.product, state.pg, state.previousValue);
                updates.push({ teamId: parseInt(state.team), periodDate: getPeriodDate(state.month), field: fieldName, newValue: dbValue });
            });
        }
        if (updates.length > 0) {
            const showBusy = updates.length > 50;
            if (showBusy) showLoadingIndicator('Updating...');
            API.forecasts.bulkUpdate({
                updates,
                versionId: AppState.currentVersion.version_id,
                updatedBy: AppState.currentUser
            }).then(() => {
                if (showBusy) hideLoadingIndicator();
            }).catch(err => {
                console.error('Failed to persist undo:', err);
                if (showBusy) hideLoadingIndicator();
            });
        }
    } catch (e) {
        console.warn('Undo DB sync skipped due to error:', e);
    }
    
    // Persist redo to DB in bulk
    try {
        const updates = [];
        if (action.type === 'headcountChange') {
            const { team, pg, month, newValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState('headcount', null, pg, newValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'productionChange') {
            const { team, month, metric, product, newValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, newValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'additionalProductChange') {
            const { team, month, product, metric, newValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, newValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'percentageChange' || action.type === 'bulkPaste') {
            const states = action.data || [];
            states.forEach(state => {
                const { fieldName, dbValue } = getFieldAndDbValueFromState(state.metric, state.product, state.pg, state.newValue);
                updates.push({ teamId: parseInt(state.team), periodDate: getPeriodDate(state.month), field: fieldName, newValue: dbValue });
            });
        }
        if (updates.length > 0) {
            const showBusy = updates.length > 50;
            if (showBusy) showLoadingIndicator('Updating...');
            API.forecasts.bulkUpdate({
                updates,
                versionId: AppState.currentVersion.version_id,
                updatedBy: AppState.currentUser
            }).then(() => {
                if (showBusy) hideLoadingIndicator();
            }).catch(err => {
                console.error('Failed to persist redo:', err);
                if (showBusy) hideLoadingIndicator();
            });
        }
    } catch (e) {
        console.warn('Redo DB sync skipped due to error:', e);
    }

    updateUndoRedoButtons();
    
    // Restore scroll position
    requestAnimationFrame(() => {
        const wrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
        if (wrapper) {
            wrapper.scrollLeft = currentScroll;
        }
    });
    updateUndoRedoButtons();
}

// Redo functionality
// Redo functionality (single source of truth)
function redo() {
  if (AppState.redoStack.length === 0) return;

  // Save current scroll position
  const currentWrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
  const currentScroll = currentWrapper ? currentWrapper.scrollLeft : 0;

  const action = AppState.redoStack.pop();

  // Navigate back to the originating tab/subtab if needed
  const ctx = action.context ||
    ((action.type === 'headcountChange' || action.type === 'nonSalesHeadcountChange')
      ? { tab: 'headcount', subtab: (action.type === 'nonSalesHeadcountChange' ? 'non-sales' : 'sales') }
      : { tab: 'production', subtab: (action.type === 'additionalProductChange' ? 'banking' : 'investments') });

  if (ctx && (AppState.currentTab !== ctx.tab ||
             (ctx.tab === 'headcount' && AppState.headcountSubtab !== ctx.subtab) ||
             (ctx.tab === 'production' && AppState.productionSubtab !== ctx.subtab))) {
    if (AppState.currentTab !== ctx.tab) switchTab(ctx.tab);
    if (ctx.tab === 'headcount' && AppState.headcountSubtab !== ctx.subtab) {
      switchHeadcountSubtab(ctx.subtab);
    } else if (ctx.tab === 'production' && AppState.productionSubtab !== ctx.subtab) {
      switchProductionSubtab(ctx.subtab);
    }
  }

  // Push onto undo history
  AppState.undoStack.push(action);

  // Helper: persist a batch at the end
  const bulk = [];

  // Apply redo
  if (action.type === 'headcountChange') {
    const { team, pg, month, newValue } = action.data;
    const teamKey = `Team ${team}`;
    AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month] = parseInt(newValue) || 0;

    // Ensure correct subtab DOM exists, then set input value and fire 'change'
    const applyCell = () => {
      const containerId = (AppState.headcountSubtab === 'non-sales' ? 'non-sales-headcount-subtab' : 'sales-headcount-subtab');
      const input = document.querySelector(`#${containerId} input[data-month="${month}"][data-pg="${pg}"][data-team="${team}"]`);
      if (input) {
        AppState.isProgrammaticChange = true;
        input.value = parseInt(newValue) || 0;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        AppState.isProgrammaticChange = false;
      }
      updateHeadcountTotals(team, month);
      updateProductionCalculations(team, month);
    };

    // Re-render sales subtab if needed so the selector finds the fresh input
    requestAnimationFrame(() => {
      if (AppState.headcountSubtab === 'sales' && typeof renderHeadcountTab === 'function') {
        const td = AppState.teamData[AppState.currentForecast][teamKey];
        renderHeadcountTab(td, { containerId: 'sales-headcount-subtab', mode: 'sales' });
      } else {
        renderCurrentTab();
      }
      requestAnimationFrame(applyCell);
    });

    // Persist this single-cell redo (shows up in Network)
    bulk.push({
      teamId: parseInt(team),
      periodDate: getPeriodDate(month),
      field: `pg${pg.substring(2)}_headcount`,
      newValue: parseInt(newValue) || 0
    });

  } else if (action.type === 'nonSalesHeadcountChange') {
    const { team, pg, month, newValue } = action.data;
    const teamKey = `Team ${team}`;
    const nsData = AppState.nonSalesData?.[AppState.currentForecast]?.[teamKey];
    if (nsData) {
      nsData.pgLevels[pg][month] = parseInt(newValue) || 0;
      const totalCell = document.getElementById(`ns-headcount-total-${month}`);
      if (totalCell) {
        const total = PG_LEVELS.reduce((s, lvl) => s + (nsData.pgLevels[lvl][month] || 0), 0);
        totalCell.textContent = total;
      }
    }
    // Update input + change (without creating new undo)
    const nsContainerId = 'non-sales-headcount-subtab';
    const setNs = () => {
      const input = document.querySelector(`#${nsContainerId} input[data-month="${month}"][data-pg="${pg}"][data-team="${team}"]`);
      if (input) {
        AppState.isProgrammaticChange = true;
        input.value = parseInt(newValue) || 0;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        AppState.isProgrammaticChange = false;
      }
    };
    setNs();
    requestAnimationFrame(() => requestAnimationFrame(setNs));

    // Persist to non-sales endpoint
    bulk.push({
      teamId: parseInt(team),
      periodDate: getPeriodDate(month),
      field: `ns_pg${pg.substring(2)}_headcount`,
      newValue: parseInt(newValue) || 0,
      _ns: true
    });

  } else if (action.type === 'productionChange') {
    const { team, month, metric, product, newValue } = action.data;
    const teamKey = `Team ${team}`;
    let fieldName, dbValue = newValue;

    if (metric === 'productivity') {
      AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(newValue).toFixed(2);
      const input = document.querySelector(`input[data-month="${month}"][data-metric="productivity"][data-team="${team}"]`);
      if (input) input.value = parseFloat(newValue).toFixed(2);
      fieldName = 'productivity';
    } else if (metric === 'mix') {
      AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = newValue / 100;
      const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="mix"][data-team="${team}"]`);
      if (input) input.value = newValue;
      const letter = product.split(' ')[1].toLowerCase();
      fieldName = `product_${letter}_mix`;
      dbValue = newValue / 100; // store as decimal
    } else if (metric === 'abpa') {
      AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = newValue;
      const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="abpa"][data-team="${team}"]`);
      if (input) input.value = formatNumber(newValue);
      const letter = product.split(' ')[1].toLowerCase();
      fieldName = `product_${letter}_abpa`;
    }

    updateProductionCalculations(team, month);
    bulk.push({
      teamId: parseInt(team),
      periodDate: getPeriodDate(month),
      field: fieldName,
      newValue: dbValue
    });

  } else if (action.type === 'additionalProductChange') {
    const { team, month, product, metric, newValue } = action.data;
    const teamKey = `Team ${team}`;
    let fieldName;

    if (metric === 'additional-productivity') {
      AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].productivity[month] = parseFloat(newValue).toFixed(2);
      const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-productivity"][data-team="${team}"]`);
      if (input) input.value = parseFloat(newValue).toFixed(2);
      fieldName = `product_${product.toLowerCase()}_productivity`;
    } else if (metric === 'additional-abpa') {
      AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].abpa[month] = parseInt(newValue);
      const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-abpa"][data-team="${team}"]`);
      if (input) input.value = formatNumber(newValue);
      fieldName = `product_${product.toLowerCase()}_abpa`;
    }

    updateAdditionalProductCalculations(team, month, product);
    bulk.push({
      teamId: parseInt(team),
      periodDate: getPeriodDate(month),
      field: fieldName,
      newValue: newValue
    });

  } else if (action.type === 'percentageChange' || action.type === 'bulkPaste') {
    // Re-apply all pasted/percentage changes and persist once
    (action.data || []).forEach(state => {
      const teamKey = `Team ${state.team}`;
      const month = state.month;
      const metric = state.metric;
      const product = state.product;
      const pg = state.pg;
      const val = state.newValue;

      if (metric === 'headcount') {
        AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month] = parseInt(val) || 0;
        const input = document.querySelector(`input[data-month="${month}"][data-pg="${pg}"][data-team="${state.team}"]`);
        if (input) input.value = parseInt(val) || 0;
        updateHeadcountTotals(state.team, month);
        updateProductionCalculations(state.team, month);
      } else if (metric === 'productivity') {
        AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(val).toFixed(2);
        const input = document.querySelector(`input[data-month="${month}"][data-metric="productivity"][data-team="${state.team}"]`);
        if (input) input.value = parseFloat(val).toFixed(2);
        updateProductionCalculations(state.team, month);
      } else if (metric === 'mix') {
        AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = (parseFloat(val) || 0) / 100;
        const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="mix"][data-team="${state.team}"]`);
        if (input) input.value = parseFloat(val) || 0;
        updateProductionCalculations(state.team, month);
      } else if (metric === 'abpa') {
        AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = parseFloat(val) || 0;
        const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="abpa"][data-team="${state.team}"]`);
        if (input) input.value = formatNumber(val || 0);
        updateProductionCalculations(state.team, month);
      } else if (metric === 'additional-productivity') {
        AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].productivity[month] = parseFloat(val).toFixed(2);
        const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-productivity"][data-team="${state.team}"]`);
        if (input) input.value = parseFloat(val).toFixed(2);
        updateAdditionalProductCalculations(state.team, month, product);
      } else if (metric === 'additional-abpa') {
        AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].abpa[month] = parseFloat(val) || 0;
        const input = document.querySelector(`input[data-month="${month}"][data-product="${product}"][data-metric="additional-abpa"][data-team="${state.team}"]`);
        if (input) input.value = formatNumber(val || 0);
        updateAdditionalProductCalculations(state.team, month, product);
      }

      // Build bulk persist field names/values
      const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, pg, val);
      bulk.push({
        teamId: parseInt(state.team),
        periodDate: getPeriodDate(month),
        field: fieldName,
        newValue: dbValue
      });
    });
  }

  // Persist (split non-sales rows if present)
  if (bulk.length > 0) {
    const nsRows = bulk.filter(u => u._ns);
    const fcRows = bulk.filter(u => !u._ns).map(({ _ns, ...r }) => r);

    const showBusy = bulk.length > 50;
    if (showBusy) showLoadingIndicator('Updating...');

    const promises = [];
    if (fcRows.length) {
      promises.push(API.forecasts.bulkUpdate({
        updates: fcRows,
        versionId: AppState.currentVersion.version_id,
        updatedBy: AppState.currentUser
      }));
    }
    if (nsRows.length) {
      // non-sales endpoint might not support bulk; fall back to individual calls
      promises.push(Promise.all(nsRows.map(u => API.nonSales.updateData({
        teamId: u.teamId,
        periodDate: u.periodDate,
        versionId: AppState.currentVersion.version_id,
        field: u.field,
        value: u.newValue,
        updatedBy: AppState.currentUser
      }))));
    }

    Promise.all(promises).then(() => {
      if (showBusy) hideLoadingIndicator();
      try { showSaveIndicator(); } catch {}
    }).catch(err => {
      console.error('Failed to persist redo:', err);
      if (showBusy) hideLoadingIndicator();
    });
  }

  updateUndoRedoButtons();

  // Restore horizontal scroll
  requestAnimationFrame(() => {
    const wrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (wrapper) wrapper.scrollLeft = currentScroll;
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
        data: previousState,
        context: { tab: AppState.currentTab, subtab: (AppState.currentTab === 'headcount' ? AppState.headcountSubtab : AppState.productionSubtab) }
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

// Scroll to Jan-24 column in current tab's table
function scrollToJan2024() {
    const wrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (!wrapper) return;

    const table = wrapper.querySelector('table');
    if (!table) return;

    const headers = table.querySelectorAll('thead tr:last-child th');
    let jan24Index = -1;

    for (let i = 0; i < headers.length; i++) {
        if (headers[i].textContent.trim() === 'Jan-24') {
            jan24Index = i;
            break;
        }
    }

    if (jan24Index > 0) {
        const targetElement = headers[jan24Index];
        const firstColumn = headers[0];
        const firstColumnWidth = firstColumn.offsetWidth;
        const elementLeft = targetElement.offsetLeft;
        const scrollLeft = Math.max(0, elementLeft - firstColumnWidth - 116);
        wrapper.scrollLeft = scrollLeft;
        AppState.scrollPositions[AppState.currentTab] = scrollLeft;
    }
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

// Switch Sales/Non-Sales mini-tab
function switchHeadcountSubtab(which) {
    if (which !== 'sales' && which !== 'non-sales') return;
    // Save current before switching
    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[getScrollKeyForState('headcount')] = currentWrapper.scrollLeft;
    }
    AppState.headcountSubtab = which;
    // Toggle active state on buttons
    const salesBtn = document.getElementById('subtab-sales');
    const nsBtn = document.getElementById('subtab-non-sales');
    if (salesBtn && nsBtn) {
        salesBtn.classList.toggle('active', which === 'sales');
        nsBtn.classList.toggle('active', which === 'non-sales');
    }
    // Toggle content visibility
    const salesC = document.getElementById('sales-headcount-subtab');
    const nsC = document.getElementById('non-sales-headcount-subtab');
    if (salesC && nsC) {
        salesC.style.display = which === 'sales' ? '' : 'none';
        nsC.style.display = which === 'non-sales' ? '' : 'none';
    }
    // Re-render the tab's content to match selection
    if (AppState.currentTab === 'headcount') {
        renderCurrentTab();
        // Restore after render
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const wrapper = getActiveWrapper();
                const key = getScrollKeyForState('headcount');
                if (wrapper && AppState.scrollPositions[key] !== undefined) {
                    wrapper.scrollLeft = AppState.scrollPositions[key];
                }
            });
        });
    }
}

// Switch Production Investments/Banking mini-tab
function switchProductionSubtab(which) {
    if (which !== 'investments' && which !== 'banking') return;
    // Save current before switching
    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[getScrollKeyForState('production')] = currentWrapper.scrollLeft;
    }
    AppState.productionSubtab = which;
    const invBtn = document.getElementById('prod-subtab-investments');
    const bankBtn = document.getElementById('prod-subtab-banking');
    if (invBtn && bankBtn) {
        invBtn.classList.toggle('active', which === 'investments');
        bankBtn.classList.toggle('active', which === 'banking');
    }
    const invC = document.getElementById('production-investments-subtab');
    const bankC = document.getElementById('production-banking-subtab');
    if (invC && bankC) {
        invC.style.display = which === 'investments' ? '' : 'none';
        bankC.style.display = which === 'banking' ? '' : 'none';
    }
    if (AppState.currentTab === 'production') {
        renderCurrentTab();
        // Restore after render
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const wrapper = getActiveWrapper();
                const key = getScrollKeyForState('production');
                if (wrapper && AppState.scrollPositions[key] !== undefined) {
                    wrapper.scrollLeft = AppState.scrollPositions[key];
                }
            });
        });
    }
}

// Handle Non-Sales headcount changes (no cross-tab effects)
async function handleNonSalesHeadcountChange(input) {
    const month = input.dataset.month;
    const pg = input.dataset.pg;
    const team = input.dataset.team;
    const raw = (input.value || '').trim();
    if (raw === '' || raw === '-') {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');
    const value = parseInt(raw, 10) || 0;

    const teamKey = `Team ${team}`;
    if (!AppState.nonSalesData[AppState.currentForecast]) {
        AppState.nonSalesData[AppState.currentForecast] = {};
    }
    if (!AppState.nonSalesData[AppState.currentForecast][teamKey]) {
        const months = generateMonthList();
        const ns = { forecastStatus: {}, pgLevels: {} };
        // Mirror current team's forecast status if available
        const base = AppState.teamData[AppState.currentForecast]?.[teamKey];
        ns.forecastStatus = base ? { ...base.forecastStatus } : {};
        PG_LEVELS.forEach(p => { ns.pgLevels[p] = {}; months.forEach(m => ns.pgLevels[p][m] = 0); });
        AppState.nonSalesData[AppState.currentForecast][teamKey] = ns;
    }

    const nsData = AppState.nonSalesData[AppState.currentForecast][teamKey];
    const previousValue = nsData.pgLevels[pg][month];

    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        AppState.undoStack.push({
            type: 'nonSalesHeadcountChange',
            data: { team, pg, month, previousValue, newValue: value },
            context: { tab: 'headcount', subtab: 'non-sales' }
        });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }
    
    // Update local non-sales data only
    nsData.pgLevels[pg][month] = value;

    // Update total in the non-sales table
    try {
        const totalCell = document.getElementById(`ns-headcount-total-${month}`);
        if (totalCell) {
            const total = PG_LEVELS.reduce((sum, level) => sum + (nsData.pgLevels[level][month] || 0), 0);
            totalCell.textContent = total;
        }
    } catch {}

    // Persist to backend table for non-sales headcount
    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        try {
            const fieldName = `ns_pg${pg.substring(2)}_headcount`;
            await API.nonSales.updateData({
                teamId: parseInt(team),
                periodDate: getPeriodDate(month),
                versionId: AppState.currentVersion.version_id,
                field: fieldName,
                value: value,
                updatedBy: AppState.currentUser
            });
            showSaveIndicator();
        } catch (error) {
            console.error('Failed to save non-sales change:', error);
            showError('Failed to save change');
        }
    }
}
