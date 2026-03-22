(function () {
    if (typeof window === 'undefined') {
        return;
    }

    const PRODUCT_ITEMS = [
        { key: 'product1', label: 'Product 1' },
        { key: 'product2', label: 'Product 2' },
        { key: 'product3', label: 'Product 3' },
        { key: 'product4', label: 'Product 4' }
    ];

    const ASSET_ITEMS = [
        { key: 'cash', label: 'Cash' },
        { key: 'margin', label: 'Margin' },
        { key: 'equity', label: 'Equity' },
        { key: 'fixedIncome', label: 'Fixed Income' },
        { key: 'options', label: 'Options' }
    ];

    const METRIC_SECTIONS = [
        {
            title: 'Investment Assumptions',
            rows: [
                { key: 'investmentsRevenueVelocity', label: 'Revenue velocity', items: PRODUCT_ITEMS },
                { key: 'investmentsExpenseVelocity', label: 'Expense velocity', items: PRODUCT_ITEMS },
                { key: 'accountAttrition', label: 'Account attrition', items: PRODUCT_ITEMS },
                { key: 'accountsPayingOtherFeesPct', label: '% accounts paying other account fees', items: PRODUCT_ITEMS, suffix: '%' },
                { key: 'otherFeesPerAccount', label: 'Other fees per account', items: PRODUCT_ITEMS }
            ]
        },
        {
            title: 'Asset Assumptions',
            rows: [
                { key: 'revenueVelocityByAssetType', label: 'Revenue Velocity per asset type', items: ASSET_ITEMS },
                { key: 'assetMix', label: 'Asset mix', items: ASSET_ITEMS, suffix: '%' }
            ]
        }
    ];

    const MONTHLY_SERIES = [
        { key: 'depositAvgBalances', label: 'Deposit Avg. Balances' },
        { key: 'sp500', label: 'S&P500' },
        { key: 'depositsInterestIncomeRate', label: 'Deposits Interest Income rate' },
        { key: 'depositsRatePaid', label: 'Deposits rate paid' },
        { key: 'marginInterestIncomeRate', label: 'Margin Interest Income rate' },
        { key: 'marginRatePaid', label: 'Margin rate paid' },
        { key: 'cashOffers', label: 'Cash offers', integerOnly: true, negativeOnly: true }
    ];

    const cache = new Map();
    const saveTimers = new Map();
    let renderToken = 0;

    function cloneData(data) {
        return JSON.parse(JSON.stringify(data));
    }

    function normalizeNumber(value) {
        if (value === '' || value == null) {
            return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function normalizeSeriesInputValue(seriesKey, rawValue) {
        if (rawValue === '' || rawValue == null) {
            return null;
        }
        if (seriesKey === 'cashOffers') {
            const parsed = Number(rawValue);
            if (!Number.isFinite(parsed) || parsed >= 0) {
                return null;
            }
            return Math.trunc(parsed);
        }
        return normalizeNumber(rawValue);
    }

    function buildDefaultState(versionId) {
        return {
            versionId,
            scalarInputs: {
                investmentsRevenueVelocity: { product1: null, product2: null, product3: null, product4: null },
                investmentsExpenseVelocity: { product1: null, product2: null, product3: null, product4: null },
                accountAttrition: { product1: null, product2: null, product3: null, product4: null },
                accountsPayingOtherFeesPct: { product1: null, product2: null, product3: null, product4: null },
                otherFeesPerAccount: { product1: null, product2: null, product3: null, product4: null },
                outflowsRunRatePct: null,
                inflowsRunRatePct: null,
                revenueVelocityByAssetType: { cash: null, margin: null, equity: null, fixedIncome: null, options: null },
                assetMix: { cash: null, margin: null, equity: null, fixedIncome: null, options: null }
            },
            monthlySeries: {
                depositAvgBalances: {},
                sp500: {},
                depositsInterestIncomeRate: {},
                depositsRatePaid: {},
                marginInterestIncomeRate: {},
                marginRatePaid: {},
                cashOffers: {}
            },
            updatedAt: null,
            updatedBy: null
        };
    }

    function canEditSelectedForecast() {
        return !!window.AppState?.currentVersion && !window.AppState.currentVersion.is_locked;
    }

    async function loadState(versionId) {
        if (!versionId) {
            return buildDefaultState(null);
        }

        if (cache.has(versionId)) {
            return cache.get(versionId);
        }

        const response = await window.API.kmpcConfig.get(versionId);
        const state = {
            ...buildDefaultState(versionId),
            ...cloneData(response || {}),
            versionId
        };
        cache.set(versionId, state);
        return state;
    }

    function formatInputValue(value) {
        return value == null || value === '' ? '' : String(value);
    }

    function formatUpdatedMeta(state) {
        if (!state.updatedAt && !state.updatedBy) {
            return 'No KMPC inputs saved for this forecast yet.';
        }
        const parts = [];
        if (state.updatedAt) {
            const parsed = new Date(state.updatedAt);
            if (!Number.isNaN(parsed.getTime())) {
                parts.push(`Updated ${parsed.toLocaleString()}`);
            }
        }
        if (state.updatedBy) {
            parts.push(`by ${state.updatedBy}`);
        }
        return parts.join(' ') || 'Saved';
    }

    function renderMatrixSection(section, state, editable, options = {}) {
        const columns = section.rows[0]?.items || [];
        const headHtml = columns.map(item => `<th>${item.label}</th>`).join('');
        const rowsHtml = section.rows.map(row => {
            const values = state.scalarInputs[row.key] || {};
            const cells = row.items.map(item => `
                <td>
                    <div class="kmpc-cell-wrap ${row.suffix ? 'kmpc-cell-wrap--with-suffix' : 'kmpc-cell-wrap--plain'}">
                        <input
                            type="number"
                            step="0.01"
                            class="kmpc-cell-input"
                            data-kmpc-scalar="${row.key}"
                            data-kmpc-item="${item.key}"
                            ${editable ? '' : 'disabled'}
                            value="${formatInputValue(values[item.key])}">
                        ${row.suffix ? `<span class="kmpc-cell-suffix">${row.suffix}</span>` : ''}
                    </div>
                </td>
            `).join('');

            return `
                <tr>
                    <th>
                        <div class="kmpc-metric-name">${row.label}</div>
                    </th>
                    ${cells}
                </tr>
            `;
        }).join('');

        return `
            <section class="kmpc-card ${options.cardClass || ''}">
                <div class="kmpc-card__header">
                    <h3>${section.title}</h3>
                </div>
                <div class="kmpc-table-wrap ${options.tableWrapClass || ''}">
                    <table class="kmpc-matrix-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                ${headHtml}
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderRunRateCard(state, editable) {
        return `
            <section class="kmpc-card kmpc-card--compact">
                <div class="kmpc-card__header">
                    <h3>Portfolio Run-Rate</h3>
                </div>
                <div class="kmpc-runrate-table-wrap">
                    <table class="kmpc-matrix-table kmpc-matrix-table--compact">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <th><div class="kmpc-metric-name">Outflows run-rate</div></th>
                                <td>
                                    <div class="kmpc-cell-wrap kmpc-cell-wrap--with-suffix">
                                        <input
                                            type="number"
                                            step="0.01"
                                            class="kmpc-cell-input"
                                            data-kmpc-scalar="outflowsRunRatePct"
                                            ${editable ? '' : 'disabled'}
                                            value="${formatInputValue(state.scalarInputs.outflowsRunRatePct)}">
                                        <span class="kmpc-cell-suffix">%</span>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <th><div class="kmpc-metric-name">Inflows run-rate</div></th>
                                <td>
                                    <div class="kmpc-cell-wrap kmpc-cell-wrap--with-suffix">
                                        <input
                                            type="number"
                                            step="0.01"
                                            class="kmpc-cell-input"
                                            data-kmpc-scalar="inflowsRunRatePct"
                                            ${editable ? '' : 'disabled'}
                                            value="${formatInputValue(state.scalarInputs.inflowsRunRatePct)}">
                                        <span class="kmpc-cell-suffix">%</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderMonthlySeriesTable(state, editable) {
        const months = typeof window.generateMonthList === 'function' ? window.generateMonthList() : [];
        const headerHtml = months.map(month => `<th>${month}</th>`).join('');
        const rowsHtml = MONTHLY_SERIES.map(series => {
            const seriesValues = state.monthlySeries?.[series.key] || {};
            const cells = months.map(month => `
                <td>
                    <input
                        type="number"
                        step="${series.integerOnly ? '1' : '0.01'}"
                        ${series.negativeOnly ? 'max="-1"' : ''}
                        data-kmpc-series="${series.key}"
                        data-kmpc-month="${month}"
                        ${editable ? '' : 'disabled'}
                        value="${formatInputValue(seriesValues[month])}">
                </td>
            `).join('');
            return `
                <tr>
                    <th>${series.label}</th>
                    ${cells}
                </tr>
            `;
        }).join('');

        return `
            <section class="kmpc-card kmpc-card--series">
                <div class="kmpc-card__header">
                    <h3>Monthly Market Series</h3>
                </div>
                <div class="kmpc-series-table-wrap">
                    <table class="kmpc-series-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                ${headerHtml}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    function renderShell(container, state) {
        const editable = canEditSelectedForecast();
        container.innerHTML = `
            <div class="kmpc-layout">
                <div class="kmpc-top-grid">
                    ${renderMatrixSection(METRIC_SECTIONS[0], state, editable, {
                        cardClass: 'kmpc-card--investment',
                        tableWrapClass: 'kmpc-table-wrap--tight'
                    })}
                    ${renderRunRateCard(state, editable)}
                </div>
                <div class="kmpc-grid">
                    ${renderMatrixSection(METRIC_SECTIONS[1], state, editable)}
                </div>
                ${renderMonthlySeriesTable(state, editable)}
            </div>
        `;
    }

    function updateStatusText(container, text) {
        const target = container.querySelector('#kmpc-status-text');
        if (target) {
            target.textContent = text;
        }
    }

    async function persistState(versionId, container) {
        const state = cache.get(versionId);
        if (!state || !versionId) {
            return;
        }

        updateStatusText(container, 'Saving KMPC inputs...');
        try {
            const result = await window.API.kmpcConfig.save({
                versionId,
                scalarInputs: state.scalarInputs,
                monthlySeries: state.monthlySeries,
                updatedBy: window.AppState?.currentUser || null
            });

            state.updatedAt = new Date().toISOString();
            state.updatedBy = result?.data?.updatedBy || window.AppState?.currentUser || null;
            cache.set(versionId, state);
            updateStatusText(container, formatUpdatedMeta(state));
            if (typeof window.showSaveIndicator === 'function') {
                window.showSaveIndicator();
            }
        } catch (error) {
            console.error('Failed to save KMPC settings', error);
            updateStatusText(container, 'Failed to save KMPC inputs');
            if (typeof window.showError === 'function') {
                window.showError(error?.message || 'Failed to save KMPC inputs');
            }
        }
    }

    function queueSave(versionId, container) {
        if (!canEditSelectedForecast()) {
            return;
        }
        if (saveTimers.has(versionId)) {
            window.clearTimeout(saveTimers.get(versionId));
        }
        const timerId = window.setTimeout(() => {
            saveTimers.delete(versionId);
            persistState(versionId, container);
        }, 350);
        saveTimers.set(versionId, timerId);
    }

    function bindInputs(container, state, versionId) {
        container.querySelectorAll('[data-kmpc-scalar], [data-kmpc-series]').forEach(input => {
            input.addEventListener('input', event => {
                const target = event.currentTarget;
                if (!(target instanceof HTMLInputElement)) {
                    return;
                }

                const scalarKey = target.dataset.kmpcScalar;
                const seriesKey = target.dataset.kmpcSeries;
                const itemKey = target.dataset.kmpcItem;
                const monthKey = target.dataset.kmpcMonth;
                const value = normalizeNumber(target.value);

                if (scalarKey) {
                    if (itemKey) {
                        state.scalarInputs[scalarKey] = state.scalarInputs[scalarKey] || {};
                        state.scalarInputs[scalarKey][itemKey] = value;
                    } else {
                        state.scalarInputs[scalarKey] = value;
                    }
                } else if (seriesKey && monthKey) {
                    state.monthlySeries[seriesKey] = state.monthlySeries[seriesKey] || {};
                    const normalizedValue = normalizeSeriesInputValue(seriesKey, target.value);
                    state.monthlySeries[seriesKey][monthKey] = normalizedValue;
                    target.value = normalizedValue == null ? '' : String(normalizedValue);
                }

                cache.set(versionId, state);
                queueSave(versionId, container);
            });
        });
    }

    window.renderKMPCTab = async function renderKMPCTab() {
        const container = document.getElementById('kmpc-tab');
        if (!container) {
            return;
        }

        const versionId = Number(window.AppState?.currentVersion?.version_id || 0);
        if (!versionId) {
            container.innerHTML = '<div class="loading">Select a forecast version to view KMPC inputs.</div>';
            return;
        }

        const token = ++renderToken;
        container.innerHTML = '<div class="loading">Loading KMPC inputs...</div>';

        try {
            const state = cloneData(await loadState(versionId));
            if (token !== renderToken) {
                return;
            }
            renderShell(container, state);
            cache.set(versionId, state);
            bindInputs(container, state, versionId);
        } catch (error) {
            console.error('Failed to render KMPC tab', error);
            container.innerHTML = '<div class="loading">Failed to load KMPC inputs.</div>';
            if (typeof window.showError === 'function') {
                window.showError(error?.message || 'Failed to load KMPC inputs');
            }
        }
    };

    const FINANCE_PRODUCTS = [
        { financeKey: 'product1', label: 'Product 1', productionLabel: 'Product A', baselineAssets: 20000000000, baselineAccounts: 100000 },
        { financeKey: 'product2', label: 'Product 2', productionLabel: 'Product B', baselineAssets: 15000000000, baselineAccounts: 75000 },
        { financeKey: 'product3', label: 'Product 3', productionLabel: 'Product C', baselineAssets: 10000000000, baselineAccounts: 50000 },
        { financeKey: 'product4', label: 'Product 4', productionLabel: 'Product D', baselineAssets: 5000000000, baselineAccounts: 25000 }
    ];

    const FINANCE_BASELINE_END_MONTH = 'May-24';
    const FINANCE_MONTHLY_RATE_DIVISOR = 12;

    function createSeries(months) {
        return months.reduce((acc, month) => {
            acc[month] = 0;
            return acc;
        }, {});
    }

    function getLastMonthInQuarter(quarter) {
        const quarterMonths = typeof getMonthsInQuarter === 'function' ? getMonthsInQuarter(quarter) : [];
        return quarterMonths.length ? quarterMonths[quarterMonths.length - 1] : null;
    }

    function getLastMonthInYear(months, year) {
        const yearMonths = months.filter(month => getYearFromMonth(month) === year);
        return yearMonths.length ? yearMonths[yearMonths.length - 1] : null;
    }

    function getQuarterAggregate(data, quarter, aggregate) {
        if (aggregate === 'ending') {
            const lastMonth = getLastMonthInQuarter(quarter);
            return lastMonth ? Number(data[lastMonth] || 0) : 0;
        }
        return typeof calculateQuarterSum === 'function' ? calculateQuarterSum(data, quarter) : 0;
    }

    function getYearAggregate(data, months, year, aggregate) {
        if (aggregate === 'ending') {
            const lastMonth = getLastMonthInYear(months, year);
            return lastMonth ? Number(data[lastMonth] || 0) : 0;
        }
        return typeof calculateYearSum === 'function' ? calculateYearSum(data, months, year) : 0;
    }

    function formatSignedValue(value, formatter) {
        const numeric = Number(value) || 0;
        return formatter(numeric);
    }

    function formatAbbreviatedCurrency(value) {
        const numeric = Number(value) || 0;
        const sign = numeric < 0 ? '-' : '';
        const abs = Math.abs(numeric);
        if (abs >= 1000000000) {
            return `${sign}$${(abs / 1000000000).toFixed(1)}B`;
        }
        if (abs >= 1000000) {
            return `${sign}$${(abs / 1000000).toFixed(1)}M`;
        }
        if (abs >= 1000) {
            return `${sign}$${(abs / 1000).toFixed(1)}K`;
        }
        return `${sign}$${abs.toFixed(0)}`;
    }

    function formatAbbreviatedCount(value) {
        const numeric = Number(value) || 0;
        const sign = numeric < 0 ? '-' : '';
        const abs = Math.abs(numeric);
        if (abs >= 1000000) {
            return `${sign}${(abs / 1000000).toFixed(1)}M`;
        }
        if (abs >= 1000) {
            return `${sign}${(abs / 1000).toFixed(1)}K`;
        }
        return `${sign}${abs.toFixed(0)}`;
    }

    function getProductScalarValue(kmpcState, scalarKey, financeKey) {
        return Number(kmpcState?.scalarInputs?.[scalarKey]?.[financeKey]) || 0;
    }

    function getMonthlySeriesValue(kmpcState, seriesKey, month) {
        return Number(kmpcState?.monthlySeries?.[seriesKey]?.[month]) || 0;
    }

    function getProductionAccountsInflow(data, productionLabel, month) {
        const totalAccounts = Number(data?.productionTotals?.[month]?.totalInvestmentAccounts) || 0;
        const mix = Number(data?.productMix?.[productionLabel]?.[month]) || 0;
        return Math.max(0, Math.round(totalAccounts * mix));
    }

    function getProductionAssetsInflow(data, productionLabel, month) {
        const accounts = getProductionAccountsInflow(data, productionLabel, month);
        const abpa = Number(data?.abpa?.[productionLabel]?.[month]) || 0;
        return Math.max(0, accounts * abpa);
    }

    function computeFinanceModel(data, kmpcState) {
        const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
        const baselineCutoffIndex = months.indexOf(FINANCE_BASELINE_END_MONTH);

        const model = {
            months,
            forecastStatus: data?.forecastStatus || {},
            assets: {},
            accounts: {},
            revenue: {
                depositsNii: createSeries(months),
                marginNii: createSeries(months),
                otherNii: createSeries(months),
                totalNii: createSeries(months),
                managedProductFees: createSeries(months),
                tradingRevenue: createSeries(months),
                accountFees: createSeries(months),
                cashOffers: createSeries(months),
                totalNonIi: createSeries(months),
                totalRevenue: createSeries(months)
            },
            kpis: {
                totalEndingAssets: createSeries(months),
                totalEndingAccounts: createSeries(months)
            }
        };

        FINANCE_PRODUCTS.forEach(product => {
            model.assets[product.financeKey] = {
                opening: createSeries(months),
                productionInflows: createSeries(months),
                runRateInflows: createSeries(months),
                runRateOutflows: createSeries(months),
                marketGrowth: createSeries(months),
                ending: createSeries(months)
            };
            model.accounts[product.financeKey] = {
                opening: createSeries(months),
                newAccounts: createSeries(months),
                attrition: createSeries(months),
                ending: createSeries(months)
            };
        });

        months.forEach((month, index) => {
            const inflowsRunRate = Number(kmpcState?.scalarInputs?.inflowsRunRatePct) || 0;
            const outflowsRunRate = Number(kmpcState?.scalarInputs?.outflowsRunRatePct) || 0;
            const spGrowthRate = getMonthlySeriesValue(kmpcState, 'sp500', month);

            FINANCE_PRODUCTS.forEach(product => {
                const assetStore = model.assets[product.financeKey];
                const accountStore = model.accounts[product.financeKey];
                const isBaselineMonth = baselineCutoffIndex >= 0 ? index <= baselineCutoffIndex : false;

                if (isBaselineMonth) {
                    assetStore.opening[month] = product.baselineAssets;
                    assetStore.ending[month] = product.baselineAssets;
                    accountStore.opening[month] = product.baselineAccounts;
                    accountStore.ending[month] = product.baselineAccounts;
                    return;
                }

                const previousMonth = months[index - 1];
                const openingAssets = Number(assetStore.ending[previousMonth]) || product.baselineAssets;
                const openingAccounts = Number(accountStore.ending[previousMonth]) || product.baselineAccounts;
                const productionAssetInflows = getProductionAssetsInflow(data, product.productionLabel, month);
                const productionNewAccounts = getProductionAccountsInflow(data, product.productionLabel, month);
                const runRateInflows = openingAssets * (inflowsRunRate / 100) / FINANCE_MONTHLY_RATE_DIVISOR;
                const runRateOutflows = -openingAssets * (outflowsRunRate / 100) / FINANCE_MONTHLY_RATE_DIVISOR;
                const assetBase = openingAssets + productionAssetInflows + runRateInflows + runRateOutflows;
                const marketGrowth = assetBase * (spGrowthRate / 100);
                const endingAssets = Math.max(0, assetBase + marketGrowth);
                const attritionRate = getProductScalarValue(kmpcState, 'accountAttrition', product.financeKey);
                const attrition = -openingAccounts * (attritionRate / 100);
                const endingAccounts = Math.max(0, openingAccounts + productionNewAccounts + attrition);

                assetStore.opening[month] = openingAssets;
                assetStore.productionInflows[month] = productionAssetInflows;
                assetStore.runRateInflows[month] = runRateInflows;
                assetStore.runRateOutflows[month] = runRateOutflows;
                assetStore.marketGrowth[month] = marketGrowth;
                assetStore.ending[month] = endingAssets;

                accountStore.opening[month] = openingAccounts;
                accountStore.newAccounts[month] = productionNewAccounts;
                accountStore.attrition[month] = attrition;
                accountStore.ending[month] = endingAccounts;
            });

            const totalEndingAssets = FINANCE_PRODUCTS.reduce((sum, product) => sum + (Number(model.assets[product.financeKey].ending[month]) || 0), 0);
            const totalEndingAccounts = FINANCE_PRODUCTS.reduce((sum, product) => sum + (Number(model.accounts[product.financeKey].ending[month]) || 0), 0);
            const depositAvgBalances = getMonthlySeriesValue(kmpcState, 'depositAvgBalances', month);
            const depositIncomeRate = getMonthlySeriesValue(kmpcState, 'depositsInterestIncomeRate', month);
            const depositsRatePaid = getMonthlySeriesValue(kmpcState, 'depositsRatePaid', month);
            const marginIncomeRate = getMonthlySeriesValue(kmpcState, 'marginInterestIncomeRate', month);
            const marginRatePaid = getMonthlySeriesValue(kmpcState, 'marginRatePaid', month);
            const cashOffers = getMonthlySeriesValue(kmpcState, 'cashOffers', month);
            const marginBalance = Number(model.assets.product1?.ending?.[month]) || 0;

            let managedProductFees = 0;
            let tradingRevenue = 0;
            let accountFees = 0;

            FINANCE_PRODUCTS.forEach(product => {
                const endingAssets = Number(model.assets[product.financeKey].ending[month]) || 0;
                const endingAccounts = Number(model.accounts[product.financeKey].ending[month]) || 0;
                const revenueVelocity = getProductScalarValue(kmpcState, 'investmentsRevenueVelocity', product.financeKey);
                const otherFeesPct = getProductScalarValue(kmpcState, 'accountsPayingOtherFeesPct', product.financeKey);
                const otherFeesPerAccount = getProductScalarValue(kmpcState, 'otherFeesPerAccount', product.financeKey);
                const productRevenue = endingAssets * (revenueVelocity / 10000);

                if (product.financeKey === 'product2' || product.financeKey === 'product3') {
                    managedProductFees += productRevenue;
                } else {
                    tradingRevenue += productRevenue;
                }

                accountFees += endingAccounts * (otherFeesPct / 100) * otherFeesPerAccount;
            });

            const depositsNii = depositAvgBalances * ((depositIncomeRate - depositsRatePaid) / 100) / FINANCE_MONTHLY_RATE_DIVISOR;
            const marginNii = marginBalance * ((marginIncomeRate - marginRatePaid) / 100) / FINANCE_MONTHLY_RATE_DIVISOR;
            const otherNii = depositAvgBalances * (depositIncomeRate / 100) / FINANCE_MONTHLY_RATE_DIVISOR;
            const totalNii = depositsNii + marginNii + otherNii;
            const totalNonIi = managedProductFees + tradingRevenue + accountFees + cashOffers;
            const totalRevenue = totalNii + totalNonIi;

            model.kpis.totalEndingAssets[month] = totalEndingAssets;
            model.kpis.totalEndingAccounts[month] = totalEndingAccounts;
            model.revenue.depositsNii[month] = depositsNii;
            model.revenue.marginNii[month] = marginNii;
            model.revenue.otherNii[month] = otherNii;
            model.revenue.totalNii[month] = totalNii;
            model.revenue.managedProductFees[month] = managedProductFees;
            model.revenue.tradingRevenue[month] = tradingRevenue;
            model.revenue.accountFees[month] = accountFees;
            model.revenue.cashOffers[month] = cashOffers;
            model.revenue.totalNonIi[month] = totalNonIi;
            model.revenue.totalRevenue[month] = totalRevenue;
        });

        return model;
    }

    function buildFinanceCellMarkup(value, baseValue, formatter) {
        const currentValue = Number(value) || 0;
        const hasBase = Number.isFinite(Number(baseValue));
        const mainValue = formatSignedValue(currentValue, formatter);

        if (!hasBase) {
            return `<div class="finance-cell finance-cell--plain"><span class="finance-cell__main">${mainValue}</span></div>`;
        }

        const baselineValue = Number(baseValue) || 0;
        const delta = currentValue - baselineValue;
        if (Math.abs(delta) < 0.0001) {
            return `<div class="finance-cell finance-cell--plain"><span class="finance-cell__main">${mainValue}</span></div>`;
        }

        const varianceClass = delta > 0 ? 'is-positive' : 'is-negative';
        const deltaPrefix = delta > 0 ? '+' : '';
        const pctText = Math.abs(baselineValue) > 0.0001
            ? `${deltaPrefix}${((delta / baselineValue) * 100).toFixed(1)}%`
            : 'n/a';

        return `
            <div class="finance-cell">
                <span class="finance-cell__main">${mainValue}</span>
                <span class="finance-cell__variance ${varianceClass}">${deltaPrefix}${formatSignedValue(delta, formatter)} | ${pctText}</span>
            </div>
        `;
    }

    function renderFinanceRow(label, series, compareSeries, months, forecastStatus, formatter, aggregate = 'sum', rowClass = '') {
        const classes = rowClass ? ` class="${rowClass}"` : '';
        let html = `<tr${classes}><td>${label}</td>`;

        months.forEach(month => {
            const isForecast = forecastStatus?.[month] === 'Forecast';
            const compareValue = compareSeries ? compareSeries[month] : undefined;
            html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${buildFinanceCellMarkup(series[month], compareValue, formatter)}</td>`;
        });

        if (Array.isArray(QUARTERS)) {
            QUARTERS.forEach(quarter => {
                const quarterValue = getQuarterAggregate(series, quarter, aggregate);
                const compareValue = compareSeries ? getQuarterAggregate(compareSeries, quarter, aggregate) : undefined;
                html += `<td class="quarter-col">${buildFinanceCellMarkup(quarterValue, compareValue, formatter)}</td>`;
            });
        }

        if (Array.isArray(YEARS)) {
            YEARS.forEach(year => {
                const yearValue = getYearAggregate(series, months, year, aggregate);
                const compareValue = compareSeries ? getYearAggregate(compareSeries, months, year, aggregate) : undefined;
                html += `<td class="year-total-col">${buildFinanceCellMarkup(yearValue, compareValue, formatter)}</td>`;
            });
        }

        html += '</tr>';
        return html;
    }

    function renderFinanceProductDivider(label, totalColumns) {
        return `<tr class="finance-product-divider"><td colspan="${totalColumns}">${label}</td></tr>`;
    }

    function buildFinanceTable(model, compareModel = null, compareLabel = '') {
        const months = model.months;
        const forecastStatus = model.forecastStatus;
        const firstForecastMonth = typeof getFirstForecastMonthKey === 'function'
            ? getFirstForecastMonthKey(forecastStatus, months)
            : (months.find(month => forecastStatus?.[month] === 'Forecast') || null);
        const totalColumns = 1 + months.length + (Array.isArray(QUARTERS) ? QUARTERS.length : 0) + (Array.isArray(YEARS) ? YEARS.length : 0);
        let html = '';
        if (compareModel && compareLabel) {
            html += `<div class="kmpc-card finance-compare-card"><div class="kmpc-card__header"><h3>Scenario Variance</h3><p>Variances are shown only where the scenario differs from ${compareLabel}, with both number and percent change.</p></div></div>`;
        }
        html += '<div class="finance-table-shell"><div class="data-table-wrapper"><table class="data-table finance-table">';
        html += '<thead><tr><th>Metric</th>';
        months.forEach(month => {
            const isForecast = forecastStatus?.[month] === 'Forecast';
            const headerClasses = [isForecast ? 'forecast-col' : 'actual-col'];
            if (month === firstForecastMonth) {
                headerClasses.push('forecast-start-col');
            }
            html += `<th class="${headerClasses.join(' ')}">${month}</th>`;
        });
        if (Array.isArray(QUARTERS)) {
            QUARTERS.forEach(quarter => {
                html += `<th class="quarter-col">${quarter}</th>`;
            });
        }
        if (Array.isArray(YEARS)) {
            YEARS.forEach(year => {
                html += `<th class="year-total-col">FY${year.slice(-2)}</th>`;
            });
        }
        html += '</tr></thead><tbody>';

        html += `<tr><td colspan="${totalColumns}" class="section-header">NII</td></tr>`;
        html += renderFinanceRow('Deposits NII', model.revenue.depositsNii, compareModel?.revenue?.depositsNii, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
        html += renderFinanceRow('Margin NII', model.revenue.marginNii, compareModel?.revenue?.marginNii, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
        html += renderFinanceRow('Other NII', model.revenue.otherNii, compareModel?.revenue?.otherNii, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
        html += renderFinanceRow('Total NII', model.revenue.totalNii, compareModel?.revenue?.totalNii, months, forecastStatus, formatAbbreviatedCurrency, 'sum', 'total-row');

        html += `<tr><td colspan="${totalColumns}" class="section-header">Non-II</td></tr>`;
        html += renderFinanceRow('Managed Product Fees', model.revenue.managedProductFees, compareModel?.revenue?.managedProductFees, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
        html += renderFinanceRow('Trading Revenue', model.revenue.tradingRevenue, compareModel?.revenue?.tradingRevenue, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
        html += renderFinanceRow('Account Fees', model.revenue.accountFees, compareModel?.revenue?.accountFees, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
        html += renderFinanceRow('Cash Offers', model.revenue.cashOffers, compareModel?.revenue?.cashOffers, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
        html += renderFinanceRow('Total Non-II', model.revenue.totalNonIi, compareModel?.revenue?.totalNonIi, months, forecastStatus, formatAbbreviatedCurrency, 'sum', 'total-row');

        html += `<tr><td colspan="${totalColumns}" class="section-header">Total Revenue</td></tr>`;
        html += renderFinanceRow('Total Revenue', model.revenue.totalRevenue, compareModel?.revenue?.totalRevenue, months, forecastStatus, formatAbbreviatedCurrency, 'sum', 'total-row');

        html += `<tr><td colspan="${totalColumns}" class="section-header">Assets Build</td></tr>`;
        FINANCE_PRODUCTS.forEach((product, index) => {
            if (index > 0) {
                html += renderFinanceProductDivider(product.label, totalColumns);
            }
            html += renderFinanceRow(`${product.label} Opening Assets`, model.assets[product.financeKey].opening, compareModel?.assets?.[product.financeKey]?.opening, months, forecastStatus, formatAbbreviatedCurrency, 'ending');
            html += renderFinanceRow(`${product.label} Production Asset Inflows`, model.assets[product.financeKey].productionInflows, compareModel?.assets?.[product.financeKey]?.productionInflows, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
            html += renderFinanceRow(`${product.label} Run-Rate Inflows`, model.assets[product.financeKey].runRateInflows, compareModel?.assets?.[product.financeKey]?.runRateInflows, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
            html += renderFinanceRow(`${product.label} Run-Rate Outflows`, model.assets[product.financeKey].runRateOutflows, compareModel?.assets?.[product.financeKey]?.runRateOutflows, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
            html += renderFinanceRow(`${product.label} Market Growth`, model.assets[product.financeKey].marketGrowth, compareModel?.assets?.[product.financeKey]?.marketGrowth, months, forecastStatus, formatAbbreviatedCurrency, 'sum');
            html += renderFinanceRow(`${product.label} Ending Assets`, model.assets[product.financeKey].ending, compareModel?.assets?.[product.financeKey]?.ending, months, forecastStatus, formatAbbreviatedCurrency, 'ending', 'total-row');
        });
        html += renderFinanceRow('Total Ending Assets', model.kpis.totalEndingAssets, compareModel?.kpis?.totalEndingAssets, months, forecastStatus, formatAbbreviatedCurrency, 'ending', 'total-row');

        html += `<tr><td colspan="${totalColumns}" class="section-header">Accounts Build</td></tr>`;
        FINANCE_PRODUCTS.forEach((product, index) => {
            if (index > 0) {
                html += renderFinanceProductDivider(product.label, totalColumns);
            }
            html += renderFinanceRow(`${product.label} Opening Accounts`, model.accounts[product.financeKey].opening, compareModel?.accounts?.[product.financeKey]?.opening, months, forecastStatus, formatAbbreviatedCount, 'ending');
            html += renderFinanceRow(`${product.label} New Accounts`, model.accounts[product.financeKey].newAccounts, compareModel?.accounts?.[product.financeKey]?.newAccounts, months, forecastStatus, formatAbbreviatedCount, 'sum');
            html += renderFinanceRow(`${product.label} Attrition`, model.accounts[product.financeKey].attrition, compareModel?.accounts?.[product.financeKey]?.attrition, months, forecastStatus, formatAbbreviatedCount, 'sum');
            html += renderFinanceRow(`${product.label} Ending Accounts`, model.accounts[product.financeKey].ending, compareModel?.accounts?.[product.financeKey]?.ending, months, forecastStatus, formatAbbreviatedCount, 'ending', 'total-row');
        });
        html += renderFinanceRow('Total Ending Accounts', model.kpis.totalEndingAccounts, compareModel?.kpis?.totalEndingAccounts, months, forecastStatus, formatAbbreviatedCount, 'ending', 'total-row');

        html += '</tbody></table></div></div>';
        return html;
    }

    window.renderFinanceTab = async function renderFinanceTab(data) {
        const container = document.getElementById('finance-tab');
        if (!container) {
            return;
        }

        const versionId = Number(window.AppState?.currentVersion?.version_id || 0);
        if (!versionId || !data) {
            container.innerHTML = '<div class="loading">Select a forecast version to view finance metrics.</div>';
            return;
        }

        container.innerHTML = '<div class="loading">Loading finance metrics...</div>';

        try {
            const kmpcState = cloneData(await loadState(versionId));
            const model = computeFinanceModel(data, kmpcState);
            let compareModel = null;
            let compareLabel = '';

            if (!window.AppState?.isGroupView && window.AppState?.currentVersion && Number(window.AppState.currentVersion.is_scenario) === 1) {
                const sourceVersionId = Number(window.AppState.currentVersion.source_version_id || 0);
                if (sourceVersionId > 0) {
                    const baseApiData = await window.API.teamData.get(window.AppState.currentTeam, sourceVersionId);
                    const baseData = typeof transformApiData === 'function' ? transformApiData(baseApiData) : null;
                    const baseKmpcState = cloneData(await loadState(sourceVersionId));
                    compareModel = baseData ? computeFinanceModel(baseData, baseKmpcState) : null;
                    compareLabel = window.AppState.currentVersion.source_version_name || 'the live forecast';
                }
            }

            container.innerHTML = buildFinanceTable(model, compareModel, compareLabel);
            if (typeof initializeTableScrollbars === 'function') {
                initializeTableScrollbars(container);
            }
            if (typeof initializeStickySectionDividers === 'function') {
                initializeStickySectionDividers(container);
            }
        } catch (error) {
            console.error('Failed to render finance tab', error);
            container.innerHTML = '<div class="loading">Failed to load finance metrics.</div>';
            if (typeof window.showError === 'function') {
                window.showError(error?.message || 'Failed to load finance metrics');
            }
        }
    };
})();
