// public/js/main.js - Main application logic

// Global state
const AppState = {
    currentTeam: 1,
    currentGroup: null,
    isGroupView: false,
    isBulkPasting: false,
    isProgrammaticChange: false,
    teamCategory: 'sales', // 'sales' | 'non-sales'
    headcountSubtab: 'sales', // 'sales' | 'non-sales'
    productionSubtab: 'investments', // 'investments' | 'banking'
    currentTab: 'headcount',
    currentForecast: null,
    currentVersion: null,
    lastSelectedTeams: { sales: 1, nonSales: 9201 },
    lastSelectedGroups: { nonSales: null },
    currentNonSalesGroup: null,
    currentNonSalesTeam: null,
    nonSalesLoadStatus: {},
    teams: [],
    forecastVersions: [],
    calendarPeriods: [],
    teamData: {},
    nonSalesData: {}, // { [versionKey]: { [groupKey]: { forecastStatus, teams, teamOrder } } }
    selectedInputs: [],
    undoStack: [],
    redoStack: [],
    productionBaselineState: {},
    productionConfig: null,
    referralBaselineState: {},
    referralConfig: null,
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
    currentUser: 'testuser@test.com', // Use email format
    isAdmin: false,
    isSaveLockInProgress: false
};

// Constants
const PG_LEVELS = ['PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'PG6', 'PG7'];
const PRODUCTS = ['Product A', 'Product B', 'Product C', 'Product D'];
const ADDITIONAL_PRODUCTS = ['AA', 'BB', 'CC', 'DD', 'EE'];
const FLOW_VALUE_KEYS = ['flow_1', 'flow_2', 'flow_3', 'flow_4', 'flow_5'];
const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SELF_DIRECTED_PRODUCT_NAME = PRODUCTS[0];
const MGIA_PRODUCT_NAME = PRODUCTS[2];
const SAVE_AND_LOCK_CONFIRMATION = 'SAVE AND LOCK FORECAST';
let GROUPS = {}; // Will be populated from API
window.GROUPS = GROUPS;

const NON_SALES_GROUPS = [
    {
        key: 'operations',
        displayName: 'Operations',
        teams: [
            { team_id: 9201, team_name: 'Team 1', group_name: 'operations', group_display_name: 'Operations', team_category: 'non-sales' },
            { team_id: 9202, team_name: 'Team 2', group_name: 'operations', group_display_name: 'Operations', team_category: 'non-sales' },
            { team_id: 9203, team_name: 'Team 3', group_name: 'operations', group_display_name: 'Operations', team_category: 'non-sales' },
            { team_id: 9204, team_name: 'Team 4', group_name: 'operations', group_display_name: 'Operations', team_category: 'non-sales' }
        ]
    },
    {
        key: 'management',
        displayName: 'Management',
        teams: [
            { team_id: 9211, team_name: 'Team 1', group_name: 'management', group_display_name: 'Management', team_category: 'non-sales' },
            { team_id: 9212, team_name: 'Team 2', group_name: 'management', group_display_name: 'Management', team_category: 'non-sales' },
            { team_id: 9213, team_name: 'Team 3', group_name: 'management', group_display_name: 'Management', team_category: 'non-sales' },
            { team_id: 9214, team_name: 'Team 4', group_name: 'management', group_display_name: 'Management', team_category: 'non-sales' }
        ]
    },
    {
        key: 'real-estate',
        displayName: 'Real Estate',
        teams: [
            { team_id: 9231, team_name: 'Team 1', group_name: 'real-estate', group_display_name: 'Real Estate', team_category: 'non-sales' },
            { team_id: 9232, team_name: 'Team 2', group_name: 'real-estate', group_display_name: 'Real Estate', team_category: 'non-sales' },
            { team_id: 9233, team_name: 'Team 3', group_name: 'real-estate', group_display_name: 'Real Estate', team_category: 'non-sales' },
            { team_id: 9234, team_name: 'Team 4', group_name: 'real-estate', group_display_name: 'Real Estate', team_category: 'non-sales' }
        ]
    },
    {
        key: 'hr',
        displayName: 'HR',
        teams: [
            { team_id: 9221, team_name: 'Team 1', group_name: 'hr', group_display_name: 'HR', team_category: 'non-sales' },
            { team_id: 9222, team_name: 'Team 2', group_name: 'hr', group_display_name: 'HR', team_category: 'non-sales' },
            { team_id: 9223, team_name: 'Team 3', group_name: 'hr', group_display_name: 'HR', team_category: 'non-sales' },
            { team_id: 9224, team_name: 'Team 4', group_name: 'hr', group_display_name: 'HR', team_category: 'non-sales' }
        ]
    }
];

const NON_SALES_TEAMS = NON_SALES_GROUPS.flatMap(group => group.teams);

if (!AppState.lastSelectedGroups || typeof AppState.lastSelectedGroups !== 'object') {
    AppState.lastSelectedGroups = { nonSales: null };
}
if (!AppState.lastSelectedGroups.nonSales) {
    AppState.lastSelectedGroups.nonSales = NON_SALES_GROUPS.length ? NON_SALES_GROUPS[0].key : null;
}
AppState.currentNonSalesGroup = AppState.currentNonSalesGroup || AppState.lastSelectedGroups.nonSales;

if (!AppState.lastSelectedTeams || typeof AppState.lastSelectedTeams !== 'object') {
    AppState.lastSelectedTeams = { sales: AppState.currentTeam || 1, nonSales: NON_SALES_TEAMS[0]?.team_id || null };
}
if (!AppState.lastSelectedTeams.nonSales && NON_SALES_TEAMS.length) {
    AppState.lastSelectedTeams.nonSales = NON_SALES_TEAMS[0].team_id;
}
AppState.currentNonSalesTeam = AppState.currentNonSalesTeam || AppState.lastSelectedTeams.nonSales || null;

if (!AppState.lastSelectedGroups || typeof AppState.lastSelectedGroups !== 'object') {
    AppState.lastSelectedGroups = { nonSales: null };
}
if (!AppState.lastSelectedGroups.nonSales) {
    AppState.lastSelectedGroups.nonSales = NON_SALES_GROUPS.length ? NON_SALES_GROUPS[0].key : null;
}
AppState.currentNonSalesGroup = AppState.currentNonSalesGroup || AppState.lastSelectedGroups.nonSales;

if (!AppState.lastSelectedTeams || typeof AppState.lastSelectedTeams !== 'object') {
    AppState.lastSelectedTeams = { sales: AppState.currentTeam || 1, nonSales: NON_SALES_TEAMS[0]?.team_id || null };
}
if (!AppState.lastSelectedTeams.nonSales && NON_SALES_TEAMS.length) {
    AppState.lastSelectedTeams.nonSales = NON_SALES_TEAMS[0].team_id;
}
AppState.currentNonSalesTeam = AppState.currentNonSalesTeam || AppState.lastSelectedTeams.nonSales || null;

window.AppState = AppState;
window.NON_SALES_GROUPS = NON_SALES_GROUPS;
window.NON_SALES_TEAMS = NON_SALES_TEAMS;
window.GROUPS = GROUPS;

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


function openProductionAdminModal(versionId) {
    const modal = document.getElementById('productionAdminModal');
    const frame = document.getElementById('productionAdminFrame');
    if (!modal || !frame) return;

    const resolvedVersion = Number(versionId) || (AppState.currentVersion ? AppState.currentVersion.version_id : null);
    const url = resolvedVersion ? `/production-admin.html?versionId=${resolvedVersion}` : '/production-admin.html';
    if (frame.src !== url) {
        frame.src = url;
    }

    if (!modal.dataset.outsideCloseBound) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeProductionAdminModal();
            }
        });
        modal.dataset.outsideCloseBound = 'true';
    }

    modal.style.display = 'block';
    modal.classList.add('active');
}


function closeProductionAdminModal() {
    const modal = document.getElementById('productionAdminModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
}

function openReferralAdminPanel(versionId) {
    const modal = document.getElementById('referralAdminModal');
    const frame = document.getElementById('referralAdminFrame');
    if (!modal || !frame) return;

    const resolvedVersion = Number(versionId) || (AppState.currentVersion ? AppState.currentVersion.version_id : null);
    const url = resolvedVersion ? `/referral-admin.html?versionId=${resolvedVersion}` : '/referral-admin.html';
    if (frame.src !== url) {
        frame.src = url;
    }

    if (!modal.dataset.outsideCloseBound) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeReferralAdminPanel();
            }
        });
        modal.dataset.outsideCloseBound = 'true';
    }

    modal.style.display = 'block';
    modal.classList.add('active');
}

function closeReferralAdminPanel() {
    const modal = document.getElementById('referralAdminModal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
}

window.openProductionAdminModal = openProductionAdminModal;
window.closeProductionAdminModal = closeProductionAdminModal;
window.openReferralAdminPanel = openReferralAdminPanel;
window.closeReferralAdminPanel = closeReferralAdminPanel;
window.handleReferralProductivityChange = handleReferralProductivityChange;

window.switchTab = switchTab;

window.switchHeadcountSubtab = switchHeadcountSubtab;

window.switchProductionSubtab = switchProductionSubtab;

window.switchTeam = switchTeam;

window.switchToGroup = switchToGroup;

window.switchForecast = switchForecast;
window.saveLockAndCloneForecastCycle = saveLockAndCloneForecastCycle;
window.createScenarioSandbox = createScenarioSandbox;

window.scrollToView = scrollToView;

window.undo = undo;

window.redo = redo;

window.exportToExcel = exportToExcel;


// Initialize application
async function initializeApp() {
    try {
        showLoadingIndicator('Initializing application...');
        initializeProductionToolbar();
        
        // Check API health
        await API.checkHealth();
        
        // Load initial data including groups
        const [teams, versions, periods, groupsData, adminAccess] = await Promise.all([
            API.teams.getAll(),
            API.forecasts.getVersions(),
            API.actuals.getPeriods(),
            API.teams.getGroups(),
            API.forecasts.getAdminAccess(AppState.currentUser).catch(() => ({ isAdmin: false }))
        ]);

        AppState.teams = teams;
        AppState.forecastVersions = versions;
        AppState.calendarPeriods = periods;
        AppState.isAdmin = !!adminAccess?.isAdmin;

        // Build GROUPS object dynamically
        GROUPS = {};
        window.GROUPS = GROUPS;
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

        if (AppState.currentVersion) {
            await loadProductionConfig(AppState.currentVersion.version_id);
        } else {
            AppState.productionConfig = getDefaultProductionConfig();
        }
        
        // Initialize UI components
        initializeSidebar();
        initializeForecastSelector();
        updateSaveLockButtonVisibility();
        updateGlobalLayoutState();
        updateTimelineViewButtonsVisibility();
        updateCurrentContextDisplay();
        
        // Initialize global selection event listeners
        initializeSelectionListeners();
        
        // Initialize keyboard shortcuts
        initializeKeyboardShortcuts();

        // Initialize cross-tab sync for Incentive Admin changes
        initializeIncentiveConfigSync();
        initializeProductionConfigSync();
        if (typeof initializeReferralConfigSync === 'function') {
            initializeReferralConfigSync();
        }
        // Initialize paste handlers for Excel-style multi-cell paste
        initializePasteHandlers();

        
        
        // Load initial team data
        await loadTeamData(AppState.currentTeam);
        applyLockedForecastUIState();
        
        // Scroll to Jan-24 after initial load
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollToJan2024();
                applyLockedForecastUIState();
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
            if (msg.type === 'targetedPay' && window.IncentiveCalculator && typeof window.IncentiveCalculator.clearTargetedPayCache === 'function') {
                window.IncentiveCalculator.clearTargetedPayCache(msg.teamId ? Number(msg.teamId) : null);
            }
            if (msg.type === 'percentTargets' && window.IncentiveCalculator && typeof window.IncentiveCalculator.clearPercentTargetCache === 'function') {
                if (msg.teamId) {
                    window.IncentiveCalculator.clearPercentTargetCache(Number(msg.teamId), msg.versionId ? Number(msg.versionId) : null);
                } else {
                    window.IncentiveCalculator.clearPercentTargetCache();
                }
            }
            if (msg.type === 'expenseGrid' && window.IncentiveCalculator && typeof window.IncentiveCalculator.clearExpenseGridCache === 'function') {
                window.IncentiveCalculator.clearExpenseGridCache(msg.teamId ? Number(msg.teamId) : null, msg.versionId ? Number(msg.versionId) : null);
            }
            const matchesTeam = !teamId || teamId === AppState.currentTeam;
            const matchesVersion = !versionId || (AppState.currentVersion && AppState.currentVersion.version_id === versionId);
            if (matchesTeam && matchesVersion) {
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
                if (msg.type === 'targetedPay' && window.IncentiveCalculator && typeof window.IncentiveCalculator.clearTargetedPayCache === 'function') {
                    window.IncentiveCalculator.clearTargetedPayCache(msg.teamId ? Number(msg.teamId) : null);
                }
                if (msg.type === 'percentTargets' && window.IncentiveCalculator && typeof window.IncentiveCalculator.clearPercentTargetCache === 'function') {
                    if (msg.teamId) {
                        window.IncentiveCalculator.clearPercentTargetCache(Number(msg.teamId), msg.versionId ? Number(msg.versionId) : null);
                    } else {
                        window.IncentiveCalculator.clearPercentTargetCache();
                    }
                }
                if (msg.type === 'expenseGrid' && window.IncentiveCalculator && typeof window.IncentiveCalculator.clearExpenseGridCache === 'function') {
                    window.IncentiveCalculator.clearExpenseGridCache(msg.teamId ? Number(msg.teamId) : null, msg.versionId ? Number(msg.versionId) : null);
                }
                const matchesTeam = !teamId || teamId === AppState.currentTeam;
                const matchesVersion = !versionId || (AppState.currentVersion && AppState.currentVersion.version_id === versionId);
                if (matchesTeam && matchesVersion) {
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

        const matrix = parseClipboardMatrix(text);
        const isMultiCellPaste = matrix && matrix.length > 0 && (
            matrix.length > 1 || matrix.some(row => row.length > 1)
        );

        if (!isMultiCellPaste) {
            // Single value paste - let default behavior happen
            return;
        }

        e.preventDefault();
        try {
            handleMatrixPaste(target, text, matrix);
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
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .filter((line, idx, arr) => line.length > 0 || (idx < arr.length - 1 && arr[idx + 1].length > 0));

    const delimiter = detectClipboardDelimiter(lines);

    const matrix = lines
        .map(line => line.split(delimiter))
        // Remove trailing empty columns if line ends with tab(s)
        .map(cols => {
            let end = cols.length;
            while (end > 0 && (cols[end - 1] === '' || cols[end - 1] == null)) end--;
            return cols.slice(0, end);
        })
        .filter(row => row.length > 0);
    return matrix;
}

function detectClipboardDelimiter(lines) {
    if (lines.some(line => line.includes('\t'))) {
        return '\t';
    }
    if (lines.some(line => line.includes(';'))) {
        return ';';
    }
    return '\t';
}

function getMetricKeyFromInput(input) {
    if (input.dataset.metric) return input.dataset.metric;
    if (input.dataset.pg) return 'headcount';
    if (input.dataset.flowKey) return 'headcount-flow';
    return null;
}

function rowMatchesMetric(rowEl, metricKey) {
    if (!rowEl) return false;
    switch (metricKey) {
        case 'headcount':
            return !!rowEl.querySelector('input[data-pg]');
        case 'productivity':
            return !!rowEl.querySelector("input[data-metric='productivity']");
        case 'mix':
            return !!rowEl.querySelector("input[data-metric='mix']");
        case 'abpa':
            return !!rowEl.querySelector("input[data-metric='abpa']");
        case 'additional-productivity':
            return !!rowEl.querySelector("input[data-metric='additional-productivity']");
        case 'additional-abpa':
            return !!rowEl.querySelector("input[data-metric='additional-abpa']");
        case 'headcount-flow':
            return !!rowEl.querySelector('input[data-flow-key]');
        default:
            return false;
    }
}

function getInputsForRowByMetric(rowEl, metricKey) {
    switch (metricKey) {
        case 'headcount':
            return Array.from(rowEl.querySelectorAll('input[data-pg]'));
        case 'productivity':
            return Array.from(rowEl.querySelectorAll("input[data-metric='productivity']"));
        case 'mix':
            return Array.from(rowEl.querySelectorAll("input[data-metric='mix']"));
        case 'abpa':
            return Array.from(rowEl.querySelectorAll("input[data-metric='abpa']"));
        case 'additional-productivity':
            return Array.from(rowEl.querySelectorAll("input[data-metric='additional-productivity']"));
        case 'additional-abpa':
            return Array.from(rowEl.querySelectorAll("input[data-metric='additional-abpa']"));
        case 'headcount-flow':
            return Array.from(rowEl.querySelectorAll('input[data-flow-key]'));
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

    if (metricKey === 'headcount-flow') {
        const v = parseFloat(s);
        if (isNaN(v)) return null;
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
    } else if (metricKey === 'headcount-flow') {
        fieldName = input.dataset.flowKey;
    } else if (metricKey === 'deepening-percent') {
        fieldName = 'deepening_percent';
        dbValue = storedValue / 100;
    }
    return { fieldName, dbValue };
}

// Build field and db value without an input element (for undo/redo)
function getFieldAndDbValueFromState(metricKey, product, pg, value, flowKey) {
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
    } else if (metricKey === 'headcount-flow') {
        fieldName = flowKey;
    } else if (metricKey === 'deepening-percent' || metricKey === 'deepening_percent') {
        fieldName = 'deepening_percent';
        dbValue = (parseFloat(value) || 0) / 100;
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
    if (metricKey === 'headcount-flow') {
        const flowKey = input.dataset.flowKey;
        const flows = AppState.teamData[AppState.currentForecast][teamKey].headcountFlows || {};
        return parseFloat(flows[flowKey]?.[month] || 0);
    }
    return 0;
}

function updateHeadcountFlowDerived(teamId, month) {
    if (!AppState.currentForecast) return;
    const teamKey = `Team ${teamId}`;
    const store = AppState.teamData?.[AppState.currentForecast]?.[teamKey];
    if (!store || !store.headcountFlows) return;
    const flows = store.headcountFlows;
    const starting = Number(flows.starting_headcount?.[month] ?? 0);
    const flowSum = FLOW_VALUE_KEYS.reduce((sum, key) => {
        const value = Number(flows[key]?.[month] ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    const ending = starting + flowSum;
    flows.ending_headcount[month] = ending;

    const endingCell = document.querySelector(
        `td[data-flow-team='${teamId}'][data-flow-key='ending_headcount'][data-month='${month}']`
    );
    if (endingCell) {
        endingCell.textContent = ending;
    }

    Promise.resolve().then(() => syncProductiveHeadcountToEnding(teamId, month, ending));

    return ending;
}

async function syncProductiveHeadcountToEnding(teamId, month, targetEnding) {
    const versionKey = AppState.currentForecast;
    const teamKey = `Team ${teamId}`;
    const teamStore = AppState.teamData?.[versionKey]?.[teamKey];
    if (!teamStore) {
        return;
    }

    const adminState = loadHeadcountAdminState(teamId);
    const ratio = resolveProductiveRatio({
        state: adminState,
        teamStore,
        month,
        targetEnding
    });
    const ratioMultiplier = ratio / 100;
    const targetTotal = Math.max(0, Math.round((Number(targetEnding) || 0) * ratioMultiplier));
    const currentValues = {};
    let currentTotal = 0;

    PG_LEVELS.forEach(pg => {
        const raw = Number(teamStore.pgLevels?.[pg]?.[month] ?? 0);
        const safe = Number.isFinite(raw) ? raw : 0;
        currentValues[pg] = safe;
        currentTotal += safe;
    });

    if (currentTotal === targetTotal) {
        updateHeadcountTotals(teamId, month);
        updateProductionCalculations(teamId, month);
        return;
    }

    const allocations = computeHeadcountAllocations({
        teamId,
        month,
        targetTotal,
        currentValues,
        adminState
    });
    const periodDate = typeof getPeriodDate === 'function' ? getPeriodDate(month) : month;
    const updates = [];
    let hasChange = false;

    PG_LEVELS.forEach(pg => {
        const newValue = allocations[pg] || 0;
        const prevValue = currentValues[pg] || 0;
        if (newValue === prevValue) {
            return;
        }
        hasChange = true;
        if (!teamStore.pgLevels[pg]) {
            teamStore.pgLevels[pg] = {};
        }
        teamStore.pgLevels[pg][month] = newValue;

        const selector = `#sales-headcount-subtab input[data-month="${month}"][data-pg="${pg}"][data-team="${teamId}"]`;
        const inputEl = document.querySelector(selector);
        if (inputEl) {
            inputEl.value = newValue;
        }

        updates.push({
            teamId: Number(teamId),
            periodDate,
            field: `pg${pg.replace(/\D/g, '')}_headcount`,
            newValue
        });
    });

    updateHeadcountTotals(teamId, month);
    updateProductionCalculations(teamId, month);

    if (!hasChange || !updates.length || !AppState.currentVersion) {
        return;
    }

    const shouldPersist = !AppState.isBulkPasting && !AppState.isProgrammaticChange;
    if (!shouldPersist) {
        return;
    }

    try {
        await API.forecasts.bulkUpdate({
            updates,
            versionId: AppState.currentVersion.version_id,
            updatedBy: AppState.currentUser
        });
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to sync productive headcount with ending headcount', error);
        showError('Failed to sync productive headcount');
    }
}

function loadHeadcountAdminState(teamId) {
    const versionId = AppState.currentVersion?.version_id;
    const versionKey = AppState.currentForecast;
    const versionPart = Number.isFinite(versionId) ? `id:${versionId}` : `name:${versionKey || 'default'}`;
    const storageKey = `hcAdmin.v1:${versionPart}:team:${teamId}`;
    try {
        const raw = window.localStorage?.getItem(storageKey);
        if (!raw) {
            return null;
        }
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Unable to read headcount admin state', error);
        return null;
    }
}

function resolveProductiveRatio({ state, teamStore, month, targetEnding }) {
    const ratioFromState = Number(state?.productiveRatio);
    if (Number.isFinite(ratioFromState) && ratioFromState >= 0) {
        return clampNumber(ratioFromState, 0, 100);
    }

    const ending = Number(teamStore?.headcountFlows?.ending_headcount?.[month] ?? targetEnding);
    if (ending > 0) {
        const productive = PG_LEVELS.reduce((sum, pg) => {
            const value = Number(teamStore?.pgLevels?.[pg]?.[month] ?? 0);
            return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        return clampNumber((productive / ending) * 100, 0, 100);
    }

    return 100;
}

function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return min;
    }
    return Math.min(max, Math.max(min, numeric));
}

function computeHeadcountAllocations({ teamId, month, targetTotal, currentValues, adminState }) {
    const allocations = {};
    PG_LEVELS.forEach(pg => {
        allocations[pg] = 0;
    });

    if (targetTotal <= 0) {
        return allocations;
    }

    const overrides = sanitizeMonthlyOverrides(adminState?.manualOverrides?.[month]);
    Object.keys(overrides).forEach(pg => {
        allocations[pg] = overrides[pg];
    });

    let manualTotal = Object.values(overrides).reduce((sum, value) => sum + value, 0);
    let remaining = targetTotal - manualTotal;
    if (remaining < 0) {
        remaining = 0;
    }

    const adjustable = PG_LEVELS.filter(pg => !overrides.hasOwnProperty(pg));
    if (adjustable.length > 0 && remaining > 0) {
        const splits = resolvePgSplits({ adminState, currentValues, adjustable });
        let shareTotal = adjustable.reduce((sum, pg) => sum + (splits[pg] || 0), 0);
        if (shareTotal <= 0) {
            shareTotal = adjustable.length;
            adjustable.forEach(pg => {
                splits[pg] = 1;
            });
        }

        const provisional = [];
        let allocated = 0;
        adjustable.forEach(pg => {
            const share = splits[pg] || 0;
            const fraction = shareTotal > 0 ? share / shareTotal : (1 / adjustable.length);
            const raw = remaining * fraction;
            const base = Math.floor(raw);
            allocations[pg] = (allocations[pg] || 0) + base;
            allocated += base;
            provisional.push({ pg, remainder: raw - base });
        });

        let remainderUnits = remaining - allocated;
        if (remainderUnits > 0) {
            provisional.sort((a, b) => b.remainder - a.remainder);
            let index = 0;
            while (remainderUnits > 0 && provisional.length > 0) {
                const targetPg = provisional[index % provisional.length].pg;
                allocations[targetPg] = (allocations[targetPg] || 0) + 1;
                remainderUnits -= 1;
                index += 1;
            }
        }
    }

    const finalTotal = PG_LEVELS.reduce((sum, pg) => sum + (allocations[pg] || 0), 0);
    const difference = targetTotal - finalTotal;
    if (difference !== 0) {
        const eligible = adjustable.length ? adjustable : PG_LEVELS;
        const targetPg = eligible[0];
        if (targetPg) {
            allocations[targetPg] = Math.max(0, (allocations[targetPg] || 0) + difference);
        }
    }

    return allocations;
}

function sanitizeMonthlyOverrides(rawOverrides) {
    const overrides = {};
    if (!rawOverrides || typeof rawOverrides !== 'object') {
        return overrides;
    }

    PG_LEVELS.forEach(pg => {
        if (!Object.prototype.hasOwnProperty.call(rawOverrides, pg)) {
            return;
        }
        const numeric = Math.max(0, Math.round(Number(rawOverrides[pg]) || 0));
        overrides[pg] = numeric;
    });

    return overrides;
}

function resolvePgSplits({ adminState, currentValues, adjustable }) {
    const splits = {};
    let total = 0;

    if (adminState && adminState.pgSplits && typeof adminState.pgSplits === 'object') {
        adjustable.forEach(pg => {
            const numeric = Number(adminState.pgSplits[pg]);
            if (Number.isFinite(numeric) && numeric >= 0) {
                splits[pg] = numeric;
                total += numeric;
            }
        });
    }

    if (total > 0) {
        return splits;
    }

    const positive = adjustable.filter(pg => (currentValues[pg] || 0) > 0);
    const positiveTotal = positive.reduce((sum, pg) => sum + (currentValues[pg] || 0), 0);
    if (positiveTotal > 0) {
        positive.forEach(pg => {
            splits[pg] = currentValues[pg] || 0;
        });
        return splits;
    }

    const evenShare = adjustable.length ? 100 / adjustable.length : 0;
    adjustable.forEach(pg => {
        splits[pg] = evenShare;
    });
    return splits;
}

// Apply matrix paste starting from a focused input
function handleMatrixPaste(startInput, rawText, preParsedMatrix) {
    const matrix = preParsedMatrix || parseClipboardMatrix(rawText);
    if (!matrix || matrix.length === 0) return;

    const metricKey = getMetricKeyFromInput(startInput);
    if (!metricKey) return; // Not a supported field

    const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
    const startMonth = startInput.dataset.month;

    const updates = [];
    const flowUpdates = [];
    const flowTouches = new Set();
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

                if (metricKey === 'headcount-flow') {
                    const flowKey = targetInput.dataset.flowKey;
                    const teamKey = `Team ${targetInput.dataset.team}`;
                    const flows = AppState.teamData?.[AppState.currentForecast]?.[teamKey]?.headcountFlows;
                    if (flows && flowKey) {
                        if (!flows[flowKey]) flows[flowKey] = {};
                        flows[flowKey][targetInput.dataset.month] = parsed.stored;
                    }
                    flowTouches.add(`${targetInput.dataset.team}|${targetInput.dataset.month}`);
                }
                // Build DB update
                const { fieldName, dbValue } = getDbFieldAndValue(targetInput, metricKey, parsed.stored);
                if (!fieldName) continue;
                const teamId = parseInt(targetInput.dataset.team);
                const periodDate = getPeriodDate(targetInput.dataset.month);
                if (metricKey === 'headcount-flow') {
                    flowUpdates.push({
                        teamId,
                        periodDate,
                        field: fieldName,
                        value: dbValue,
                        dataType: 'forecast',
                        versionId: AppState.currentVersion?.version_id,
                        updatedBy: AppState.currentUser
                    });
                } else {
                    // Push forecast update
                    updates.push({
                        teamId,
                        periodDate,
                        field: fieldName,
                        newValue: dbValue
                    });
                }
                // Track change for grouped undo
                changes.push({
                    team: targetInput.dataset.team,
                    month: targetInput.dataset.month,
                    metric: metricKey,
                    product: targetInput.dataset.product,
                    pg: targetInput.dataset.pg,
                    flow: targetInput.dataset.flowKey,
                    previousValue: previousValue,
                    newValue: parsed.stored
                });
                // Trigger change to update local state and calculations (API suppressed)
                targetInput.dispatchEvent(new Event('change'));
            }

            // Move to next row (for multi-row paste)
            currentRow = findNextRowWithMetric(currentRow, metricKey);
        }

        if (metricKey === 'headcount-flow') {
            flowTouches.forEach(token => {
                const [teamId, month] = token.split('|');
                updateHeadcountFlowDerived(teamId, month);
            });
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

    if (flowUpdates.length > 0) {
        const showBusy = flowUpdates.length > 50;
        if (showBusy) showLoadingIndicator('Pasting...');
        API.headcountFlows.bulkUpdate({
            updates: flowUpdates,
            updatedBy: AppState.currentUser
        }).then(() => {
            showSaveIndicator();
            if (showBusy) hideLoadingIndicator();
        }).catch((error) => {
            console.error('Headcount flow bulk update failed:', error);
            showError('Failed to save headcount flows');
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
            "td.actual-col, td.forecast-col, .selectable-input, input[type='number']"
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
    if (!teamNav) return;

    teamNav.innerHTML = '';

    if (AppState.headcountSubtab === 'non-sales') {
        NON_SALES_GROUPS.forEach(group => {
            const header = document.createElement('div');
            header.className = 'group-header group-header--static';
            header.dataset.groupKey = group.key;
            header.innerHTML = "<span class='group-name'>" + group.displayName + "</span>";
            if (group.key === AppState.currentNonSalesGroup) {
                header.classList.add('active');
            }
            header.addEventListener('click', (event) => {
                event.preventDefault();
                if (typeof switchToNonSalesGroup === 'function') {
                    switchToNonSalesGroup(group.key);
                }
            });
            teamNav.appendChild(header);
        });
        return;
    }

    const teamsByGroup = {};
    (AppState.teams || []).forEach(team => {
        const key = team.group_name || 'ungrouped';
        if (!teamsByGroup[key]) {
            teamsByGroup[key] = {
                displayName: team.group_display_name || key,
                teams: []
            };
        }
        teamsByGroup[key].teams.push(team);
    });

    Object.entries(teamsByGroup).forEach(([groupName, groupData]) => {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'group-header';
        groupHeader.dataset.groupKey = groupName;
        groupHeader.innerHTML = "<span class='group-name'>" + groupData.displayName + "</span><span class='arrow'>&#9662;</span>";
        groupHeader.addEventListener('click', (event) => {
            event.preventDefault();
            if (event.target.closest('.arrow')) {
                toggleGroup(groupHeader);
            } else if (typeof switchToGroup === 'function') {
                switchToGroup(groupName);
            }
        });
        teamNav.appendChild(groupHeader);

        const groupItems = document.createElement('div');
        groupItems.className = 'group-items';
        groupData.teams.forEach(team => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = team.team_name;
            link.dataset.teamId = team.team_id;
            if (Number(team.team_id) === Number(AppState.currentTeam)) {
                link.classList.add('active');
            }
            link.addEventListener('click', (event) => {
                event.preventDefault();
                if (typeof switchTeam === 'function') {
                    switchTeam(team.team_id);
                }
            });
            li.appendChild(link);
            groupItems.appendChild(li);
        });
        teamNav.appendChild(groupItems);
    });
}

function isTeamAgnosticTab(tabName = AppState.currentTab) {
    return tabName === 'kmpc';
}

function isScenarioVersion(version = AppState.currentVersion) {
    return !!version && (version.is_scenario === true || Number(version.is_scenario) === 1);
}

function updateGlobalLayoutState() {
    if (!document.body) {
        return;
    }
    document.body.classList.toggle('team-agnostic-layout', isTeamAgnosticTab());
}

function updateTimelineViewButtonsVisibility(tabName = AppState.currentTab) {
    const viewButtons = document.getElementById('timelineViewButtons');
    if (!viewButtons) {
        return;
    }
    viewButtons.style.display = tabName === 'kmpc' ? 'none' : 'flex';
}

function updateCurrentContextDisplay() {
    const display = document.getElementById('currentTeamDisplay');
    if (!display) {
        return;
    }

    const scenarioSourceName = AppState.currentVersion?.source_version_name || 'Live Forecast';
    const scenarioMeta = isScenarioVersion()
        ? `<span class="scenario-context"><span class="scenario-badge">Scenario</span><span>Base: ${scenarioSourceName}</span></span>`
        : '';

    if (isTeamAgnosticTab()) {
        const versionName = AppState.currentVersion?.version_name || 'selected forecast';
        display.innerHTML = `KMPC inputs for ${versionName} | Team-agnostic ${scenarioMeta}`;
        return;
    }

    if (AppState.isGroupView && AppState.currentGroup) {
        display.innerHTML = `Group ${AppState.currentGroup} <span class='group-view-indicator'>Read Only</span> ${scenarioMeta}`;
        return;
    }

    const team = AppState.teams.find(t => Number(t.team_id) === Number(AppState.currentTeam));
    const teamName = team ? team.team_name : '';
    display.innerHTML = `${teamName} ${scenarioMeta}`;
}

function suggestNextCycleName(versionName) {
    const name = String(versionName || '').trim();
    if (/^\d{1,2}\+\d{1,2}$/.test(name)) {
        return '0+12';
    }
    return '0+12';
}

function hasBlockingValidationErrors() {
    return !!document.querySelector('.invalid-input, .invalid');
}

function updateSaveLockButtonVisibility() {
    const button = document.getElementById('saveLockForecastBtn');
    if (!button) {
        return;
    }

    const locked = !!AppState.currentVersion?.is_locked;
    const scenario = isScenarioVersion();
    const shouldShow = AppState.isAdmin && !scenario;
    button.style.display = shouldShow ? '' : 'none';
    button.disabled = !shouldShow || locked || AppState.isSaveLockInProgress;
    if (locked) {
        button.title = 'Current forecast is already locked';
    } else {
        button.title = '';
    }

    updateScenarioButtonVisibility();
}

function updateScenarioButtonVisibility() {
    const button = document.getElementById('createScenarioBtn');
    if (!button) {
        return;
    }

    const shouldShow = !!AppState.currentVersion && !isScenarioVersion();
    button.style.display = shouldShow ? '' : 'none';
    button.disabled = !shouldShow;
    button.title = shouldShow ? '' : 'Scenarios are created from the live forecast only';
}

function applyLockedForecastUIState() {
    const isLocked = !!AppState.currentVersion?.is_locked;
    const wrappers = document.querySelectorAll('.tab-content .data-table-wrapper');
    wrappers.forEach(wrapper => {
        const inputs = wrapper.querySelectorAll('input');
        inputs.forEach(input => {
            if (isLocked) {
                input.readOnly = true;
                input.disabled = true;
            } else {
                input.readOnly = false;
                input.disabled = false;
            }
        });
    });
}

// Initialize forecast selector
function initializeForecastSelector() {
    const forecastSelect = document.getElementById('forecastSelect');
    forecastSelect.innerHTML = '';

    const liveVersions = AppState.forecastVersions.filter(version => !isScenarioVersion(version));
    const scenarioVersions = AppState.forecastVersions.filter(version => isScenarioVersion(version));

    const appendVersionOption = (parent, version) => {
        const option = document.createElement('option');
        option.value = version.version_id;
        const lockedSuffix = version.is_locked ? ' (Locked)' : '';
        option.textContent = isScenarioVersion(version)
            ? `${version.scenario_name || version.version_name} [Scenario | Base: ${version.source_version_name || 'Live Forecast'}]${lockedSuffix}`
            : `${version.version_name}${lockedSuffix}`;
        parent.appendChild(option);
    };

    if (liveVersions.length) {
        const liveGroup = document.createElement('optgroup');
        liveGroup.label = 'Forecast Cycles';
        liveVersions.forEach(version => appendVersionOption(liveGroup, version));
        forecastSelect.appendChild(liveGroup);
    }

    if (scenarioVersions.length) {
        const scenarioGroup = document.createElement('optgroup');
        scenarioGroup.label = 'Scenario Sandboxes';
        scenarioVersions.forEach(version => appendVersionOption(scenarioGroup, version));
        forecastSelect.appendChild(scenarioGroup);
    }
    
    if (AppState.currentVersion) {
        forecastSelect.value = AppState.currentVersion.version_id;
    }

    updateSaveLockButtonVisibility();
}

async function createScenarioSandbox() {
    if (!AppState.currentVersion || !AppState.currentVersion.version_id) {
        showError('Select a forecast version first.');
        return;
    }
    if (isScenarioVersion()) {
        showError('Scenarios can only be created from the live forecast.');
        return;
    }

    const sourceName = AppState.currentVersion.version_name;
    const suggestedName = `${sourceName} Scenario`;
    const scenarioName = window.prompt('Enter a name for the scenario sandbox:', suggestedName);
    if (scenarioName == null) {
        return;
    }

    const trimmedName = String(scenarioName).trim();
    if (!trimmedName) {
        showError('Scenario name is required.');
        return;
    }

    const shouldProceed = window.confirm(
        `Create "${trimmedName}" as a sandbox copy of "${sourceName}"?\n\nChanges made in the scenario will not affect the live forecast.`
    );
    if (!shouldProceed) {
        return;
    }

    try {
        showLoadingIndicator('Creating scenario sandbox...');
        const result = await API.forecasts.createScenario({
            sourceVersionId: AppState.currentVersion.version_id,
            scenarioName: trimmedName,
            userEmail: AppState.currentUser
        });

        const versions = await API.forecasts.getVersions();
        AppState.forecastVersions = versions;
        const newVersionId = result?.data?.newVersionId;
        AppState.currentVersion = versions.find(v => Number(v.version_id) === Number(newVersionId)) || AppState.currentVersion;
        AppState.currentForecast = AppState.currentVersion ? AppState.currentVersion.version_name : null;
        initializeForecastSelector();
        updateCurrentContextDisplay();
        if (AppState.currentVersion) {
            await loadProductionConfig(AppState.currentVersion.version_id);
        }
        if (AppState.isGroupView) {
            renderCurrentTab();
        } else {
            await loadTeamData(AppState.currentTeam);
        }
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to create scenario sandbox', error);
        showError(error?.message || 'Failed to create scenario sandbox');
    } finally {
        hideLoadingIndicator();
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

        if (typeof ensureBaselineStateInitialized === 'function') {
            ensureBaselineStateInitialized(transformedData);
        }
        if (typeof applyProductionBaselines === 'function') {
            applyProductionBaselines({
                data: transformedData,
                months: typeof generateMonthList === 'function' ? generateMonthList() : [],
                teamId,
                updateDom: false
            });
        }
        if (typeof recalcForecastProductionTotals === 'function') {
            recalcForecastProductionTotals(teamId);
        }

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
        window.GROUPS = GROUPS;
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
    const outboundFlows = Array.isArray(window.REFERRAL_OUTBOUND_FLOWS)
        ? window.REFERRAL_OUTBOUND_FLOWS
        : [];
    const inboundFlows = Array.isArray(window.REFERRAL_INBOUND_FLOWS)
        ? window.REFERRAL_INBOUND_FLOWS
        : [];
    
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
        additionalProducts: {},
        productionTotals: {},
        deepening: {
            amount: {},
            percent: {}
        },
        referrals: {
            outbound: {},
            inbound: {}
        }
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

    outboundFlows.forEach(flow => {
        const key = flow.key || flow;
        aggregatedData.referrals.outbound[key] = {
            productivity: {},
            qualityReferrals: {},
            totalActuals: {},
            wonActuals: {}
        };
    });

    inboundFlows.forEach(flow => {
        const key = flow.key || flow;
        aggregatedData.referrals.inbound[key] = {
            productivity: {},
            qualityReferrals: {}
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
        const monthBusinessDays = window.BUSINESS_DAYS?.[months.indexOf(month)] || 21;
        let aggProductiveHeadcount = 0;
        let aggTotalInvestmentAccounts = 0;
        let aggInvestmentAccounts = 0;
        let aggInvestmentAssets = 0;
        let aggBankingAccounts = 0;
        let aggBankingAssets = 0;
        let productCAccountsSum = 0;
        let productCBalanceSum = 0;
        let aggDeepeningAmount = 0;
        const teamHeadcountCache = {};

        teamKeys.forEach(teamKey => {
            const teamData = AppState.teamData[AppState.currentForecast]?.[teamKey];
            const totals = teamData?.productionTotals?.[month];
            if (!totals) return;
            aggProductiveHeadcount += Number(totals.productiveHeadcount) || 0;
            aggTotalInvestmentAccounts += Number(totals.totalInvestmentAccounts) || 0;
            aggInvestmentAccounts += Number(totals.investmentAccounts) || 0;
            aggInvestmentAssets += Number(totals.investmentAssets) || 0;
            const pcAccounts = Number(totals.productCAccounts) || 0;
            const pcAbpa = Number(totals.productCAbpa) || 0;
            const pcBalanceValue = Number(totals.productCBalance);
            productCAccountsSum += pcAccounts;
            productCBalanceSum += Number.isFinite(pcBalanceValue) ? pcBalanceValue : (pcAccounts * pcAbpa);
            aggBankingAccounts += Number(totals.bankingAccounts) || 0;
            aggBankingAssets += Number(totals.bankingAssets) || 0;

            const deepPercent = Number(teamData?.deepening?.percent?.[month]);
            const deepAmount = Number(teamData?.deepening?.amount?.[month]);
            const invAssets = Number(totals.investmentAssets) || 0;
            if (Number.isFinite(deepAmount)) {
                aggDeepeningAmount += deepAmount;
            } else if (Number.isFinite(deepPercent) && invAssets > 0) {
                aggDeepeningAmount += deepPercent * invAssets;
            }
        });

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
            teamHeadcountCache[teamKey] = teamHeadcount;
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

        const productCAbpaValue = productCAccountsSum > 0 ? productCBalanceSum / productCAccountsSum : 0;
        outboundFlows.forEach(flow => {
            const key = flow.key || flow;
            const store = aggregatedData.referrals.outbound[key];
            if (!store) {
                return;
            }
            let totalHeadcountForFlow = 0;
            let weightedQuality = 0;
            let totalActual = 0;
            let totalWon = 0;
            let actualQualitySum = 0;
            let hasActualQuality = false;

            teamKeys.forEach(teamKey => {
                const teamData = AppState.teamData[AppState.currentForecast]?.[teamKey];
                if (!teamData) return;
                const teamHeadcount = teamHeadcountCache[teamKey];
                if (!Number.isFinite(teamHeadcount) || teamHeadcount <= 0) {
                    return;
                }
                const prodValue = Number.parseFloat(
                    teamData.referrals?.outbound?.[key]?.productivity?.[month] || 0
                );
                totalHeadcountForFlow += teamHeadcount;
                weightedQuality += (teamHeadcount * prodValue * monthBusinessDays) / 5;
                const storedQuality = Number(teamData.referrals?.outbound?.[key]?.qualityReferrals?.[month]);
                if (Number.isFinite(storedQuality)) {
                    actualQualitySum += storedQuality;
                    hasActualQuality = true;
                }

                const totalValue = Number(teamData.referrals?.outbound?.[key]?.totalActuals?.[month]);
                if (Number.isFinite(totalValue)) {
                    totalActual += totalValue;
                }
                const wonValue = Number(teamData.referrals?.outbound?.[key]?.wonActuals?.[month]);
                if (Number.isFinite(wonValue)) {
                    totalWon += wonValue;
                }
            });

            const status = aggregatedData.forecastStatus?.[month];
            const isForecast = status === 'Forecast';
            const qualitySource = (isForecast || !hasActualQuality) ? weightedQuality : actualQualitySum;

            const aggregatedProd = (totalHeadcountForFlow > 0 && monthBusinessDays > 0)
                ? ((qualitySource * 5) / (totalHeadcountForFlow * monthBusinessDays))
                : 0;

            store.productivity[month] = aggregatedProd.toFixed(2);
            store.qualityReferrals[month] = Math.round(Math.max(0, qualitySource));
            store.totalActuals[month] = Math.round(totalActual);
            store.wonActuals[month] = Math.round(totalWon);
        });

        inboundFlows.forEach(flow => {
            const key = flow.key || flow;
            const store = aggregatedData.referrals.inbound[key];
            if (!store) {
                return;
            }
            let totalHeadcountForFlow = 0;
            let weightedQuality = 0;
            let actualQualitySum = 0;
            let hasActualQuality = false;

            teamKeys.forEach(teamKey => {
                const teamData = AppState.teamData[AppState.currentForecast]?.[teamKey];
                if (!teamData) return;
                const teamHeadcount = teamHeadcountCache[teamKey];
                if (!Number.isFinite(teamHeadcount) || teamHeadcount <= 0) {
                    return;
                }
                const prodValue = Number.parseFloat(
                    teamData.referrals?.inbound?.[key]?.productivity?.[month] || 0
                );
                totalHeadcountForFlow += teamHeadcount;
                weightedQuality += (teamHeadcount * prodValue * monthBusinessDays) / 5;
                const storedQuality = Number(teamData.referrals?.inbound?.[key]?.qualityReferrals?.[month]);
                if (Number.isFinite(storedQuality)) {
                    actualQualitySum += storedQuality;
                    hasActualQuality = true;
                }
            });

            const status = aggregatedData.forecastStatus?.[month];
            const isForecast = status === 'Forecast';
            const qualitySource = (isForecast || !hasActualQuality) ? weightedQuality : actualQualitySum;

            const aggregatedProd = (totalHeadcountForFlow > 0 && monthBusinessDays > 0)
                ? ((qualitySource * 5) / (totalHeadcountForFlow * monthBusinessDays))
                : 0;

            store.productivity[month] = aggregatedProd.toFixed(2);
            store.qualityReferrals[month] = Math.round(Math.max(0, qualitySource));
        });

        aggregatedData.productionTotals[month] = {
            businessDays: monthBusinessDays,
            productiveHeadcount: aggProductiveHeadcount,
            totalInvestmentAccounts: aggTotalInvestmentAccounts,
            investmentAccounts: aggInvestmentAccounts,
            investmentAssets: aggInvestmentAssets,
            productCAccounts: productCAccountsSum,
            productCAbpa: productCAbpaValue,
            productCBalance: productCBalanceSum,
            bankingAccounts: aggBankingAccounts,
            bankingAssets: aggBankingAssets
        };
        const totalBalanceForDeepening = aggInvestmentAssets;
        const deepPct = totalBalanceForDeepening > 0 ? aggDeepeningAmount / totalBalanceForDeepening : 0;
        aggregatedData.deepening.amount[month] = aggDeepeningAmount;
        aggregatedData.deepening.percent[month] = deepPct;
    });
    
    return aggregatedData;
}

// Transform API data to frontend format
function transformApiData(apiData) {
    const outboundFlows = Array.isArray(window.REFERRAL_OUTBOUND_FLOWS)
        ? window.REFERRAL_OUTBOUND_FLOWS
        : [];
    const inboundFlows = Array.isArray(window.REFERRAL_INBOUND_FLOWS)
        ? window.REFERRAL_INBOUND_FLOWS
        : [];
    const transformed = {
        forecastStatus: {},
        deepening: {
            amount: {},
            percent: {}
        },
        headcountFlows: {
            starting_headcount: {},
            flow_1: {},
            flow_2: {},
            flow_3: {},
            flow_4: {},
            flow_5: {},
            ending_headcount: {}
        },
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
        additionalProducts: {},
        productionTotals: {},
        deepening: {
            amount: {},
            percent: {}
        },
        referrals: {
            outbound: {},
            inbound: {}
        }
    };

    // Initialize additional products
    ADDITIONAL_PRODUCTS.forEach(product => {
        transformed.additionalProducts[product] = {
            productivity: {},
            abpa: {}
        };
    });

    outboundFlows.forEach(flow => {
        const key = flow.key || flow;
        transformed.referrals.outbound[key] = {
            productivity: {},
            qualityReferrals: {},
            totalActuals: {},
            wonActuals: {}
        };
    });

    inboundFlows.forEach(flow => {
        const key = flow.key || flow;
        transformed.referrals.inbound[key] = {
            productivity: {},
            qualityReferrals: {}
        };
    });

    // Extract business days for global use
    const businessDaysMap = {};
    apiData.forEach(row => {
        businessDaysMap[row.period_string] = row.business_days;
    });
    window.BUSINESS_DAYS = Object.values(businessDaysMap);

    const flowKeys = ['starting_headcount', 'flow_1', 'flow_2', 'flow_3', 'flow_4', 'flow_5', 'ending_headcount'];

    // Transform data
    apiData.forEach(row => {
        const period = row.period_string;

        transformed.forecastStatus[period] = row.data_type === 'forecast' ? 'Forecast' : 'Actual';

        flowKeys.forEach(key => {
            const value = Number(row[key] ?? 0);
            transformed.headcountFlows[key][period] = Number.isFinite(value) ? value : 0;
        });

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

        outboundFlows.forEach(flow => {
            const key = flow.key || flow;
            const store = transformed.referrals.outbound[key];
            if (!store) {
                return;
            }
            const prodField = `ref_out_${key}_prod`;
            const qualityField = `ref_out_${key}_quality`;
            const totalField = `ref_out_${key}_total`;
            const wonField = `ref_out_${key}_won`;
            const prodValue = Number.parseFloat(row[prodField]) || 0;
            store.productivity[period] = prodValue.toFixed(2);
            const qualityValue = Number(row[qualityField]);
            if (Number.isFinite(qualityValue)) {
                store.qualityReferrals[period] = qualityValue;
            }
            const totalValue = Number(row[totalField]);
            store.totalActuals[period] = Number.isFinite(totalValue) ? totalValue : 0;
            const wonValue = Number(row[wonField]);
            store.wonActuals[period] = Number.isFinite(wonValue) ? wonValue : 0;
        });

        inboundFlows.forEach(flow => {
            const key = flow.key || flow;
            const store = transformed.referrals.inbound[key];
            if (!store) {
                return;
            }
            const prodField = `ref_in_${key}_prod`;
            const prodValue = Number.parseFloat(row[prodField]) || 0;
            store.productivity[period] = prodValue.toFixed(2);
            const qualityField = `ref_in_${key}_quality`;
            const qualityValue = Number(row[qualityField]);
            if (Number.isFinite(qualityValue)) {
                store.qualityReferrals[period] = qualityValue;
            }
        });

        // Transform additional products
        ADDITIONAL_PRODUCTS.forEach(product => {
            const prodLower = product.toLowerCase();
            const prodKey = 'product_' + prodLower;
        transformed.additionalProducts[product].productivity[period] = 
            parseFloat(row[prodKey + '_productivity'] || 0).toFixed(2);
        transformed.additionalProducts[product].abpa[period] =
            Math.round(parseFloat(row[prodKey + '_abpa'] || 0));
    });

        const businessDays = parseInt(row.business_days, 10) || 21;
        const pgValues = [
            transformed.pgLevels.PG1[period],
            transformed.pgLevels.PG2[period],
            transformed.pgLevels.PG3[period],
            transformed.pgLevels.PG4[period],
            transformed.pgLevels.PG5[period],
            transformed.pgLevels.PG6[period],
            transformed.pgLevels.PG7[period]
        ];
        const productiveHeadcount = pgValues.reduce((sum, value) => sum + (Number(value) || 0), 0);
        const weeklyProd = parseFloat(transformed.productivity[period]) || 0;
        const totalInvestmentAccounts = Math.round((productiveHeadcount * weeklyProd * businessDays) / 5);

        let investmentAccountsTotal = 0;
        let investmentAssetsTotal = 0;
        let productCAccountsTotal = 0;
        let productCAbpaValue = 0;

        if (Array.isArray(PRODUCTS)) {
            PRODUCTS.forEach(product => {
                const mix = transformed.productMix?.[product]?.[period] || 0;
                const accounts = Math.round(totalInvestmentAccounts * mix);
                const abpaValue = transformed.abpa?.[product]?.[period] || 0;
                investmentAccountsTotal += accounts;
                investmentAssetsTotal += accounts * abpaValue;
                if (product === 'Product C') {
                    productCAccountsTotal = accounts;
                    productCAbpaValue = abpaValue;
                }
            });
        }

        let bankingAccountsTotal = 0;
        let bankingAssetsTotal = 0;
        if (Array.isArray(ADDITIONAL_PRODUCTS)) {
            ADDITIONAL_PRODUCTS.forEach(product => {
                const weeklyProdAdd = parseFloat(transformed.additionalProducts?.[product]?.productivity?.[period] || 0);
                const abpaValue = transformed.additionalProducts?.[product]?.abpa?.[period] || 0;
                const accounts = Math.round((productiveHeadcount * weeklyProdAdd * businessDays) / 5);
                bankingAccountsTotal += accounts;
                bankingAssetsTotal += accounts * abpaValue;
            });
        }

        const productCBalance = productCAccountsTotal * productCAbpaValue;

        transformed.productionTotals[period] = {
            businessDays,
            productiveHeadcount,
            totalInvestmentAccounts,
            investmentAccounts: investmentAccountsTotal,
            investmentAssets: investmentAssetsTotal,
            productCAccounts: productCAccountsTotal,
            productCAbpa: productCAbpaValue,
            productCBalance,
            bankingAccounts: bankingAccountsTotal,
            bankingAssets: bankingAssetsTotal
        };

        const deepPercentValue = Number(row.deepening_percent);
        const deepAmountValue = Number(row.deepening_amount);
        const totalBalanceCalc = Number(row.total_balance_calc);
        if (Number.isFinite(deepPercentValue)) {
            transformed.deepening.percent[period] = deepPercentValue;
        }
        if (Number.isFinite(deepAmountValue)) {
            transformed.deepening.amount[period] = deepAmountValue;
        } else if (Number.isFinite(deepPercentValue) && Number.isFinite(totalBalanceCalc)) {
            transformed.deepening.amount[period] = deepPercentValue * totalBalanceCalc;
        }
        if (!Number.isFinite(transformed.deepening.percent[period])) {
            const derivedAmount = Number(transformed.deepening.amount[period]);
            transformed.deepening.percent[period] = (Number.isFinite(derivedAmount) && Number.isFinite(totalBalanceCalc) && totalBalanceCalc > 0)
                ? derivedAmount / totalBalanceCalc
                : 0;
        }
        if (!Number.isFinite(transformed.deepening.amount[period])) {
            transformed.deepening.amount[period] = 0;
        }
        if (!Number.isFinite(transformed.deepening.percent[period])) {
            let hash = 0;
            const seed = `${row.team_id || row.team || 'seed'}-${period}-deepening`;
            for (let i = 0; i < seed.length; i++) {
                hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                hash |= 0;
            }
            const ratio = 0.10 + (Math.abs(hash) % 1501) / 10000;
            const balanceFallback = Number.isFinite(totalBalanceCalc) ? totalBalanceCalc : investmentAssetsTotal;
            transformed.deepening.percent[period] = ratio;
            transformed.deepening.amount[period] = Number.isFinite(balanceFallback) ? ratio * balanceFallback : (transformed.deepening.amount[period] || 0);
        } else if (!Number.isFinite(Number(row.deepening_amount))) {
            const balanceFallback = Number.isFinite(totalBalanceCalc) ? totalBalanceCalc : investmentAssetsTotal;
            if (Number.isFinite(balanceFallback)) {
                transformed.deepening.amount[period] = transformed.deepening.percent[period] * balanceFallback;
            }
        }
    });

    return transformed;
}
function monthLabelFromDate(periodDate) {
    if (!periodDate) {
        return null;
    }
    const normalized = String(periodDate).slice(0, 10);
    const [year, month] = normalized.split('-');
    const idx = parseInt(month, 10) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx > 11) {
        return null;
    }
    const labels = Array.isArray(window.MONTH_ABBREVIATIONS) ? window.MONTH_ABBREVIATIONS : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${labels[idx]}-${year.slice(-2)}`;
}

function transformNonSalesGroupResponse(response) {
    if (!response) {
        return null;
    }
    const data = response.data || response;
    const months = generateMonthList();
    const defaultGroup = Array.isArray(window.NON_SALES_GROUPS) && window.NON_SALES_GROUPS.length ? window.NON_SALES_GROUPS[0].key : 'non-sales';
    const groupKey = data.groupKey || AppState.currentNonSalesGroup || defaultGroup;

    const result = {
        groupKey,
        groupName: data.groupName || '',
        forecastStatus: {},
        teams: {},
        teamOrder: []
    };

    const labelLookup = {};
    if (Array.isArray(data.periods)) {
        data.periods.forEach(period => {
            const label = period?.label || monthLabelFromDate(period?.period_date);
            if (!label) {
                return;
            }
            result.forecastStatus[label] = period?.status === 'Forecast' ? 'Forecast' : 'Actual';
            const normalized = String(period.period_date).slice(0, 10);
            labelLookup[normalized] = label;
        });
    }

    months.forEach(month => {
        if (!result.forecastStatus[month]) {
            result.forecastStatus[month] = 'Forecast';
        }
    });

    if (Array.isArray(data.teams)) {
        data.teams.forEach(team => {
            const teamId = team.team_id || team.teamId;
            if (!Number.isFinite(teamId)) {
                return;
            }
            const teamName = team.team_name || team.teamName || `Team ${teamId}`;
            const values = {};
            const sourceValues = team.values || {};
            Object.entries(sourceValues).forEach(([periodDate, rawValue]) => {
                const normalized = String(periodDate).slice(0, 10);
                const label = labelLookup[normalized] || monthLabelFromDate(normalized);
                if (!label) {
                    return;
                }
                const numeric = typeof rawValue === 'number' ? rawValue : parseInt(rawValue, 10) || 0;
                values[label] = numeric;
            });
            months.forEach(month => {
                if (values[month] == null) {
                    values[month] = 0;
                }
            });
            result.teams[teamId] = { teamId, teamName, values };
            if (!result.teamOrder.includes(teamId)) {
                result.teamOrder.push(teamId);
            }
        });
    }

    return result;
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
    updateAdminButtonsVisibility();
    
    // Clear scroll positions to trigger Jan-24 scroll on new team
    AppState.scrollPositions = {
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
    };
    
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
        
        updateCurrentContextDisplay();
    }
    
    // Load team data
    await loadTeamData(teamNumber);
    
    // Restore scroll position
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

// Switch to group view
async function switchToGroup(groupName) {
    // Save current scroll position
    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[getScrollKeyForState()] = currentWrapper.scrollLeft;
    }
    
    AppState.currentGroup = groupName;
    AppState.isGroupView = true;
    updateAdminButtonsVisibility();
    
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
    
    updateCurrentContextDisplay();
    
    // Render the group data
    renderCurrentTab();
    
    // Restore scroll position
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

// Switch forecast version
async function switchForecast() {
    // Save current scroll position BEFORE switching
    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[getScrollKeyForState()] = currentWrapper.scrollLeft;
    }
    
    const forecastSelect = document.getElementById('forecastSelect');
    const versionId = parseInt(forecastSelect.value, 10);
    if (!Number.isFinite(versionId)) {
        return;
    }
    
    AppState.currentVersion = AppState.forecastVersions.find(v => v.version_id === versionId);
    if (!AppState.currentVersion) {
        console.warn('Selected forecast version not found');
        return;
    }
    AppState.currentForecast = AppState.currentVersion.version_name;
    updateSaveLockButtonVisibility();
    updateCurrentContextDisplay();
    
    await loadProductionConfig(AppState.currentVersion.version_id);
    
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
    const previousKey = getScrollKeyForState();
    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[previousKey] = currentWrapper.scrollLeft;
    }
    
    AppState.currentTab = tabName;
    updateAdminButtonsVisibility();
    updateGlobalLayoutState();
    updateTimelineViewButtonsVisibility(tabName);
    updateCurrentContextDisplay();
    
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
    const headcountToolbar = document.getElementById('headcount-toolbar');
    if (headcountToolbar) {
        headcountToolbar.style.display = (tabName === 'headcount') ? 'flex' : 'none';
    }

    const hcSubtabs = document.getElementById('headcount-subtabs');
    if (hcSubtabs) {
        hcSubtabs.style.display = (tabName === 'headcount') ? 'inline-flex' : 'none';
        // Ensure content panes visibility aligns with selected subtab
        const salesC = document.getElementById('sales-headcount-subtab');
        const nsC = document.getElementById('non-sales-headcount-subtab');
        if (tabName === 'headcount') {
            if (AppState.headcountSubtab === 'sales') { if (salesC) salesC.style.display=''; if (nsC) nsC.style.display='none'; }
            else { if (salesC) salesC.style.display='none'; if (nsC) nsC.style.display=''; }
        }
    }

    const headcountAdminButton = document.getElementById('headcount-admin-btn');
    if (headcountAdminButton && tabName !== 'headcount') {
        headcountAdminButton.style.display = 'none';
    }

    // Show/minimize production mini-tabs based on active tab
    const productionToolbar = document.getElementById('production-toolbar');
    if (productionToolbar) {
        productionToolbar.style.display = (tabName === 'production') ? 'flex' : 'none';
    }
    if (tabName === 'production') {
        const invC = document.getElementById('production-investments-subtab');
        updateProductionToolbarCaption(AppState.productionSubtab);
        const bankC = document.getElementById('production-banking-subtab');
        if (invC) {
            invC.style.display = AppState.productionSubtab === 'investments' ? '' : 'none';
        }
        if (bankC) {
            bankC.style.display = AppState.productionSubtab === 'banking' ? '' : 'none';
        }
        if (AppState.productionSubtab === 'investments') {
            scheduleBaselineLayoutSync();
        }
    }

    renderCurrentTab();
    
    // Restore scroll position
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const newWrapper = getActiveWrapper();
            const key = getScrollKeyForState();
            if (newWrapper && AppState.scrollPositions[key] !== undefined) {
                newWrapper.scrollLeft = AppState.scrollPositions[key];
            }
            applyLockedForecastUIState();
        });
    });
}

async function saveLockAndCloneForecastCycle() {
    if (!AppState.isAdmin) {
        showError('Only admins can save, lock, and clone forecast cycles.');
        return;
    }

    if (!AppState.currentVersion || !AppState.currentVersion.version_id) {
        showError('Select a forecast version first.');
        return;
    }

    if (AppState.currentVersion.is_locked) {
        showError('This forecast is already locked.');
        return;
    }

    if (hasBlockingValidationErrors()) {
        showError('Resolve highlighted validation errors before locking the forecast.');
        return;
    }

    if (API.hasPendingRequests()) {
        showError('Please wait for all pending saves to complete before locking.');
        return;
    }

    const currentName = AppState.currentVersion.version_name;
    const suggested = suggestNextCycleName(currentName);
    const nextVersionName = window.prompt(
        'Enter the name of the new cycle baseline:',
        suggested
    );

    if (nextVersionName == null) {
        return;
    }

    const trimmedName = String(nextVersionName).trim();
    if (!trimmedName) {
        showError('Next cycle name is required.');
        return;
    }

    const shouldProceed = window.confirm(
        `This will lock "${currentName}" and create "${trimmedName}" as a full copy.\n\nThis action cannot be undone.`
    );
    if (!shouldProceed) {
        return;
    }

    const typed = window.prompt(
        `Type "${SAVE_AND_LOCK_CONFIRMATION}" to confirm:`,
        ''
    );

    if (typed !== SAVE_AND_LOCK_CONFIRMATION) {
        showError('Confirmation text did not match. No changes were made.');
        return;
    }

    const saveLockButton = document.getElementById('saveLockForecastBtn');
    AppState.isSaveLockInProgress = true;
    if (saveLockButton) {
        saveLockButton.disabled = true;
    }

    try {
        showLoadingIndicator('Saving, locking, and creating next cycle...');
        const result = await API.forecasts.saveLockAndCloneCycle({
            sourceVersionId: AppState.currentVersion.version_id,
            nextVersionName: trimmedName,
            confirmationText: SAVE_AND_LOCK_CONFIRMATION,
            userEmail: AppState.currentUser
        });

        const versions = await API.forecasts.getVersions();
        AppState.forecastVersions = versions;

        const newVersionId = result?.data?.newVersionId;
        if (newVersionId) {
            AppState.currentVersion = versions.find(v => Number(v.version_id) === Number(newVersionId)) || versions[0] || null;
            AppState.currentForecast = AppState.currentVersion ? AppState.currentVersion.version_name : null;
        } else {
            AppState.currentVersion = versions[0] || null;
            AppState.currentForecast = AppState.currentVersion ? AppState.currentVersion.version_name : null;
        }

        initializeForecastSelector();
        if (AppState.currentVersion) {
            await switchForecast();
        }
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to save/lock/clone forecast cycle:', error);
        showError(error.message || 'Failed to save, lock, and clone forecast cycle.');
    } finally {
        hideLoadingIndicator();
        AppState.isSaveLockInProgress = false;
        updateSaveLockButtonVisibility();
    }
}

function updateAdminButtonsVisibility() {
    const productionAdminButton = document.getElementById('production-admin-btn');
    if (productionAdminButton) {
        const shouldShowProduction = AppState.currentTab === 'production' && !AppState.isGroupView;
        productionAdminButton.style.display = shouldShowProduction ? '' : 'none';
    }

    const incentiveAdminButton = document.getElementById('incentive-admin-btn');
    if (incentiveAdminButton) {
        const shouldShowIncentive = AppState.currentTab === 'incentive' && !AppState.isGroupView;
        incentiveAdminButton.style.display = shouldShowIncentive ? '' : 'none';
    }

    const referralAdminButton = document.getElementById('referral-admin-btn');
    if (referralAdminButton) {
        const shouldShowReferral = AppState.currentTab === 'referrals' && !AppState.isGroupView;
        referralAdminButton.style.display = shouldShowReferral ? '' : 'none';
    }

    updateSaveLockButtonVisibility();
}

// Toggle group collapse/expand
function toggleGroup(header) {
    header.classList.toggle('collapsed');
    const groupItems = header.nextElementSibling;
    groupItems.classList.toggle('collapsed');
    const arrow = header.querySelector('.arrow');
    if (arrow) {
        arrow.innerHTML = header.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
    }
}

// Render current tab
async function renderCurrentTab() {
    updateAdminButtonsVisibility();
    if (AppState.currentTab === 'headcount') {
        const subtabs = document.getElementById('headcount-subtabs');
        if (subtabs) {
            subtabs.style.display = 'inline-flex';
        }

        const toolbar = document.getElementById('headcount-toolbar');
        if (toolbar) {
            toolbar.style.display = 'flex';
        }

        const adminBtn = document.getElementById('headcount-admin-btn');
        if (adminBtn) {
            const shouldShowAdmin = AppState.headcountSubtab === 'sales' && !AppState.isGroupView;
            adminBtn.style.display = shouldShowAdmin ? '' : 'none';
        }

        if (AppState.headcountSubtab === 'non-sales') {
            AppState.teamCategory = 'non-sales';
            AppState.isGroupView = false;
            AppState.currentGroup = null;

    if (typeof initializeSidebar === 'function') {
        initializeSidebar();
    }
    if (typeof window.highlightSidebarSelection === 'function') {
        window.highlightSidebarSelection();
    }
    if (typeof window.updateCurrentTeamLabel === 'function') {
        window.updateCurrentTeamLabel();
    }

            const salesContainer = document.getElementById('sales-headcount-subtab');
            const nsContainer = document.getElementById('non-sales-headcount-subtab');
            if (salesContainer) salesContainer.style.display = 'none';
            if (nsContainer) nsContainer.style.display = '';

            const groupKey = AppState.currentNonSalesGroup || (NON_SALES_GROUPS.length ? NON_SALES_GROUPS[0].key : null);
            if (!groupKey) {
                if (nsContainer) {
                    nsContainer.innerHTML = "<div class='loading'>No non-sales groups configured.</div>";
                }
                return;
            }

            AppState.currentNonSalesGroup = groupKey;
            AppState.lastSelectedGroups = AppState.lastSelectedGroups || {};
            AppState.lastSelectedGroups.nonSales = groupKey;

            const forecastKey = AppState.currentForecast;
            if (!forecastKey) {
                if (nsContainer) {
                    nsContainer.innerHTML = "<div class='loading'>Select a forecast version to view non-sales headcount.</div>";
                }
                return;
            }

            if (!AppState.nonSalesData[forecastKey]) {
                AppState.nonSalesData[forecastKey] = {};
            }

            if (!AppState.nonSalesData[forecastKey][groupKey] || AppState.nonSalesData[forecastKey][groupKey].needsRefresh) {
                try {
                    const response = await API.nonSales.getGroup(groupKey, AppState.currentVersion?.version_id);
                    const groupData = transformNonSalesGroupResponse(response);
                    const preparedGroup = groupData || { groupKey, forecastStatus: {}, teams: {}, teamOrder: [] };
                    preparedGroup.needsRefresh = false;
                    AppState.nonSalesData[forecastKey][groupKey] = preparedGroup;
                } catch (error) {
                    console.error('Failed to load non-sales data:', error);
                    if (nsContainer) {
                        nsContainer.innerHTML = "<div class='loading'>Failed to load non-sales data.</div>";
                    }
                    return;
                }
            }

            const nsGroupData = AppState.nonSalesData[forecastKey][groupKey];
            if (!nsGroupData) {
                if (nsContainer) {
                    nsContainer.innerHTML = "<div class='loading'>Non-sales data unavailable.</div>";
                }
                return;
            }

            if (!AppState.lastSelectedTeams) {
                AppState.lastSelectedTeams = { sales: AppState.currentTeam || 1, nonSales: nsGroupData.teamOrder?.[0] || null };
            }
            if (!AppState.lastSelectedTeams.nonSales && nsGroupData.teamOrder?.length) {
                AppState.lastSelectedTeams.nonSales = nsGroupData.teamOrder[0];
            }
            if (!AppState.currentNonSalesTeam) {
                AppState.currentNonSalesTeam = AppState.lastSelectedTeams.nonSales || nsGroupData.teamOrder?.[0] || null;
            }

            renderNonSalesHeadcountTab(nsGroupData, { containerId: 'non-sales-headcount-subtab' });
            applyLockedForecastUIState();
            return;
        }

        // Sales headcount branch
        AppState.teamCategory = 'sales';
        AppState.isGroupView = false;
        AppState.currentGroup = null;

        if (typeof initializeSidebar === 'function') {
        initializeSidebar();
    }
        if (typeof window.highlightSidebarSelection === 'function') {
            window.highlightSidebarSelection(AppState.currentTeam);
        }
        if (typeof window.updateCurrentTeamLabel === 'function') {
            window.updateCurrentTeamLabel();
        }

        const salesContainer = document.getElementById('sales-headcount-subtab');
        const nsContainer = document.getElementById('non-sales-headcount-subtab');
        if (salesContainer) salesContainer.style.display = '';
        if (nsContainer) nsContainer.style.display = 'none';

        const forecastKey = AppState.currentForecast;
        if (!forecastKey) {
            if (salesContainer) {
                salesContainer.innerHTML = "<div class='loading'>Select a forecast version to view sales headcount.</div>";
            }
            return;
        }

        if (!AppState.lastSelectedTeams) {
            AppState.lastSelectedTeams = { sales: AppState.currentTeam || 1, nonSales: AppState.currentNonSalesTeam || null };
        }
        if (!Number.isFinite(AppState.currentTeam) || AppState.currentTeam >= 9000) {
            AppState.currentTeam = AppState.lastSelectedTeams.sales || 1;
        }
        AppState.lastSelectedTeams.sales = AppState.currentTeam;

        const teamKey = `Team ${AppState.currentTeam}`;
        if (!AppState.teamData[forecastKey]) {
            AppState.teamData[forecastKey] = {};
        }
        if (!AppState.teamData[forecastKey][teamKey]) {
            await loadTeamData(AppState.currentTeam);
        }
        const data = AppState.teamData[forecastKey][teamKey];
        if (!data) {
            console.warn('Sales data missing for team', teamKey, 'forecast', forecastKey);
            return;
        }

        renderHeadcountTab(data, { containerId: 'sales-headcount-subtab', mode: 'sales' });
        applyLockedForecastUIState();
        return;
    }

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
        case 'production': {
            const hcSubtabs = document.getElementById('headcount-subtabs');
            if (hcSubtabs) hcSubtabs.style.display = 'none';

            const productionToolbar = document.getElementById('production-toolbar');
            if (productionToolbar) productionToolbar.style.display = 'flex';

            updateProductionToolbarCaption(AppState.productionSubtab);

            const invC = document.getElementById('production-investments-subtab');
            const bankC = document.getElementById('production-banking-subtab');

            if (AppState.productionSubtab === 'investments') {
                if (invC) invC.style.display = '';
                if (bankC) bankC.style.display = 'none';
                renderProductionTab(data, { containerId: 'production-investments-subtab', mode: 'investments' });
                setTimeout(validateAllProductMix, 100);
                scheduleBaselineLayoutSync();
            } else {
                if (invC) invC.style.display = 'none';
                if (bankC) bankC.style.display = '';
                renderProductionTab(data, { containerId: 'production-banking-subtab', mode: 'banking' });
            }
            break;
        }
        case 'referrals':
            await renderReferralsTab(data);
            break;
        case 'incentive':
            renderIncentiveTab(data);
            break;
        case 'kmpc':
            await renderKMPCTab(data);
            break;
        case 'finance':
            await renderFinanceTab(data);
            break;
    }

    applyLockedForecastUIState();
}

// Handle headcount changes
async function handleHeadcountChange(input) {
    if (!input) {
        return;
    }
    const month = input.dataset.month;
    const pg = input.dataset.pg;
    const team = input.dataset.team;
    const raw = (input.value || '').trim();

    if (!month || !pg || !team) {
        return;
    }

    if (raw === '' || raw === '-') {
        input.classList.add('invalid-input');
        return;
    }

    const forecastKey = AppState.currentForecast;
    const teamKey = `Team ${team}`;
    const teamStore = AppState.teamData?.[forecastKey]?.[teamKey];
    if (!teamStore || !teamStore.pgLevels?.[pg]) {
        return;
    }

    const previousValue = Number(teamStore.pgLevels[pg][month] ?? 0);
    const parsedValue = parseInt(raw, 10);
    const value = Number.isFinite(parsedValue) ? parsedValue : 0;

    const ending = Number(teamStore.headcountFlows?.ending_headcount?.[month]);
    if (Number.isFinite(ending) && ending >= 0) {
        const pgLevels = teamStore.pgLevels || {};
        let total = 0;
        Object.keys(pgLevels).forEach(key => {
            const current = Number(pgLevels[key]?.[month] ?? 0);
            total += key === pg ? value : current;
        });
        if (total > ending) {
            input.value = previousValue;
            input.classList.add('invalid-input');
            showError(`Total productive headcount (${total}) cannot exceed ending headcount (${ending}).`);
            return;
        }
    }

    input.classList.remove('invalid-input');

    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        AppState.undoStack.push({
            type: 'headcountChange',
            data: { team, pg, month, previousValue, newValue: value },
            context: { tab: 'headcount', subtab: 'sales' }
        });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }

    teamStore.pgLevels[pg][month] = value;
    updateHeadcountTotals(team, month);
    updateProductionCalculations(team, month);

    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        try {
            const fieldName = `pg${pg.substring(2)}_headcount`;
            await API.forecasts.updateData({
                teamId: parseInt(team),
                periodDate: getPeriodDate(month),
                versionId: AppState.currentVersion.version_id,
                field: fieldName,
                value,
                updatedBy: AppState.currentUser
            });

            showSaveIndicator();
        } catch (error) {
            console.error('Failed to save change:', error);
            showError('Failed to save change');
        }
    }
}

async function handleHeadcountFlowChange(input) {
    if (!input) return;

    const month = input.dataset.month;
    const flowKey = input.dataset.flowKey;
    const team = input.dataset.team;

    if (!month || !flowKey || !team) return;

    const raw = (input.value || '').trim();
    const numeric = raw === '' || raw === '-' ? 0 : Number(raw);
    if (!Number.isFinite(numeric)) {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');

    const teamKey = `Team ${team}`;
    const teamStore = AppState.teamData?.[AppState.currentForecast]?.[teamKey];
    if (!teamStore || !teamStore.headcountFlows || !teamStore.headcountFlows[flowKey]) {
        return;
    }

    const previousValue = Number(teamStore.headcountFlows[flowKey][month] ?? 0);
    teamStore.headcountFlows[flowKey][month] = numeric;
    updateHeadcountFlowDerived(team, month);

    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        AppState.undoStack.push({
            type: 'headcountFlowChange',
            data: { team, flowKey, month, previousValue, newValue: numeric },
            context: { tab: 'headcount', subtab: 'sales' }
        });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }

    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        try {
            await API.headcountFlows.bulkUpdate({
                updates: [{
                    teamId: parseInt(team, 10),
                    periodDate: getPeriodDate(month),
                    field: flowKey,
                    value: numeric,
                    dataType: 'forecast',
                    versionId: AppState.currentVersion?.version_id,
                    updatedBy: AppState.currentUser
                }]
            });
            showSaveIndicator();
        } catch (error) {
            console.error('Failed to save headcount flow change:', error);
            showError('Failed to save headcount flow');
        }
    }
}

async function handleProductionChange(input) {
    if (!input) return;

    const month = input.dataset.month;
    const team = input.dataset.team;
    const metric = input.dataset.metric;
    const product = input.dataset.product;
    const rawIn = (input.value || '').trim();

    if (!month || !team || !metric) {
        return;
    }

    if (rawIn === '' || rawIn === '-') {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');

    const teamKey = `Team ${team}`;
    const teamData = AppState.teamData[AppState.currentForecast]?.[teamKey];
    if (!teamData) {
        return;
    }

    let value;

    if (metric === 'productivity') {
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = toNumber(teamData.productivity[month], 0);
        }
        value = Number(value.toFixed(2));
        input.value = value.toFixed(2);
    } else if (metric === 'mix') {
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = toNumber(teamData.productMix[product][month], 0) * 100;
        }
        value = clamp(value, 0, 100);
        input.value = value.toFixed(1);
    } else if (metric === 'abpa') {
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = toNumber(teamData.abpa[product][month], 0) / 1000;
        }
        value = Math.max(0, Math.round(value));
        input.value = String(value);
        value = value * 1000;
    } else if (metric === 'deepening-percent') {
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = toNumber((teamData.deepening?.percent?.[month] || 0) * 100, 0);
        }
        value = clamp(value, 0, 100);
        input.value = value.toFixed(1);
    } else {
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = 0;
        }
    }

    let previousValue;
    if (metric === 'productivity') {
        previousValue = toNumber(teamData.productivity[month], 0);
    } else if (metric === 'mix') {
        previousValue = toNumber(teamData.productMix[product][month], 0) * 100;
    } else if (metric === 'abpa') {
        previousValue = toNumber(teamData.abpa[product][month], 0);
    } else if (metric === 'deepening-percent') {
        previousValue = toNumber((teamData.deepening?.percent?.[month] || 0) * 100, 0);
    } else {
        previousValue = null;
    }

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

    if (metric === 'productivity') {
        teamData.productivity[month] = value.toFixed(2);
    } else if (metric === 'mix') {
        teamData.productMix[product][month] = value / 100;
    } else if (metric === 'abpa') {
        teamData.abpa[product][month] = value;
    } else if (metric === 'deepening-percent') {
        if (!teamData.deepening) {
            teamData.deepening = { amount: {}, percent: {} };
        } else {
            teamData.deepening.percent = teamData.deepening.percent || {};
            teamData.deepening.amount = teamData.deepening.amount || {};
        }
        teamData.deepening.percent[month] = value / 100;
    }

    updateProductionCalculations(team, month);

    let fieldName;
    let dbValue = value;
    if (metric === 'productivity') {
        fieldName = 'productivity';
    } else if (metric === 'mix') {
        const productLetter = product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_mix`;
        dbValue = value / 100;
    } else if (metric === 'abpa') {
        const productLetter = product.split(' ')[1].toLowerCase();
        fieldName = `product_${productLetter}_abpa`;
    } else if (metric === 'deepening-percent') {
        fieldName = 'deepening_percent';
        dbValue = value / 100;
    }

    if (!AppState.isBulkPasting && fieldName) {
        try {
            await API.forecasts.updateData({
                teamId: parseInt(team, 10),
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

async function handleReferralProductivityChange(input) {
    if (!input) return;

    const month = input.dataset.month;
    const team = input.dataset.team;
    const flowKey = input.dataset.flowKey;
    if (!month || !team || !flowKey) {
        return;
    }

    const rawIn = (input.value || '').trim();
    if (rawIn === '' || rawIn === '-') {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');

    const teamKey = `Team ${team}`;
    const teamData = AppState.teamData[AppState.currentForecast]?.[teamKey];
    if (!teamData || !teamData.referrals?.outbound?.[flowKey]) {
        return;
    }

    let value = Number.parseFloat(rawIn);
    if (!Number.isFinite(value)) {
        value = Number.parseFloat(teamData.referrals.outbound[flowKey].productivity[month] || 0);
    }
    value = Number(value.toFixed(2));
    input.value = value.toFixed(2);

    teamData.referrals.outbound[flowKey].productivity[month] = value.toFixed(2);
    updateReferralCalculations(team, month, flowKey);

    if (!AppState.currentVersion) {
        return;
    }

    try {
        await API.forecasts.updateData({
            teamId: parseInt(team, 10),
            periodDate: getPeriodDate(month),
            versionId: AppState.currentVersion.version_id,
            field: `ref_out_${flowKey}_prod`,
            value,
            updatedBy: AppState.currentUser
        });
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to save referral productivity change:', error);
        showError('Failed to save referral productivity');
    }
}

async function handleAdditionalProductChange(input) {
    if (!input) return;

    const month = input.dataset.month;
    const product = input.dataset.product;
    const metric = input.dataset.metric;
    const team = input.dataset.team;
    const rawIn = (input.value || '').trim();

    if (!month || !team || !product || !metric) {
        return;
    }

    if (rawIn === '' || rawIn === '-') {
        input.classList.add('invalid-input');
        return;
    }
    input.classList.remove('invalid-input');

    const teamKey = `Team ${team}`;
    const teamData = AppState.teamData[AppState.currentForecast]?.[teamKey];
    if (!teamData || !teamData.additionalProducts || !teamData.additionalProducts[product]) {
        return;
    }

    const productData = teamData.additionalProducts[product];
    let value;
    let previousValue = null;

    if (metric === 'additional-productivity') {
        previousValue = toNumber(productData.productivity[month], 0);
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = previousValue;
        }
        value = Number(value.toFixed(2));
        input.value = value.toFixed(2);
        productData.productivity[month] = value.toFixed(2);
    } else if (metric === 'additional-abpa') {
        previousValue = toNumber(productData.abpa[month], 0);
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = previousValue / 1000;
        }
        value = Math.max(0, Math.round(value));
        input.value = String(value);
        value = value * 1000;
        productData.abpa[month] = value;
    } else {
        value = Number(rawIn);
        if (!Number.isFinite(value)) {
            value = 0;
        }
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

    updateAdditionalProductCalculations(team, month, product);

    let fieldName;
    let dbValue = value;
    if (metric === 'additional-productivity') {
        fieldName = `product_${product.toLowerCase()}_productivity`;
    } else if (metric === 'additional-abpa') {
        fieldName = `product_${product.toLowerCase()}_abpa`;
    }

    if (!AppState.isBulkPasting && fieldName) {
        try {
            await API.forecasts.updateData({
                teamId: parseInt(team, 10),
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
    const abpaCell = document.getElementById(`additional-abpa-${product}-${month}`);
    if (abpaCell) {
        const inputEl = abpaCell.querySelector('input');
        if (inputEl) {
            inputEl.value = String(Math.round(abpa / 1000));
        } else {
            abpaCell.innerHTML = `${formatThousands(abpa, 0)}<span class='table-value-suffix'>K</span>`;
        }
    }

    // Calculations mirror render-tables.js
    const accounts = Math.round((headcount * weeklyProd * businessDays) / 5);
    const balance = accounts * abpa;

    // Update UI cells if present
    const accCell = document.getElementById(`additional-accounts-${product}-${month}`);
    if (accCell) accCell.textContent = (accounts).toLocaleString();
    const balCell = document.getElementById(`additional-balance-${product}-${month}`);
    if (balCell) balCell.textContent = `$${(balance / 1_000_000).toFixed(1)}M`;

    if (typeof recalculateBankingTotals === 'function') {
        recalculateBankingTotals(team);
    }
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
            const input = document.querySelector(`#${containerId} input[data-month='${month}'][data-pg='${pg}'][data-team='${team}']`);
            if (input) input.value = parseInt(previousValue) || 0;
            updateHeadcountTotals(team, month);
            updateProductionCalculations(team, month);
        };
        requestAnimationFrame(() => { renderCurrentTab(); requestAnimationFrame(setValUndo); });
    } else if (action.type === 'headcountFlowChange') {
        const { team, flowKey, month, previousValue } = action.data;
        const teamKey = `Team ${team}`;
        const flows = AppState.teamData[AppState.currentForecast][teamKey]?.headcountFlows;
        if (flows && flows[flowKey]) {
            flows[flowKey][month] = Number(previousValue) || 0;
        }
        const applyFlowUndo = () => {
            const selector = `#sales-headcount-subtab input[data-month='${month}'][data-flow-key='${flowKey}'][data-team='${team}']`;
            const inputEl = document.querySelector(selector);
            if (inputEl) {
                inputEl.value = Number(previousValue) || 0;
            }
            const displayCell = document.querySelector(`td[data-flow-team='${team}'][data-flow-key='${flowKey}'][data-month='${month}']`);
            if (displayCell) displayCell.textContent = Number(previousValue) || 0;
            updateHeadcountFlowDerived(team, month);
        };
        requestAnimationFrame(() => {
            renderCurrentTab();
            requestAnimationFrame(applyFlowUndo);
        });
    } else if (action.type === 'nonSalesHeadcountChange') {
        const { groupKey, teamId, month, previousValue } = action.data;
        const versionKey = AppState.currentForecast;
        const groupStore = AppState.nonSalesData?.[versionKey]?.[groupKey];
        if (groupStore && groupStore.teams?.[teamId]) {
            if (!groupStore.teams[teamId].values) {
                groupStore.teams[teamId].values = {};
            }
            groupStore.teams[teamId].values[month] = previousValue ?? 0;
            const totalCell = document.getElementById(`ns-headcount-total-${groupKey}-${month}`);
            if (totalCell) {
                const total = (groupStore.teamOrder || Object.keys(groupStore.teams)).reduce((sum, id) => {
                    const entry = groupStore.teams[id];
                    return sum + (entry?.values?.[month] ?? 0);
                }, 0);
                totalCell.textContent = total;
            }
        }
        requestAnimationFrame(() => {
            renderCurrentTab();
            requestAnimationFrame(() => {
                const selector = `#non-sales-headcount-subtab input[data-month='${month}'][data-group='${groupKey}'][data-team-id='${teamId}']`;
                const inputEl = document.querySelector(selector);
                if (inputEl) inputEl.value = previousValue ?? 0;
                const totalCell = document.getElementById(`ns-headcount-total-${groupKey}-${month}`);
                if (totalCell && groupStore) {
                    const total = (groupStore.teamOrder || Object.keys(groupStore.teams)).reduce((sum, id) => {
                        const entry = groupStore.teams[id];
                        return sum + (entry?.values?.[month] ?? 0);
                    }, 0);
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
            const input = document.querySelector(`input[data-month='${month}'][data-metric='productivity'][data-team='${team}']`);
            if (input) input.value = parseFloat(previousValue).toFixed(2);
        } else if (metric === 'mix') {
            AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = previousValue / 100;
            // Update the input directly
            const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='mix'][data-team='${team}']`);
            if (input) input.value = previousValue;
        } else if (metric === 'abpa') {
            AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = previousValue;
            // Update the input directly
            const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='abpa'][data-team='${team}']`);
            if (input) input.value = String(Math.round((previousValue || 0) / 1000));
        } else if (metric === 'deepening-percent') {
            if (!AppState.teamData[AppState.currentForecast][teamKey].deepening) {
                AppState.teamData[AppState.currentForecast][teamKey].deepening = { amount: {}, percent: {} };
            }
            AppState.teamData[AppState.currentForecast][teamKey].deepening.percent[month] = (parseFloat(previousValue) || 0) / 100;
            const input = document.querySelector(`input[data-month='${month}'][data-metric='deepening-percent'][data-team='${team}']`);
            if (input) input.value = parseFloat(previousValue || 0).toFixed(1);
        }
        
        updateProductionCalculations(team, month);
    } else if (action.type === 'additionalProductChange') {
        const { team, month, product, metric, previousValue } = action.data;
        const teamKey = `Team ${team}`;
        
        if (metric === 'additional-productivity') {
            AppState.teamData[AppState.currentForecast][teamKey]
                .additionalProducts[product].productivity[month] = parseFloat(previousValue).toFixed(2);
            // Update the input directly
            const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-productivity'][data-team='${team}']`);
            if (input) input.value = parseFloat(previousValue).toFixed(2);
        } else if (metric === 'additional-abpa') {
            AppState.teamData[AppState.currentForecast][teamKey]
                .additionalProducts[product].abpa[month] = parseInt(previousValue);
            // Update the input directly
            const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-abpa'][data-team='${team}']`);
            if (input) input.value = String(Math.round((previousValue || 0) / 1000));
        }
        
        updateAdditionalProductCalculations(team, month, product);
    } else if (action.type === 'percentageChange' || action.type === 'baselineApply') {
        action.data.forEach(state => {
            const teamKey = `Team ${state.team}`;
            
            if (state.metric === 'productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].productivity[state.month] = parseFloat(state.previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month='${state.month}'][data-metric='productivity'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(state.previousValue).toFixed(2);
            } else if (state.metric === 'mix') {
                AppState.teamData[AppState.currentForecast][teamKey].productMix[state.product][state.month] = parseFloat(state.previousValue) / 100;
                const input = document.querySelector(`input[data-month='${state.month}'][data-product='${state.product}'][data-metric='mix'][data-team='${state.team}']`);
                if (input) input.value = state.previousValue;
            } else if (state.metric === 'abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].abpa[state.product][state.month] = parseInt(state.previousValue);
                const input = document.querySelector(`input[data-month='${state.month}'][data-product='${state.product}'][data-metric='abpa'][data-team='${state.team}']`);
                if (input) input.value = String(Math.round((state.previousValue || 0) / 1000));
            } else if (state.metric === 'deepening-percent' || state.metric === 'deepening_percent') {
                if (!AppState.teamData[AppState.currentForecast][teamKey].deepening) {
                    AppState.teamData[AppState.currentForecast][teamKey].deepening = { amount: {}, percent: {} };
                }
                AppState.teamData[AppState.currentForecast][teamKey].deepening.percent[state.month] = (parseFloat(state.previousValue) || 0) / 100;
                const input = document.querySelector(`input[data-month='${state.month}'][data-metric='deepening-percent'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(state.previousValue || 0).toFixed(1);
            } else if (state.metric === 'additional-productivity') {
                AppState.teamData[AppState.currentForecast][teamKey]
                    .additionalProducts[state.product].productivity[state.month] = parseFloat(state.previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month='${state.month}'][data-product='${state.product}'][data-metric='additional-productivity'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(state.previousValue).toFixed(2);
            } else if (state.metric === 'additional-abpa') {
                AppState.teamData[AppState.currentForecast][teamKey]
                    .additionalProducts[state.product].abpa[state.month] = parseInt(state.previousValue);
                const input = document.querySelector(`input[data-month='${state.month}'][data-product='${state.product}'][data-metric='additional-abpa'][data-team='${state.team}']`);
                if (input) input.value = String(Math.round((state.previousValue || 0) / 1000));
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
            const flowKey = state.flow;
            const previousValue = state.previousValue;

            if (metric === 'headcount') {
                AppState.teamData[AppState.currentForecast][`Team ${state.team}`].pgLevels[pg][month] = parseInt(previousValue) || 0;
                updateHeadcountTotals(state.team, month);
                updateProductionCalculations(state.team, month);
                const input = document.querySelector(`input[data-month='${month}'][data-pg='${pg}'][data-team='${state.team}']`);
                if (input) input.value = parseInt(previousValue) || 0;
            } else if (metric === 'productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month='${month}'][data-metric='productivity'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(previousValue).toFixed(2);
                updateProductionCalculations(state.team, month);
            } else if (metric === 'mix') {
                AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = (parseFloat(previousValue) || 0) / 100;
                const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='mix'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(previousValue) || 0;
                updateProductionCalculations(state.team, month);
            } else if (metric === 'abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = parseFloat(previousValue) || 0;
                const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='abpa'][data-team='${state.team}']`);
                if (input) input.value = String(Math.round((previousValue || 0) / 1000));
                updateProductionCalculations(state.team, month);
            } else if (metric === 'deepening-percent' || metric === 'deepening_percent') {
                if (!AppState.teamData[AppState.currentForecast][teamKey].deepening) {
                    AppState.teamData[AppState.currentForecast][teamKey].deepening = { amount: {}, percent: {} };
                }
                AppState.teamData[AppState.currentForecast][teamKey].deepening.percent[month] = (parseFloat(previousValue) || 0) / 100;
                const input = document.querySelector(`input[data-month='${month}'][data-metric='deepening-percent'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(previousValue || 0).toFixed(1);
                updateProductionCalculations(state.team, month);
            } else if (metric === 'additional-productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].productivity[month] = parseFloat(previousValue).toFixed(2);
                const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-productivity'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(previousValue).toFixed(2);
                updateAdditionalProductCalculations(state.team, month, product);
            } else if (metric === 'additional-abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].abpa[month] = parseFloat(previousValue) || 0;
                const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-abpa'][data-team='${state.team}']`);
                if (input) input.value = String(Math.round((previousValue || 0) / 1000));
                updateAdditionalProductCalculations(state.team, month, product);
            } else if (metric === 'headcount-flow') {
                const flows = AppState.teamData[AppState.currentForecast][teamKey].headcountFlows;
                if (flows && flowKey) {
                    if (!flows[flowKey]) flows[flowKey] = {};
                    flows[flowKey][month] = parseFloat(previousValue) || 0;
                }
                const input = document.querySelector(`input[data-month='${month}'][data-flow-key='${flowKey}'][data-team='${state.team}']`);
                if (input) input.value = parseFloat(previousValue) || 0;
                updateHeadcountFlowDerived(state.team, month);
            }
        });
    }
    
    // Persist undo to DB in bulk
    try {
        const updates = [];
        const flowUpdates = [];
        if (action.type === 'headcountChange') {
            const { team, pg, month, previousValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState('headcount', null, pg, previousValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'headcountFlowChange') {
            const { team, flowKey, month, previousValue } = action.data;
            const teamId = parseInt(team);
            flowUpdates.push({
                teamId,
                periodDate: getPeriodDate(month),
                field: flowKey,
                value: Number(previousValue) || 0,
                dataType: 'forecast',
                versionId: AppState.currentVersion?.version_id,
                updatedBy: AppState.currentUser
            });
        } else if (action.type === 'productionChange') {
            const { team, month, metric, product, previousValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, previousValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'additionalProductChange') {
            const { team, month, product, metric, previousValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, previousValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'percentageChange' || action.type === 'bulkPaste' || action.type === 'baselineApply') {
            const states = action.data || [];
            states.forEach(state => {
                const { fieldName, dbValue } = getFieldAndDbValueFromState(state.metric, state.product, state.pg, state.previousValue, state.flow);
                if (!fieldName) return;
                if (state.metric === 'headcount-flow') {
                    const teamId = parseInt(state.team);
                    flowUpdates.push({
                        teamId,
                        periodDate: getPeriodDate(state.month),
                        field: fieldName,
                        value: dbValue,
                        dataType: 'forecast',
                        versionId: AppState.currentVersion?.version_id,
                        updatedBy: AppState.currentUser
                    });
                } else {
                    updates.push({ teamId: parseInt(state.team), periodDate: getPeriodDate(state.month), field: fieldName, newValue: dbValue });
                }
            });
        }
        const promises = [];
        const showBusy = (updates.length + flowUpdates.length) > 50;
        if (showBusy) showLoadingIndicator('Updating...');
        if (updates.length > 0) {
            promises.push(API.forecasts.bulkUpdate({
                updates,
                versionId: AppState.currentVersion.version_id,
                updatedBy: AppState.currentUser
            }));
        }
        if (flowUpdates.length > 0) {
            promises.push(API.headcountFlows.bulkUpdate({
                updates: flowUpdates,
                updatedBy: AppState.currentUser
            }));
        }
        if (promises.length > 0) {
            Promise.all(promises).then(() => {
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
        const flowUpdates = [];
        if (action.type === 'headcountChange') {
            const { team, pg, month, newValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState('headcount', null, pg, newValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'headcountFlowChange') {
            const { team, flowKey, month, newValue } = action.data;
            flowUpdates.push({
                teamId: parseInt(team),
                periodDate: getPeriodDate(month),
                field: flowKey,
                value: Number(newValue) || 0,
                dataType: 'forecast',
                versionId: AppState.currentVersion?.version_id,
                updatedBy: AppState.currentUser
            });
        } else if (action.type === 'productionChange') {
            const { team, month, metric, product, newValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, newValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'additionalProductChange') {
            const { team, month, product, metric, newValue } = action.data;
            const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, null, newValue);
            updates.push({ teamId: parseInt(team), periodDate: getPeriodDate(month), field: fieldName, newValue: dbValue });
        } else if (action.type === 'percentageChange' || action.type === 'bulkPaste' || action.type === 'baselineApply') {
            const states = action.data || [];
            states.forEach(state => {
                const { fieldName, dbValue } = getFieldAndDbValueFromState(state.metric, state.product, state.pg, state.newValue, state.flow);
                if (!fieldName) return;
                if (state.metric === 'headcount-flow') {
                    flowUpdates.push({
                        teamId: parseInt(state.team),
                        periodDate: getPeriodDate(state.month),
                        field: fieldName,
                        value: dbValue,
                        dataType: 'forecast',
                        versionId: AppState.currentVersion?.version_id,
                        updatedBy: AppState.currentUser
                    });
                } else {
                    updates.push({ teamId: parseInt(state.team), periodDate: getPeriodDate(state.month), field: fieldName, newValue: dbValue });
                }
            });
        }
        const promises = [];
        const showBusy = (updates.length + flowUpdates.length) > 50;
        if (showBusy) showLoadingIndicator('Updating...');
        if (updates.length > 0) {
            promises.push(API.forecasts.bulkUpdate({
                updates,
                versionId: AppState.currentVersion.version_id,
                updatedBy: AppState.currentUser
            }));
        }
        if (flowUpdates.length > 0) {
            promises.push(API.headcountFlows.bulkUpdate({
                updates: flowUpdates,
                updatedBy: AppState.currentUser
            }));
        }
        if (promises.length > 0) {
            Promise.all(promises).then(() => {
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
      const input = document.querySelector(`#${containerId} input[data-month='${month}'][data-pg='${pg}'][data-team='${team}']`);
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

  } else if (action.type === 'headcountFlowChange') {
    const { team, flowKey, month, newValue } = action.data;
    const teamKey = `Team ${team}`;
    const flows = AppState.teamData[AppState.currentForecast][teamKey]?.headcountFlows;
    if (flows && flows[flowKey]) {
      flows[flowKey][month] = Number(newValue) || 0;
    }
    const applyFlowRedo = () => {
      const selector = `#sales-headcount-subtab input[data-month='${month}'][data-flow-key='${flowKey}'][data-team='${team}']`;
      const inputEl = document.querySelector(selector);
      if (inputEl) {
        AppState.isProgrammaticChange = true;
        inputEl.value = Number(newValue) || 0;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        AppState.isProgrammaticChange = false;
      } else {
        const displayCell = document.querySelector(`td[data-flow-team='${team}'][data-flow-key='${flowKey}'][data-month='${month}']`);
        if (displayCell) displayCell.textContent = Number(newValue) || 0;
        updateHeadcountFlowDerived(team, month);
      }
    };
    requestAnimationFrame(() => {
      renderCurrentTab();
      requestAnimationFrame(applyFlowRedo);
    });

    const flowTeamId = parseInt(team);
    bulk.push({
      teamId: flowTeamId,
      periodDate: getPeriodDate(month),
      field: flowKey,
      value: Number(newValue) || 0,
      dataType: 'forecast',
      versionId: AppState.currentVersion?.version_id,
      updatedBy: AppState.currentUser,
      _flow: true
    });

  } else if (action.type === 'nonSalesHeadcountChange') {
    const { groupKey, teamId, month, newValue } = action.data;
    const versionKey = AppState.currentForecast;
    const groupStore = AppState.nonSalesData?.[versionKey]?.[groupKey];
    if (groupStore && groupStore.teams?.[teamId]) {
      if (!groupStore.teams[teamId].values) {
        groupStore.teams[teamId].values = {};
      }
      groupStore.teams[teamId].values[month] = newValue ?? 0;
      const totalCell = document.getElementById(`ns-headcount-total-${groupKey}-${month}`);
      if (totalCell) {
        const total = (groupStore.teamOrder || Object.keys(groupStore.teams)).reduce((sum, id) => {
          const entry = groupStore.teams[id];
          return sum + (entry?.values?.[month] ?? 0);
        }, 0);
        totalCell.textContent = total;
      }
    }
    const applyValue = () => {
      const selector = `#non-sales-headcount-subtab input[data-month='${month}'][data-group='${groupKey}'][data-team-id='${teamId}']`;
      const inputEl = document.querySelector(selector);
      if (inputEl) {
        AppState.isProgrammaticChange = true;
        inputEl.value = newValue ?? 0;
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        AppState.isProgrammaticChange = false;
      }
    };
    applyValue();
    requestAnimationFrame(() => requestAnimationFrame(applyValue));

    bulk.push({
      teamId: parseInt(teamId),
      periodDate: getPeriodDate(month),
      value: parseInt(newValue) || 0,
      _ns: true
    });

  } else if (action.type === 'productionChange') {
    const { team, month, metric, product, newValue } = action.data;
    const teamKey = `Team ${team}`;
    let fieldName, dbValue = newValue;

    if (metric === 'productivity') {
      AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(newValue).toFixed(2);
      const input = document.querySelector(`input[data-month='${month}'][data-metric='productivity'][data-team='${team}']`);
      if (input) input.value = parseFloat(newValue).toFixed(2);
      fieldName = 'productivity';
    } else if (metric === 'mix') {
      AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = newValue / 100;
      const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='mix'][data-team='${team}']`);
      if (input) input.value = newValue;
      const letter = product.split(' ')[1].toLowerCase();
      fieldName = `product_${letter}_mix`;
      dbValue = newValue / 100; // store as decimal
    } else if (metric === 'abpa') {
      AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = newValue;
      const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='abpa'][data-team='${team}']`);
      if (input) input.value = formatNumber(newValue);
      const letter = product.split(' ')[1].toLowerCase();
      fieldName = `product_${letter}_abpa`;
    } else if (metric === 'deepening-percent') {
      if (!AppState.teamData[AppState.currentForecast][teamKey].deepening) {
        AppState.teamData[AppState.currentForecast][teamKey].deepening = { amount: {}, percent: {} };
      }
      AppState.teamData[AppState.currentForecast][teamKey].deepening.percent[month] = (parseFloat(newValue) || 0) / 100;
      const input = document.querySelector(`input[data-month='${month}'][data-metric='deepening-percent'][data-team='${team}']`);
      if (input) input.value = parseFloat(newValue || 0).toFixed(1);
      fieldName = 'deepening_percent';
      dbValue = (parseFloat(newValue) || 0) / 100;
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
      const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-productivity'][data-team='${team}']`);
      if (input) input.value = parseFloat(newValue).toFixed(2);
      fieldName = `product_${product.toLowerCase()}_productivity`;
    } else if (metric === 'additional-abpa') {
      AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].abpa[month] = parseInt(newValue);
      const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-abpa'][data-team='${team}']`);
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

  } else if (action.type === 'percentageChange' || action.type === 'bulkPaste' || action.type === 'baselineApply') {
    // Re-apply all pasted/percentage changes and persist once
    (action.data || []).forEach(state => {
      const teamKey = `Team ${state.team}`;
      const month = state.month;
      const metric = state.metric;
      const product = state.product;
      const pg = state.pg;
      const flowKey = state.flow;
      const val = state.newValue;

      if (metric === 'headcount') {
        AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month] = parseInt(val) || 0;
        const input = document.querySelector(`input[data-month='${month}'][data-pg='${pg}'][data-team='${state.team}']`);
        if (input) input.value = parseInt(val) || 0;
        updateHeadcountTotals(state.team, month);
        updateProductionCalculations(state.team, month);
      } else if (metric === 'productivity') {
        AppState.teamData[AppState.currentForecast][teamKey].productivity[month] = parseFloat(val).toFixed(2);
        const input = document.querySelector(`input[data-month='${month}'][data-metric='productivity'][data-team='${state.team}']`);
        if (input) input.value = parseFloat(val).toFixed(2);
        updateProductionCalculations(state.team, month);
      } else if (metric === 'mix') {
        AppState.teamData[AppState.currentForecast][teamKey].productMix[product][month] = (parseFloat(val) || 0) / 100;
        const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='mix'][data-team='${state.team}']`);
        if (input) input.value = parseFloat(val) || 0;
        updateProductionCalculations(state.team, month);
      } else if (metric === 'abpa') {
        AppState.teamData[AppState.currentForecast][teamKey].abpa[product][month] = parseFloat(val) || 0;
        const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='abpa'][data-team='${state.team}']`);
        if (input) input.value = String(Math.round((val || 0) / 1000));
        updateProductionCalculations(state.team, month);
      } else if (metric === 'deepening-percent' || metric === 'deepening_percent') {
        if (!AppState.teamData[AppState.currentForecast][teamKey].deepening) {
          AppState.teamData[AppState.currentForecast][teamKey].deepening = { amount: {}, percent: {} };
        }
        AppState.teamData[AppState.currentForecast][teamKey].deepening.percent[month] = (parseFloat(val) || 0) / 100;
        const input = document.querySelector(`input[data-month='${month}'][data-metric='deepening-percent'][data-team='${state.team}']`);
        if (input) input.value = parseFloat(val || 0).toFixed(1);
        updateProductionCalculations(state.team, month);
      } else if (metric === 'additional-productivity') {
        AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].productivity[month] = parseFloat(val).toFixed(2);
        const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-productivity'][data-team='${state.team}']`);
        if (input) input.value = parseFloat(val).toFixed(2);
        updateAdditionalProductCalculations(state.team, month, product);
      } else if (metric === 'additional-abpa') {
        AppState.teamData[AppState.currentForecast][teamKey].additionalProducts[product].abpa[month] = parseFloat(val) || 0;
        const input = document.querySelector(`input[data-month='${month}'][data-product='${product}'][data-metric='additional-abpa'][data-team='${state.team}']`);
        if (input) input.value = String(Math.round((val || 0) / 1000));
        updateAdditionalProductCalculations(state.team, month, product);
      } else if (metric === 'headcount-flow') {
        const flows = AppState.teamData[AppState.currentForecast][teamKey].headcountFlows;
        if (flows && flowKey) {
          if (!flows[flowKey]) flows[flowKey] = {};
          flows[flowKey][month] = parseFloat(val) || 0;
        }
        const input = document.querySelector(`input[data-month='${month}'][data-flow-key='${flowKey}'][data-team='${state.team}']`);
        if (input) input.value = parseFloat(val) || 0;
        updateHeadcountFlowDerived(state.team, month);
      }

      // Build bulk persist field names/values
      const { fieldName, dbValue } = getFieldAndDbValueFromState(metric, product, pg, val, flowKey);
      if (!fieldName) return;
      const teamId = parseInt(state.team);
      if (metric === 'headcount-flow') {
        bulk.push({
          teamId,
          periodDate: getPeriodDate(month),
          field: fieldName,
          value: dbValue,
          dataType: 'forecast',
          versionId: AppState.currentVersion?.version_id,
          updatedBy: AppState.currentUser,
          _flow: true
        });
      } else {
        bulk.push({
          teamId,
          periodDate: getPeriodDate(month),
          field: fieldName,
          newValue: dbValue
        });
      }
    });
  }

  // Persist (split non-sales rows if present)
  if (bulk.length > 0) {
    const nsRows = bulk.filter(u => u._ns);
    const flowRows = bulk.filter(u => u._flow);
    const fcRows = bulk.filter(u => !u._ns && !u._flow).map(({ _ns, _flow, ...r }) => r);

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
        value: u.value ?? u.newValue ?? 0,
        updatedBy: AppState.currentUser
      }))));
    }
    if (flowRows.length) {
      const flowPayload = flowRows.map(({ _flow, ...r }) => r);
      promises.push(API.headcountFlows.bulkUpdate({
        updates: flowPayload,
        updatedBy: AppState.currentUser
      }));
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
                input.value = String(Math.round((state.newValue || 0) / 1000));
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
    const wrapper = getActiveWrapper();
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
        AppState.scrollPositions[getScrollKeyForState()] = scrollLeft;
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

    const previousSubtab = AppState.headcountSubtab;

    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[getScrollKeyForState('headcount')] = currentWrapper.scrollLeft;
    }

    if (previousSubtab === 'sales') {
        AppState.lastSelectedTeams = AppState.lastSelectedTeams || { sales: AppState.currentTeam || 1, nonSales: AppState.currentNonSalesTeam || null };
        if (Number.isFinite(AppState.currentTeam) && AppState.currentTeam < 9000) {
            AppState.lastSelectedTeams.sales = AppState.currentTeam;
        }
    } else if (previousSubtab === 'non-sales') {
        AppState.lastSelectedTeams = AppState.lastSelectedTeams || { sales: AppState.currentTeam || 1, nonSales: AppState.currentNonSalesTeam || null };
        if (Number.isFinite(AppState.currentNonSalesTeam)) {
            AppState.lastSelectedTeams.nonSales = AppState.currentNonSalesTeam;
        }
        AppState.lastSelectedGroups = AppState.lastSelectedGroups || { nonSales: null };
        if (AppState.currentNonSalesGroup) {
            AppState.lastSelectedGroups.nonSales = AppState.currentNonSalesGroup;
        }
    }

    AppState.headcountSubtab = which;

    if (which === 'sales') {
        AppState.teamCategory = 'sales';
        AppState.isGroupView = false;
        AppState.currentGroup = null;

        AppState.lastSelectedTeams = AppState.lastSelectedTeams || { sales: AppState.currentTeam || 1, nonSales: AppState.currentNonSalesTeam || null };
        if (!Number.isFinite(AppState.currentTeam) || AppState.currentTeam >= 9000) {
            AppState.currentTeam = AppState.lastSelectedTeams.sales || 1;
        }
    } else {
        AppState.teamCategory = 'non-sales';
        AppState.isGroupView = false;
        AppState.currentGroup = null;

        AppState.lastSelectedGroups = AppState.lastSelectedGroups || { nonSales: null };
        const fallbackGroup = NON_SALES_GROUPS.length ? NON_SALES_GROUPS[0].key : null;
        if (!AppState.lastSelectedGroups.nonSales) {
            AppState.lastSelectedGroups.nonSales = fallbackGroup;
        }
        const nextGroup = AppState.lastSelectedGroups.nonSales || fallbackGroup;
        AppState.currentNonSalesGroup = nextGroup;

        AppState.lastSelectedTeams = AppState.lastSelectedTeams || { sales: AppState.currentTeam || 1, nonSales: NON_SALES_TEAMS[0]?.team_id || null };
        if (!AppState.lastSelectedTeams.nonSales && NON_SALES_TEAMS.length) {
            AppState.lastSelectedTeams.nonSales = NON_SALES_TEAMS[0].team_id;
        }
        const fallbackTeam = NON_SALES_TEAMS[0]?.team_id || null;
        if (!AppState.currentNonSalesTeam) {
            AppState.currentNonSalesTeam = AppState.lastSelectedTeams.nonSales || fallbackTeam;
        }
        if (Number.isFinite(AppState.currentNonSalesTeam)) {
            AppState.lastSelectedTeams.nonSales = AppState.currentNonSalesTeam;
        }
    }

    const salesBtn = document.getElementById('subtab-sales');
    const nsBtn = document.getElementById('subtab-non-sales');
    if (salesBtn && nsBtn) {
        salesBtn.classList.toggle('active', which === 'sales');
        nsBtn.classList.toggle('active', which === 'non-sales');
    }

    const salesC = document.getElementById('sales-headcount-subtab');
    const nsC = document.getElementById('non-sales-headcount-subtab');
    if (salesC && nsC) {
        salesC.style.display = which === 'sales' ? '' : 'none';
        nsC.style.display = which === 'non-sales' ? '' : 'none';
    }

    const headcountAdminButton = document.getElementById('headcount-admin-btn');
    if (headcountAdminButton) {
        const shouldShowAdmin = which === 'sales' && !AppState.isGroupView;
        headcountAdminButton.style.display = shouldShowAdmin ? '' : 'none';
    }

    if (typeof initializeSidebar === 'function') {
        initializeSidebar();
    }
    if (typeof window.highlightSidebarSelection === 'function') {
        if (which === 'sales') {
            window.highlightSidebarSelection(AppState.currentTeam);
        } else {
            window.highlightSidebarSelection(AppState.currentNonSalesTeam);
        }
    }
    if (typeof window.updateCurrentTeamLabel === 'function') {
        window.updateCurrentTeamLabel();
    }

    if (AppState.currentTab === 'headcount') {
        renderCurrentTab();
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

function updateProductionToolbarCaption(mode = AppState.productionSubtab) {
    const caption = document.querySelector('.production-toolbar-caption');
    if (!caption) return;
    const note = 'Prefill forecast months using trailing averages, seasonality multipliers, and annual growth. Edits made in the table still apply month by month.';
    const shouldShow = !AppState.isGroupView && (mode === 'investments' || mode === 'banking');
    if (shouldShow) {
        caption.textContent = note;
        caption.classList.add('baseline-note--active');
    } else {
        caption.textContent = '';
        caption.classList.remove('baseline-note--active');
    }
}

function switchProductionSubtab(which) {
    if (which !== 'investments' && which !== 'banking') return;
    // Save current before switching
    const previousKey = getScrollKeyForState('production');
    const currentWrapper = getActiveWrapper();
    if (currentWrapper) {
        AppState.scrollPositions[previousKey] = currentWrapper.scrollLeft;
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

    updateProductionToolbarCaption(which);

    document.querySelectorAll('.baseline-subtab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.subtab === which);
    });
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
    if (!input) {
        return;
    }

    const month = input.dataset.month;
    const groupKey = input.dataset.group;
    const teamId = parseInt(input.dataset.teamId, 10);
    const raw = (input.value || '').trim();

    if (!month || !groupKey || !Number.isFinite(teamId)) {
        input.classList.add('invalid-input');
        return;
    }

    if (raw === '' || raw === '-') {
        input.classList.add('invalid-input');
        return;
    }

    const value = parseInt(raw, 10);
    if (!Number.isFinite(value)) {
        input.classList.add('invalid-input');
        return;
    }

    input.classList.remove('invalid-input');

    const versionKey = AppState.currentForecast;
    const groupStore = AppState.nonSalesData?.[versionKey]?.[groupKey];
    if (!versionKey || !groupStore || !groupStore.teams || !groupStore.teams[teamId]) {
        return;
    }

    const teamStore = groupStore.teams[teamId];
    const previousValue = teamStore.values?.[month] ?? 0;

    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        AppState.undoStack.push({
            type: 'nonSalesHeadcountChange',
            data: { groupKey, teamId, month, previousValue, newValue: value },
            context: { tab: 'headcount', subtab: 'non-sales' }
        });
        AppState.redoStack = [];
        updateUndoRedoButtons();
    }

    if (!teamStore.values) {
        teamStore.values = {};
    }
    teamStore.values[month] = value;

    if (Array.isArray(groupStore.teamOrder) && !groupStore.teamOrder.includes(teamId)) {
        groupStore.teamOrder.push(teamId);
    }

    try {
        const totalCell = document.getElementById(`ns-headcount-total-${groupKey}-${month}`);
        if (totalCell) {
            const total = (groupStore.teamOrder || Object.keys(groupStore.teams)).reduce((sum, id) => {
                const entry = groupStore.teams[id];
                return sum + (entry?.values?.[month] ?? 0);
            }, 0);
            totalCell.textContent = total;
        }
    } catch (error) {
        console.warn('Failed to update non-sales total cell', error);
    }

    if (!AppState.isBulkPasting && !AppState.isProgrammaticChange) {
        try {
            await API.nonSales.updateData({
                teamId,
                periodDate: getPeriodDate(month),
                versionId: AppState.currentVersion.version_id,
                value,
                updatedBy: AppState.currentUser
            });
            showSaveIndicator();
        } catch (error) {
            console.error('Failed to save non-sales change:', error);
            showError('Failed to save change');
        }
    }
}
