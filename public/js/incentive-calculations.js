// public/js/incentive-calculations.js
// Logic for calculating incentive metrics

const DEFAULT_EXPENSE_GRID = [
    { range_min: 0.0,    range_max: 0.2499, qs_multiplier: 52,  bg_multiplier: 0.00075, ar_multiplier: 0.00063 },
    { range_min: 0.25,   range_max: 0.4999, qs_multiplier: 56,  bg_multiplier: 0.00080, ar_multiplier: 0.00067 },
    { range_min: 0.5,    range_max: 0.6999, qs_multiplier: 60,  bg_multiplier: 0.00086, ar_multiplier: 0.00072 },
    { range_min: 0.7,    range_max: 0.8499, qs_multiplier: 65,  bg_multiplier: 0.00094, ar_multiplier: 0.00079 },
    { range_min: 0.85,   range_max: 0.9999, qs_multiplier: 71,  bg_multiplier: 0.00103, ar_multiplier: 0.00087 },
    { range_min: 1.0,    range_max: 1.1499, qs_multiplier: 90,  bg_multiplier: 0.00130, ar_multiplier: 0.00110 },
    { range_min: 1.15,   range_max: 1.2999, qs_multiplier: 99,  bg_multiplier: 0.00143, ar_multiplier: 0.00121 },
    { range_min: 1.3,    range_max: 1.4999, qs_multiplier: 108, bg_multiplier: 0.00156, ar_multiplier: 0.00132 },
    { range_min: 1.5,    range_max: 1.7499, qs_multiplier: 117, bg_multiplier: 0.00168, ar_multiplier: 0.00143 },
    { range_min: 1.75,   range_max: 1.9999, qs_multiplier: 125, bg_multiplier: 0.00180, ar_multiplier: 0.00153 },
    { range_min: 2.0,    range_max: 2.2499, qs_multiplier: 133, bg_multiplier: 0.00191, ar_multiplier: 0.00162 },
    { range_min: 2.25,   range_max: null,   qs_multiplier: 140, bg_multiplier: 0.00201, ar_multiplier: 0.00170 }
];

const DEFAULT_TARGETS = {
    qs: 100,           // QS per advisor target
    bg: 10_000_000,    // BG assets per advisor target ($10M)
    ar: 10_000_000     // AR per advisor target ($10M)
};

const DEFAULT_TARGETED_PAY = 40_000;

function sanitizeNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function lookupGridMultiplier(grid, percent, field) {
    if (!Array.isArray(grid) || !grid.length) {
        grid = DEFAULT_EXPENSE_GRID;
    }
    const safePercent = Number.isFinite(percent) ? percent : 0;
    let candidate = grid[grid.length - 1];

    for (const row of grid) {
        const min = sanitizeNumber(row.range_min);
        const max = sanitizeNumber(row.range_max);
        if (min === null) continue;
        if (safePercent >= min && (max === null || safePercent <= max)) {
            candidate = row;
            break;
        }
        if (max !== null && safePercent <= max) {
            candidate = row;
            break;
        }
        if (safePercent < min) {
            candidate = row;
            break;
        }
    }
    return sanitizeNumber(candidate?.[field]) ?? 0;
}

function roundTo(value, digits = 0) {
    if (!Number.isFinite(value)) return 0;
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function safeDivide(numerator, denominator) {
    const num = Number(numerator);
    const den = Number(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return num / den;
}

function extractFiscalYear(month) {
    if (typeof month !== 'string') return null;
    const parts = month.split('-');
    if (parts.length < 2) return null;
    const yearPart = parts[1];
    if (yearPart.length === 2) {
        return Number(`20${yearPart}`);
    }
    return Number(yearPart);
}

function seededRatio(seed, min = 0.02, max = 0.06) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
    }
    const normalized = (Math.sin(hash) + 1) / 2;
    return min + (max - min) * normalized;
}

const IncentiveCalculator = {
    _expenseGridCache: new Map(),
    _targetedPayCache: new Map(),
    _percentTargetCache: new Map(),
    // Get production data for calculations
    getProductionData: function(teamData, month) {
    const months = generateMonthList();
    const monthIndex = months.indexOf(month);
    const businessDaysFallback = window.BUSINESS_DAYS?.[monthIndex] || 21;
    const productivity = parseFloat(teamData.productivity?.[month] ?? 0);

    const productionTotals = teamData.productionTotals?.[month] || null;
    const isForecastMonth = teamData?.forecastStatus?.[month] === 'Forecast';

    let baseHeadcount;
    const pgHeadcountSum = PG_LEVELS.reduce((sum, pg) =>
        sum + (Number(teamData.pgLevels?.[pg]?.[month]) || 0), 0);
    let totalInvestmentAccounts;
    let investmentAccounts;
    let investmentAssets;
    let productCAccounts;
    let productCAbpa;
    let bankingAccounts;
    let bankingAssets;
    let productCBalance;

    if (productionTotals) {
        baseHeadcount = isForecastMonth
            ? pgHeadcountSum
            : (Number(productionTotals.productiveHeadcount) || pgHeadcountSum);
        totalInvestmentAccounts = Number(productionTotals.totalInvestmentAccounts) || 0;
        investmentAccounts = Number(productionTotals.investmentAccounts) || 0;
        investmentAssets = Number(productionTotals.investmentAssets) || 0;
        productCAccounts = Number(productionTotals.productCAccounts) || 0;
        productCAbpa = Number(productionTotals.productCAbpa) || 0;
        bankingAccounts = Number(productionTotals.bankingAccounts) || 0;
        bankingAssets = Number(productionTotals.bankingAssets) || 0;
        productCBalance = Number(productionTotals.productCBalance);
        if (!Number.isFinite(productCBalance)) {
            productCBalance = productCAccounts * productCAbpa;
        }
    } else {
        baseHeadcount = pgHeadcountSum;
        const totalAccounts = Math.round((baseHeadcount * productivity * businessDaysFallback) / 5);
        totalInvestmentAccounts = totalAccounts;

        const investmentProducts = ['Product A', 'Product B', 'Product C', 'Product D'];
        investmentAccounts = 0;
        investmentAssets = 0;
        productCAccounts = 0;
        productCAbpa = 0;

        investmentProducts.forEach(product => {
            const mix = teamData.productMix?.[product]?.[month] || 0;
            const accounts = Math.round(totalAccounts * mix);
            const abpa = teamData.abpa?.[product]?.[month] || 0;

            investmentAccounts += accounts;
            investmentAssets += accounts * abpa;
            if (product === 'Product C') {
                productCAccounts = accounts;
                productCAbpa = abpa;
            }
        });

        const bankingProducts = ['AA', 'BB', 'CC', 'DD', 'EE'];
        bankingAccounts = 0;
        bankingAssets = 0;

        bankingProducts.forEach(product => {
            const productProductivity = parseFloat(teamData.additionalProducts?.[product]?.productivity?.[month] || 0);
            const productAbpa = parseFloat(teamData.additionalProducts?.[product]?.abpa?.[month] || 0);
            const accounts = Math.round((baseHeadcount * productProductivity * businessDaysFallback) / 5);
            bankingAccounts += accounts;
            bankingAssets += accounts * productAbpa;
        });

        productCBalance = productCAccounts * productCAbpa;
    }

    return {
        totalHeadcount: baseHeadcount,
        productiveHeadcount: baseHeadcount,
        totalInvestmentAccounts,
        investmentAccounts,
        investmentAssets,
        bankingAccounts,
        bankingAssets,
        productCBalance
    };
},
    
    // Calculate incentive metrics for a team and month
    calculateMetrics: function(
        teamId,
        month,
        productionData,
        compensableMetrics = {},
        qualityRatios = {},
        expenseGrid = DEFAULT_EXPENSE_GRID,
        targetedPayByYear = {},
        percentTargets = null,
        autoRatios = {},
        previousArBookBase = 0,
        priorYearArBookBase = null,
        isForecast
    ) {
        const isActual = !isForecast;
        const resolveRatio = (ratioKey, autoKey, defaultValue) => {
            if (Number.isFinite(qualityRatios[ratioKey])) {
                return qualityRatios[ratioKey];
            }
            if (!isActual && Number.isFinite(autoRatios?.[autoKey])) {
                return autoRatios[autoKey];
            }
            return defaultValue;
        };

        const baseHeadcount = Number(productionData.productiveHeadcount ?? productionData.totalHeadcount ?? 0);
        const adjustedHeadcount = baseHeadcount;

        if (!Number.isFinite(baseHeadcount) || baseHeadcount <= 0) {
            return {
                accountsPerAdvisor: 0,
                assetsPerAdvisor: 0,
                arEnrollPerAdvisor: 0,
                arBookPerAdvisor: 0,
                arRampPerAdvisor: 0,
                arTotalPerAdvisor: 0,
                productiveHeadcount: roundTo(baseHeadcount || 0, 2),
                productiveHeadcountBase: roundTo(baseHeadcount || 0, 2),
                productiveHeadcountAdjusted: roundTo(isActual ? (baseHeadcount || 0) : (baseHeadcount || 0) * headcountRatio, 2),
                qsPercentToTarget: 0,
                qsAchievementRate: 0,
                qsGridMultiplier: 0,
                bgPercentToTarget: 0,
                bgAchievementRate: 0,
                bgGridMultiplier: 0,
                arPercentToTarget: 0,
                arAchievementRate: 0,
                arGridMultiplier: 0,
                qsExpenseTotal: 0,
                bgExpenseTotal: 0,
                arExpenseTotal: 0,
                totalExpense: 0,
                averagePayout: 0,
                percentToTargetedPay: 0,
                qsExpensePercentOfTotal: 0,
                bgExpensePercentOfTotal: 0,
                arExpensePercentOfTotal: 0,
                investmentsQs: 0,
                investmentsBg: 0,
                bankingQs: 0,
                bankingBg: 0,
                arEnrollTotal: 0,
               arBookNextBase: Number(previousArBookBase) || 0,
                arBookTotal: 0,
                arBookBase: Number(previousArBookBase) || 0,
                arRampTotal: 0,
                arTotal: 0,
                wmQs: 0,
                wmBg: 0
            };
        }

        const investmentAccounts = productionData.investmentAccounts || 0;
        const investmentAssets = productionData.investmentAssets || 0;
        const bankingAccounts = productionData.bankingAccounts || 0;
        const bankingAssets = productionData.bankingAssets || 0;

        let totalAdjustedAccounts = 0;
        let totalAdjustedAssets = 0;

        const investmentAccountRatio = compensableMetrics.investment_accounts
            ? resolveRatio('investment_accounts', 'investment_accounts', 1)
            : 0;
        const bankingAccountRatio = compensableMetrics.banking_accounts
            ? resolveRatio('banking_accounts', 'banking_accounts', 1)
            : 0;

        const adjustedInvestmentAccounts = investmentAccounts * investmentAccountRatio;
        const adjustedBankingAccounts = bankingAccounts * bankingAccountRatio;
        let wealthAccountRatioToUse = 0;
        const overrideWmQsRatio = Number.isFinite(qualityRatios.wealth_accounts) ? qualityRatios.wealth_accounts : null;
        const autoWmQsRatio = Number.isFinite(autoRatios?.autoWmQsRatio) ? autoRatios.autoWmQsRatio : null;
        if (isActual && compensableMetrics.wealth_accounts) {
            wealthAccountRatioToUse = seededRatio(`wm-qs-${teamId}-${month}`);
        } else if (!isActual && Number.isFinite(overrideWmQsRatio)) {
            wealthAccountRatioToUse = overrideWmQsRatio;
        } else if (!isActual && Number.isFinite(autoWmQsRatio)) {
            wealthAccountRatioToUse = autoWmQsRatio;
        } else if (Number.isFinite(qualityRatios.wealth_accounts)) {
            wealthAccountRatioToUse = qualityRatios.wealth_accounts;
        } else {
            wealthAccountRatioToUse = compensableMetrics.wealth_accounts ? 0.05 : 0;
        }
        const wealthAccountsOverlay = (investmentAccounts + bankingAccounts) * wealthAccountRatioToUse;

        totalAdjustedAccounts = adjustedInvestmentAccounts + adjustedBankingAccounts + wealthAccountsOverlay;

        const investmentAssetRatio = compensableMetrics.investment_assets
            ? resolveRatio('investment_assets', 'investment_assets', 1)
            : 0;
        const bankingAssetRatio = compensableMetrics.banking_assets
            ? resolveRatio('banking_assets', 'banking_assets', 1)
            : 0;

        const adjustedInvestmentAssets = investmentAssets * investmentAssetRatio;
        const adjustedBankingAssets = bankingAssets * bankingAssetRatio;
        let wealthAssetRatioToUse = 0;
        const overrideWmBgRatio = Number.isFinite(qualityRatios.wealth_assets) ? qualityRatios.wealth_assets : null;
        const autoWmBgRatio = Number.isFinite(autoRatios?.autoWmBgRatio) ? autoRatios.autoWmBgRatio : null;
        if (isActual && compensableMetrics.wealth_assets) {
            wealthAssetRatioToUse = seededRatio(`wm-bg-${teamId}-${month}`);
        } else if (!isActual && Number.isFinite(overrideWmBgRatio)) {
            wealthAssetRatioToUse = overrideWmBgRatio;
        } else if (!isActual && Number.isFinite(autoWmBgRatio)) {
            wealthAssetRatioToUse = autoWmBgRatio;
        } else if (Number.isFinite(qualityRatios.wealth_assets)) {
            wealthAssetRatioToUse = qualityRatios.wealth_assets;
        } else {
            wealthAssetRatioToUse = compensableMetrics.wealth_assets ? 0.05 : 0;
        }
        const wealthAssetsOverlay = (investmentAssets + bankingAssets) * wealthAssetRatioToUse;

        totalAdjustedAssets = adjustedInvestmentAssets + adjustedBankingAssets + wealthAssetsOverlay;

        const accountsPerAdvisorRaw = safeDivide(totalAdjustedAccounts, adjustedHeadcount);
        const assetsPerAdvisorRaw = safeDivide(totalAdjustedAssets, adjustedHeadcount);

        const arRampRatio = resolveRatio('ar_ramp', 'ar_ramp', 0.05);

        const productCBalance = Number(productionData.productCBalance) || 0;
        const arEnrollTotal = productCBalance;
        const monthlyAppreciationRate = 0.042 / 12;
        const priorBookBase = Number(previousArBookBase) || 0;
        const grownBookBase = priorBookBase * (1 + monthlyAppreciationRate);
        const priorYearBookBase = Number(priorYearArBookBase);
        let arBookBase = grownBookBase + arEnrollTotal;
        if (isForecast && Number.isFinite(priorYearBookBase)) {
            arBookBase = (priorYearBookBase * 1.042) + arEnrollTotal;
        }
        const arBookIncrement = arBookBase - priorBookBase;
        const nextBookBase = arBookBase;
        const arBookAppreciation = arBookIncrement - arEnrollTotal;
        const arRampTotal = arEnrollTotal * arRampRatio;
        const arTotal = arBookBase + arRampTotal;

        const arEnrollPerAdvisorRaw = safeDivide(arEnrollTotal, adjustedHeadcount);
        const arBookPerAdvisorRaw = safeDivide(arBookBase, adjustedHeadcount);
        const arRampPerAdvisorRaw = safeDivide(arRampTotal, adjustedHeadcount);
        const arTotalPerAdvisorRaw = safeDivide(arTotal, adjustedHeadcount);

        const effectiveGrid = Array.isArray(expenseGrid) && expenseGrid.length ? expenseGrid : DEFAULT_EXPENSE_GRID;

        const baselineRow = Array.isArray(effectiveGrid)
            ? effectiveGrid.find(row => {
                const min = sanitizeNumber(row.range_min);
                const max = sanitizeNumber(row.range_max);
                if (!Number.isFinite(min)) return false;
                if (min <= 1 && (max === null || max === undefined || max >= 1)) return true;
                return false;
            }) || effectiveGrid.find(row => sanitizeNumber(row.range_min) === 1) || effectiveGrid[0]
            : null;

        const baselineQs = sanitizeNumber(baselineRow?.qs_multiplier);
        const baselineBg = sanitizeNumber(baselineRow?.bg_multiplier);
        const baselineAr = sanitizeNumber(baselineRow?.ar_multiplier);

        const targetFromGrid = (baselineValue, defaultValue) => (
            Number.isFinite(baselineValue) ? baselineValue : defaultValue
        );
        // Actuals keep using the default targets; forecasts use the 100%-114.99% grid band.
        const qsTargetValue = isActual
            ? DEFAULT_TARGETS.qs
            : targetFromGrid(baselineQs, DEFAULT_TARGETS.qs);
        const bgTargetValue = isActual
            ? DEFAULT_TARGETS.bg
            : targetFromGrid(baselineBg, DEFAULT_TARGETS.bg);
        const arTargetValue = isActual
            ? DEFAULT_TARGETS.ar
            : targetFromGrid(baselineAr, DEFAULT_TARGETS.ar);

        const qsTargetRatio = Number.isFinite(qsTargetValue) && qsTargetValue !== 0
            ? accountsPerAdvisorRaw / qsTargetValue
            : 0;
        const bgTargetRatio = Number.isFinite(bgTargetValue) && bgTargetValue !== 0
            ? assetsPerAdvisorRaw / bgTargetValue
            : 0;
        const arTargetRatio = Number.isFinite(arTargetValue) && arTargetValue !== 0
            ? arTotalPerAdvisorRaw / arTargetValue
            : 0;

        const forecastPercentDefaults = {
            qs: Number.isFinite(percentTargets?.qs) ? percentTargets.qs : 1.08,
            bg: Number.isFinite(percentTargets?.bg) ? percentTargets.bg : 1.08,
            ar: Number.isFinite(percentTargets?.ar) ? percentTargets.ar : 1.08
        };

        const qsPercentInput = isActual ? qsTargetRatio : forecastPercentDefaults.qs;
        const bgPercentInput = isActual ? bgTargetRatio : forecastPercentDefaults.bg;
        const arPercentInput = isActual ? arTargetRatio : forecastPercentDefaults.ar;

        const qsMultiplier = lookupGridMultiplier(effectiveGrid, qsPercentInput, 'qs_multiplier');
        const bgMultiplier = lookupGridMultiplier(effectiveGrid, bgPercentInput, 'bg_multiplier');
        const arMultiplier = lookupGridMultiplier(effectiveGrid, arPercentInput, 'ar_multiplier');

        const baseQsMultiplier = (Number.isFinite(baselineQs) ? baselineQs : lookupGridMultiplier(effectiveGrid, 1, 'qs_multiplier')) ?? 1;
        const baseBgMultiplier = (Number.isFinite(baselineBg) ? baselineBg : lookupGridMultiplier(effectiveGrid, 1, 'bg_multiplier')) ?? 1;
        const baseArMultiplier = (Number.isFinite(baselineAr) ? baselineAr : lookupGridMultiplier(effectiveGrid, 1, 'ar_multiplier')) ?? 1;

        const qsPercentToTarget = qsPercentInput;
        const bgPercentToTarget = bgPercentInput;
        const arPercentToTarget = arPercentInput;

        const qsAchievementRate = qsPercentToTarget;
        const bgAchievementRate = bgPercentToTarget;
        const arAchievementRate = arPercentToTarget;

        const normalizeForForecast = (value, percent) => {
            if (isActual) return value;
            const ratio = Number(percent);
            if (!Number.isFinite(value)) return value;
            if (!Number.isFinite(ratio) || ratio === 0) return value;
            return value / ratio;
        };

        const qsPerAdvisorForExpense = normalizeForForecast(accountsPerAdvisorRaw, qsPercentToTarget);
        const bgPerAdvisorForExpense = normalizeForForecast(assetsPerAdvisorRaw, bgPercentToTarget);
        const arPerAdvisorForExpense = normalizeForForecast(arTotalPerAdvisorRaw, arPercentToTarget);

        const qsActualTotal = qsPerAdvisorForExpense * adjustedHeadcount;
        const bgActualTotal = bgPerAdvisorForExpense * adjustedHeadcount;
        const arActualTotal = arPerAdvisorForExpense * adjustedHeadcount;

        const qsExpenseTotal = qsActualTotal * qsMultiplier;
        const bgExpenseTotal = bgActualTotal * bgMultiplier;
        const arExpenseTotal = arActualTotal * arMultiplier;

        const totalExpense = qsExpenseTotal + bgExpenseTotal + arExpenseTotal;
        const totalExpensePerAdvisor = safeDivide(totalExpense, adjustedHeadcount);

        const qsExpensePercentOfTotal = totalExpense > 0 ? qsExpenseTotal / totalExpense : 0;
        const bgExpensePercentOfTotal = totalExpense > 0 ? bgExpenseTotal / totalExpense : 0;
        const arExpensePercentOfTotal = totalExpense > 0 ? arExpenseTotal / totalExpense : 0;

        const fiscalYear = extractFiscalYear(month);
        const targetedPay = Number.isFinite(targetedPayByYear?.[fiscalYear]) ? targetedPayByYear[fiscalYear] : DEFAULT_TARGETED_PAY;
        const percentToTargetedPay = targetedPay > 0 ? totalExpensePerAdvisor / targetedPay : 0;

        return {
            isForecast: !!isForecast,
            accountsPerAdvisor: roundTo(accountsPerAdvisorRaw, 2),
            assetsPerAdvisor: Math.round(assetsPerAdvisorRaw),
            arEnrollPerAdvisor: Math.round(arEnrollPerAdvisorRaw),
            arBookPerAdvisor: Math.round(arBookPerAdvisorRaw),
            arRampPerAdvisor: Math.round(arRampPerAdvisorRaw),
            arTotalPerAdvisor: Math.round(arTotalPerAdvisorRaw),
            productiveHeadcount: roundTo(baseHeadcount, 2),
            productiveHeadcountBase: roundTo(baseHeadcount, 2),
            productiveHeadcountAdjusted: roundTo(adjustedHeadcount, 2),
            qsPercentToTarget,
            qsAchievementRate,
            qsGridMultiplier: qsMultiplier,
            bgPercentToTarget,
            bgAchievementRate,
            bgGridMultiplier: bgMultiplier,
            arPercentToTarget,
            arAchievementRate,
            arGridMultiplier: arMultiplier,
            qsExpenseTotal: Math.round(qsExpenseTotal),
            bgExpenseTotal: Math.round(bgExpenseTotal),
            arExpenseTotal: Math.round(arExpenseTotal),
            totalExpense: Math.round(totalExpense),
            averagePayout: roundTo(totalExpensePerAdvisor, 2),
            percentToTargetedPay,
            qsExpensePercentOfTotal,
            bgExpensePercentOfTotal,
            arExpensePercentOfTotal,
            investmentsQs: Math.round(adjustedInvestmentAccounts),
            investmentsBg: Math.round(adjustedInvestmentAssets),
            bankingQs: Math.round(adjustedBankingAccounts),
            bankingBg: Math.round(adjustedBankingAssets),
            arEnrollTotal: Math.round(arEnrollTotal),
            arBookTotal: Math.round(arBookBase),
            arBookNextBase: nextBookBase,
            arBookBase,
            arRampTotal,
            arTotal,
            wmQs: Math.round(wealthAccountsOverlay),
            wmBg: Math.round(wealthAssetsOverlay)
        };
    },
    
    // Get compensable metrics for a team from API (returns per-team flags)
    getCompensableMetrics: async function(teamId, versionId) {
        try {
            const response = await fetch(`/api/incentives/compensable-metrics?versionId=${versionId}`);
            const result = await response.json();
            if (result && result.success && result.data) {
                const teamRows = result.data.filter(r => r.team_id === parseInt(teamId));
                const flags = {
                    investment_accounts: false,
                    investment_assets: false,
                    banking_accounts: false,
                    banking_assets: false,
                    wealth_accounts: false,
                    wealth_assets: false
                };
                teamRows.forEach(r => {
                    if (r.metric_category in flags) flags[r.metric_category] = !!r.is_compensable;
                });
                return flags;
            }
        } catch (error) {
            console.error('Error fetching compensable metrics:', error);
        }
        // Defaults if not available
        return {
            investment_accounts: true,
            investment_assets: true,
            banking_accounts: false,
            banking_assets: false,
            wealth_accounts: false,
            wealth_assets: false
        };
    },
    
    // Get quality ratios for a team/version. Prefer version-wide endpoint; fall back to period-specific.
    getQualityRatios: async function(teamId, period, versionId = 2) {
        // Helper default ratios
        const defaults = {
            investment_accounts: 1.00,
            investment_assets: 1.00,
            banking_accounts: 0.90,
            banking_assets: 0.80,
            wealth_accounts: 0.05,
            wealth_assets: 0.05,
            productive_headcount: 0.90,
            ar_ramp: 0.05
        };
        try {
            // New endpoint: latest ratios for version
            const r1 = await fetch(`/api/incentives/quality-ratios/${teamId}?versionId=${versionId}`);
            if (r1.ok) {
                const j = await r1.json();
                if (j && j.success && j.data && Object.keys(j.data).length > 0) {
                    return { ...defaults, ...j.data };
                }
            }
        } catch (e) {
            // ignore and try legacy path
        }
        // Legacy endpoint (period-scoped)
        try {
            const r2 = await fetch(`/api/incentives/quality-ratios/${teamId}/${period}?versionId=${versionId}`);
            if (r2.ok) {
                const j2 = await r2.json();
                if (j2 && j2.success && j2.data) return { ...defaults, ...j2.data };
            }
        } catch (e) {
            console.error('Error fetching quality ratios (legacy):', e);
        }
        return defaults;
    },

    getExpenseGrid: async function(teamId, versionId = 0) {
        const cacheKey = `${teamId ?? 'team'}_${versionId ?? 0}`;
        if (this._expenseGridCache.has(cacheKey)) {
            return this._expenseGridCache.get(cacheKey);
        }
        try {
            const response = await fetch(`/api/incentives/expense-grids?teamId=${teamId}&versionId=${versionId}`);
            if (response.ok) {
                const json = await response.json();
                const rows = Array.isArray(json.data) ? json.data : [];
                const normalized = rows.length
                    ? rows
                        .map(row => ({
                            range_min: sanitizeNumber(row.range_min),
                            range_max: sanitizeNumber(row.range_max),
                            qs_multiplier: sanitizeNumber(row.qs_multiplier),
                            bg_multiplier: sanitizeNumber(row.bg_multiplier),
                            ar_multiplier: sanitizeNumber(row.ar_multiplier)
                        }))
                        .filter(row => row.range_min !== null)
                        .sort((a, b) => a.range_min - b.range_min)
                    : DEFAULT_EXPENSE_GRID.slice();
                this._expenseGridCache.set(cacheKey, normalized);
                return normalized;
            }
        } catch (error) {
            console.error('Error fetching expense grid:', error);
        }
        const fallback = DEFAULT_EXPENSE_GRID.slice();
        this._expenseGridCache.set(cacheKey, fallback);
        return fallback;
    },

    getTargetedPay: async function(teamId) {
        const cacheKey = `team_${teamId}`;
        if (this._targetedPayCache.has(cacheKey)) {
            return this._targetedPayCache.get(cacheKey);
        }

        try {
            const response = await fetch('/api/incentives/targeted-pay');
            if (response.ok) {
                const json = await response.json();
                const map = {};
                if (json && Array.isArray(json.data)) {
                    json.data
                        .filter(row => Number(row.team_id) === Number(teamId))
                        .forEach(row => {
                            const year = Number(row.fiscal_year);
                            const pay = Number(row.targeted_pay);
                            if (Number.isFinite(year) && Number.isFinite(pay)) {
                                map[year] = pay;
                            }
                        });
                }
                this._targetedPayCache.set(cacheKey, map);
                return map;
            }
        } catch (error) {
            console.error('Error fetching targeted pay:', error);
        }
        const fallback = {};
        this._targetedPayCache.set(cacheKey, fallback);
        return fallback;
    },

    getPercentTargets: async function(teamId, versionId = 0) {
        const cacheKey = `${teamId ?? 'team'}_${versionId ?? 0}`;
        if (this._percentTargetCache.has(cacheKey)) {
            return this._percentTargetCache.get(cacheKey);
        }
        const params = new URLSearchParams();
        if (teamId != null) params.set('teamId', teamId);
        if (versionId != null) params.set('versionId', versionId);
        try {
            const response = await fetch(`/api/incentives/percent-targets?${params.toString()}`);
            if (response.ok) {
                const json = await response.json();
                const row = Array.isArray(json.data) && json.data.length ? json.data[0] : null;
                const normalized = row ? {
                    qs: Number.isFinite(Number(row.qs_percent)) ? Number(row.qs_percent) : 1.08,
                    bg: Number.isFinite(Number(row.bg_percent)) ? Number(row.bg_percent) : 1.08,
                    ar: Number.isFinite(Number(row.ar_percent)) ? Number(row.ar_percent) : 1.08
                } : { qs: 1.08, bg: 1.08, ar: 1.08 };
                this._percentTargetCache.set(cacheKey, normalized);
                return normalized;
            }
        } catch (error) {
            console.error('Error fetching percent targets:', error);
        }
        const fallback = { qs: 1.08, bg: 1.08, ar: 1.08 };
        this._percentTargetCache.set(cacheKey, fallback);
        return fallback;
    },

    clearTargetedPayCache: function(teamId = null) {
        if (teamId === null || teamId === undefined) {
            this._targetedPayCache.clear();
        } else {
            this._targetedPayCache.delete(`team_${teamId}`);
        }
    },

    clearPercentTargetCache: function(teamId = null, versionId = null) {
        if (teamId === null) {
            this._percentTargetCache.clear();
            return;
        }
        const key = `${teamId}_${versionId ?? 0}`;
        this._percentTargetCache.delete(key);
    },

    clearExpenseGridCache: function(teamId = null, versionId = null) {
        if (teamId === null) {
            this._expenseGridCache.clear();
            return;
        }
        const key = `${teamId}_${versionId ?? 0}`;
        this._expenseGridCache.delete(key);
    }
};

// Export for use in other files
window.IncentiveCalculator = IncentiveCalculator;
