// public/js/app-state.js - Shared global state configuration

(function () {
    if (typeof window === 'undefined') {
        return;
    }

    const AppState = {
        currentTeam: 1,
        currentGroup: null,
        isGroupView: false,
        isBulkPasting: false,
        isProgrammaticChange: false,
        teamCategory: 'sales', // 'sales' | 'non-sales'
        lastSelectedTeams: { sales: 1, nonSales: 9201 },
        lastSelectedGroups: { nonSales: null },
        currentNonSalesGroup: null,
        nonSalesLoadStatus: {},
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
        productionBaselineState: {},
        bankingBaselineState: {},
        productionConfig: null,
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
        currentUser: 'testuser@test.com'
    };

    const PG_LEVELS = ['PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'PG6', 'PG7'];
    const HEADCOUNT_FLOW_ROWS = [
        { key: 'starting_headcount', label: 'Starting Headcount' },
        { key: 'external_hires', label: 'External Hires' },
        { key: 'progressions_in', label: 'Progressions In' },
        { key: 'transfers_in', label: 'Transfers In' },
        { key: 'mfsa_progressions_out', label: 'MFSA Progressions Out' },
        { key: 'sfsa_progressions_out', label: 'SFSA Progressions Out' },
        { key: 'other_progressions_out', label: 'Other Progressions Out' },
        { key: 'transfers_out', label: 'Transfers Out' },
        { key: 'attrition', label: 'Attrition' },
        { key: 'loa', label: 'LOA' },
        { key: 'ending_headcount', label: 'Ending Headcount', isCalculated: true }
    ];

    const PRODUCTS = ['Product A', 'Product B', 'Product C', 'Product D'];
    const ADDITIONAL_PRODUCTS = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];
    const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const SELF_DIRECTED_PRODUCT_NAME = PRODUCTS[0];
    const MGIA_PRODUCT_NAME = PRODUCTS[2];

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

    window.AppState = AppState;
    window.PG_LEVELS = PG_LEVELS;
    window.HEADCOUNT_FLOW_ROWS = HEADCOUNT_FLOW_ROWS;
    window.PRODUCTS = PRODUCTS;
    window.ADDITIONAL_PRODUCTS = ADDITIONAL_PRODUCTS;
    window.slugify = slugify;
    window.MONTH_ABBREVIATIONS = MONTH_ABBREVIATIONS;
    window.SELF_DIRECTED_PRODUCT_NAME = SELF_DIRECTED_PRODUCT_NAME;
    window.MGIA_PRODUCT_NAME = MGIA_PRODUCT_NAME;
    window.NON_SALES_GROUPS = NON_SALES_GROUPS;
    window.NON_SALES_TEAMS = NON_SALES_TEAMS;
    window.GROUPS = {};
})();
