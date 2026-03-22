// public/js/render-incentive-tab.js
// Rendering function for the INCENTIVE tab

async function renderIncentiveTab(data) {
    const container = document.getElementById('incentive-content') || document.getElementById('incentive-tab');
    const months = generateMonthList();
    const adminButton = document.getElementById('incentive-admin-btn');

    if (!container) {
        return;
    }

    const isCurrentVersion = AppState.currentVersion?.is_current === false ? false : true;

    if (adminButton) {
        const shouldEnableAdmin = !AppState.isGroupView && isCurrentVersion;
        adminButton.disabled = !shouldEnableAdmin;
    }

    if (AppState.isGroupView && adminButton && typeof adminButton.blur === 'function') {
        adminButton.blur();
    }

    // Show loading while fetching data
    container.innerHTML = '<div class="loading">Loading incentive data...</div>';

    // Get team-specific configuration from API
    const teamId = AppState.currentTeam;
    const versionId = AppState.currentVersion.version_id;
    const firstForecastMonth = typeof getFirstForecastMonthKey === 'function'
        ? getFirstForecastMonthKey(data.forecastStatus, months)
        : (months.find(month => data.forecastStatus[month] === 'Forecast') || months[0]);

    const compensableMetrics = await IncentiveCalculator.getCompensableMetrics(teamId, versionId);

    // For quality ratios, we need to pass a specific period - use the first forecast month
    const qualityRatios = await IncentiveCalculator.getQualityRatios(teamId, firstForecastMonth, versionId);
    const expenseGrid = await IncentiveCalculator.getExpenseGrid(teamId, versionId);
    const targetedPayByYear = await IncentiveCalculator.getTargetedPay(teamId);
    const percentTargets = await IncentiveCalculator.getPercentTargets(teamId, versionId);

    let html = '<div class="data-table-wrapper"><table class="data-table">';
    
    // Header rows
    html += '<thead><tr><th rowspan="2">Target Metric</th>';
    
    // Month headers with business days
    months.forEach((month, idx) => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const headerClasses = [isForecast ? 'forecast-col' : 'actual-col'];
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        html += `<th class="${headerClasses.join(' ')}">${businessDays}</th>`;
    });
    
    // Quarter columns
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">Avg</th>`;
    });
    
    // Year columns
    YEARS.forEach(year => {
        html += `<th class="year-total-col">FY${year.slice(-2)}</th>`;
    });
    html += '</tr><tr>';
    
    // Month names
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const headerClasses = [isForecast ? 'forecast-col' : 'actual-col'];
        if (month === firstForecastMonth) {
            headerClasses.push('forecast-start-col');
        }
        html += `<th class="${headerClasses.join(' ')}">${month}</th>`;
    });
    
    // Quarter labels
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">${quarter}</th>`;
    });
    
    // Year labels
    YEARS.forEach(() => {
        html += '<th class="year-total-col">Avg</th>';
    });
    html += '</tr></thead><tbody>';
    
    const autoRatios = computeAutoRatios(data, teamId, versionId, {
        compensableMetrics,
        qualityRatios,
        expenseGrid,
        targetedPayByYear,
        percentTargets
    });

    // Calculate metrics for each month
    const monthlyMetrics = {};
    let previousArBookBase = 0;
    months.forEach(month => {
        const productionData = IncentiveCalculator.getProductionData(data, month);
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const priorYearMonth = getMonthOffset(month, -12);
        const priorYearArBookBase = priorYearMonth ? monthlyMetrics[priorYearMonth]?.arBookBase : null;
        
        monthlyMetrics[month] = IncentiveCalculator.calculateMetrics(
            teamId,
            month,
            productionData,
            compensableMetrics,
            qualityRatios,
            expenseGrid,
            targetedPayByYear,
            percentTargets,
            autoRatios,
            previousArBookBase,
            priorYearArBookBase,
            isForecast
        );
        previousArBookBase = monthlyMetrics[month]?.arBookNextBase ?? previousArBookBase;
    });
    
    const totalColumns = 1 + months.length + QUARTERS.length + YEARS.length;

    const formatters = {
        integer: (value) => Math.round(value).toLocaleString(),
        millionsOneDecimal: (value) => (value / 1000000).toFixed(1),
        currencyDynamic: (value) => {
            const absValue = Math.abs(value);
            if (absValue >= 1000000) {
                return `$${(value / 1000000).toFixed(1)}M`;
            }
            if (absValue >= 1000) {
                return `$${Math.round(value / 1000)}K`;
            }
            return `$${Math.round(value)}`;
        },
        currency: (value) => `$${Math.round(value).toLocaleString()}`,
        currencyThousands: (value) => `$${(value / 1000).toFixed(1)}K`,
        currencyMillions: (value) => `$${(value / 1_000_000).toFixed(1)}M`,
        percent: (value) => `${(value * 100).toFixed(1)}%`
    };

    const takeLastValue = (values = []) => {
        const filtered = values.filter(value => value !== null && value !== undefined && Number.isFinite(value));
        return filtered.length ? filtered[filtered.length - 1] : null;
    };

    const adjustForPercentTarget = (value, percent, month) => {
        if (!Number.isFinite(value)) return value;
        if (!month) return value;
        const isForecastCol = data.forecastStatus[month] === 'Forecast';
        if (!isForecastCol) return value;
        const ratio = Number(percent);
        if (!Number.isFinite(ratio) || ratio === 0) return value;
        return value / ratio;
    };

    function getMonthOffset(month, offset) {
        if (!month || !Number.isInteger(offset)) return null;
        const currentIndex = months.indexOf(month);
        if (currentIndex === -1) return null;
        const targetIndex = currentIndex + offset;
        if (targetIndex < 0 || targetIndex >= months.length) {
            return null;
        }
        return months[targetIndex];
    }

    const computeArBookDisplayValue = (metrics, month) => {
        return adjustForPercentTarget(metrics?.arBookBase, metrics?.arPercentToTarget, month);
    };

    const sections = [
        {
            title: 'Performance Metrics',
            rows: [
                {
                    label: 'Total Productive HC',
                    formatter: formatters.integer,
                    valueGetter: (metrics) => metrics?.productiveHeadcountBase
                },
                {
                    label: 'QS',
                    className: 'subtotal-row',
                    formatter: formatters.integer,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.accountsPerAdvisor, metrics?.qsPercentToTarget, month)
                },
                {
                    label: 'QS % to Target',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.qsPercentToTarget
                },
                {
                    label: 'QS Achievement rate',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.isForecast ? '' : metrics?.qsAchievementRate
                },
                {
                    label: 'BG',
                    className: 'subtotal-row',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.assetsPerAdvisor, metrics?.bgPercentToTarget, month)
                },
                {
                    label: 'BG % to Target',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.bgPercentToTarget
                },
                {
                    label: 'BG Achievement rate',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.isForecast ? '' : metrics?.bgAchievementRate
                },
                {
                    label: 'AR',
                    className: 'subtotal-row',
                    formatter: formatters.currencyMillions,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.arTotalPerAdvisor, metrics?.arPercentToTarget, month)
                },
                {
                    label: 'AR % to Target',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.arPercentToTarget
                }
            ]
        },
        {
            title: 'Compensation Summary',
            rows: [
                {
                    label: 'Avg. Payout',
                    formatter: formatters.currency,
                    valueGetter: (metrics) => metrics?.averagePayout
                },
                {
                    label: '% to Targeted Pay',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.percentToTargetedPay
                },
                {
                    label: 'Total Expense',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics) => metrics?.totalExpense,
                    aggregate: 'sum'
                }
            ]
        },
        {
            title: 'Payout Weighting',
            rows: [
                {
                    label: 'QS Expense % of Total',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.qsExpensePercentOfTotal
                },
                {
                    label: 'BG Expense % of Total',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.bgExpensePercentOfTotal
                },
                {
                    label: 'AR Expense % of Total',
                    formatter: formatters.percent,
                    valueGetter: (metrics) => metrics?.arExpensePercentOfTotal
                }
            ]
        },
        {
            title: 'Volume Drivers',
            rows: [
                {
                    label: 'Investments QS',
                    formatter: formatters.integer,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.investmentsQs, metrics?.qsPercentToTarget, month),
                    aggregate: 'sum'
                },
                {
                    label: 'Investments BG',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.investmentsBg, metrics?.bgPercentToTarget, month),
                    aggregate: 'sum'
                },
                {
                    label: 'Banking QS',
                    formatter: formatters.integer,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.bankingQs, metrics?.qsPercentToTarget, month),
                    aggregate: 'sum'
                },
                {
                    label: 'Banking BG',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.bankingBg, metrics?.bgPercentToTarget, month),
                    aggregate: 'sum'
                },
                {
                    label: 'AR Enroll',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.arEnrollTotal, metrics?.arPercentToTarget, month),
                    aggregate: 'sum'
                },
                {
                    label: 'AR Book',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics, month) => computeArBookDisplayValue(metrics, month),
                    aggregate: takeLastValue
                },
                {
                    label: 'AR Ramp',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics, month) => adjustForPercentTarget(metrics?.arRampTotal, metrics?.arPercentToTarget, month),
                    aggregate: 'sum'
                },
                {
                    label: 'WM QS',
                    formatter: formatters.integer,
                    valueGetter: (metrics) => metrics?.wmQs,
                    aggregate: 'sum'
                },
                {
                    label: 'WM BG',
                    formatter: formatters.currencyDynamic,
                    valueGetter: (metrics) => metrics?.wmBg,
                    aggregate: 'sum'
                }
            ]
        }
    ];

    const renderSectionHeader = (title) => {
        html += `<tr><td colspan="${totalColumns}" class="section-header">${title}</td></tr>`;
    };

    const formatCellValue = (value, formatter) => {
        if (value === '') {
            return '';
        }
        if (value === null || value === undefined || Number.isNaN(value)) {
            return '--';
        }
        if (typeof formatter === 'function') {
            return formatter(value);
        }
        return value;
    };

    const getAggregateValue = (row, periodMonths) => {
        const values = periodMonths
            .map(month => {
                const metrics = monthlyMetrics[month];
                return row.valueGetter(metrics, month);
            })
            .filter(value => Number.isFinite(value));

        if (!values.length) {
            return null;
        }

        if (typeof row.aggregate === 'function') {
            return row.aggregate(values);
        }

        if (row.aggregate === 'sum') {
            return values.reduce((sum, val) => sum + val, 0);
        }

        return calculateAverage(values);
    };

    const renderMetricRow = (row) => {
        const rowClass = row.className ? ` class="${row.className}"` : '';
        html += `<tr${rowClass}><td>${row.label}</td>`;

        months.forEach(month => {
            const metrics = monthlyMetrics[month];
            const rawValue = row.valueGetter(metrics, month);
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const isBlankCell = rawValue === '';
            const cellValue = isBlankCell ? '' : formatCellValue(rawValue, row.formatter);
            const cellClasses = [
                isForecast ? 'forecast-col' : 'actual-col',
                isBlankCell ? 'blank-cell' : null
            ].filter(Boolean).join(' ');
            html += `<td class="${cellClasses}">${cellValue}</td>`;
        });

        QUARTERS.forEach(quarter => {
            const quarterMonths = getMonthsInQuarter(quarter).filter(m => monthlyMetrics[m]);
            const aggregateValue = getAggregateValue(row, quarterMonths);
            html += `<td class="quarter-col">${formatCellValue(aggregateValue, row.formatter)}</td>`;
        });

        YEARS.forEach(year => {
            const yearMonths = months.filter(m => getYearFromMonth(m) === year);
            const aggregateValue = getAggregateValue(row, yearMonths);
            html += `<td class="year-total-col">${formatCellValue(aggregateValue, row.formatter)}</td>`;
        });

        html += '</tr>';
    };

    sections.forEach((section, index) => {
        if (index > 0) {
            renderSectionHeader(section.title);
        }
        section.rows.forEach(renderMetricRow);
    });
    
    html += '</tbody></table></div>';
    
    container.innerHTML = html;
    if (typeof initializeTableScrollbars === 'function') {
        initializeTableScrollbars(container);
    }
    if (typeof initializeStickySectionDividers === 'function') {
        initializeStickySectionDividers(container);
    }

    // Persist and restore horizontal scroll for better live-preview UX
    try {
        const wrapper = container.querySelector('.data-table-wrapper');
        if (wrapper) {
            // Restore last position if we have one
            if (typeof AppState !== 'undefined' && AppState.scrollPositions && AppState.scrollPositions.incentive !== undefined) {
                const saved = AppState.scrollPositions.incentive;
                if (!isNaN(saved)) {
                    requestAnimationFrame(() => { wrapper.scrollLeft = saved; });
                }
            }
            // Keep saving as user scrolls so refreshes don't jump
            wrapper.addEventListener('scroll', () => {
                if (typeof AppState !== 'undefined' && AppState.scrollPositions) {
                    AppState.scrollPositions.incentive = wrapper.scrollLeft;
                }
            }, { passive: true });
        }
    } catch (e) { /* no-op */ }
}

function seededRatio(seed, min = 0.02, max = 0.06) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
    }
    const normalized = (Math.sin(hash) + 1) / 2;
    return min + (max - min) * normalized;
}

function computeAutoRatios(teamData, teamId, versionId, options = {}) {
    const {
        compensableMetrics = {},
        qualityRatios = {},
        expenseGrid = DEFAULT_EXPENSE_GRID,
        targetedPayByYear = {},
        percentTargets = null
    } = options;
    if (!teamData || !teamData.forecastStatus) {
        return {};
    }
    const months = generateMonthList();
    const actualMonths = months.filter(month => teamData.forecastStatus[month] === 'Actual');
    const trailing = actualMonths.slice(-12);
    let investQsSum = 0;
    let wmQsSum = 0;
    let investBgSum = 0;
    let wmBgSum = 0;
    let arEnrollSum = 0;
    let arRampSum = 0;
    let previousArBookBase = 0;

    trailing.forEach(month => {
        const totals = teamData.productionTotals?.[month];
        if (!totals) return;
        const investmentQs = (totals.investmentAccounts || 0) + (totals.bankingAccounts || 0);
        const investmentBg = (totals.investmentAssets || 0) + (totals.bankingAssets || 0);
        if (investmentQs > 0) {
            const ratio = seededRatio(`wm-qs-${teamId}-${month}`);
            wmQsSum += investmentQs * ratio;
            investQsSum += investmentQs;
        }
        if (investmentBg > 0) {
            const ratioBg = seededRatio(`wm-bg-${teamId}-${month}`);
            wmBgSum += investmentBg * ratioBg;
            investBgSum += investmentBg;
        }

        if (typeof IncentiveCalculator !== 'undefined' && IncentiveCalculator?.calculateMetrics) {
            const productionData = IncentiveCalculator.getProductionData(teamData, month);
            if (productionData) {
                const metrics = IncentiveCalculator.calculateMetrics(
                    teamId,
                    month,
                    productionData,
                    compensableMetrics,
                    qualityRatios,
                    expenseGrid,
                    targetedPayByYear,
                    percentTargets,
                    null,
                    previousArBookBase,
                    null,
                    false
                );
                previousArBookBase = metrics?.arBookNextBase ?? previousArBookBase;
                const enroll = Number(metrics?.arEnrollTotal);
                const ramp = Number(metrics?.arRampTotal);
        if (Number.isFinite(enroll) && enroll > 0) {
            arEnrollSum += enroll;
        }
        if (Number.isFinite(ramp) && ramp > 0) {
            arRampSum += ramp;
        }
            }
        }
    });

    const autoRatios = {
        autoWmQsRatio: investQsSum > 0 ? wmQsSum / investQsSum : null,
        autoWmBgRatio: investBgSum > 0 ? wmBgSum / investBgSum : null
    };

    const mockSpecs = [
        { key: 'investment_accounts', min: 0.8, max: 1.0 },
        { key: 'investment_assets', min: 0.8, max: 1.0 },
        { key: 'banking_accounts', min: 0.8, max: 1.0 },
        { key: 'banking_assets', min: 0.8, max: 1.0 },
        { key: 'ar_ramp', min: 0.02, max: 0.06 }
    ];
    mockSpecs.forEach(spec => {
        const seed = `${spec.key}-${teamId}-${versionId ?? 'default'}`;
        if (spec.key === 'ar_ramp') {
            const derived = arEnrollSum > 0 && arRampSum > 0 ? (arRampSum / arEnrollSum) : null;
            if (Number.isFinite(derived) && derived > 0) {
                autoRatios[spec.key] = derived;
                return;
            }
        }
        if (!Number.isFinite(autoRatios[spec.key]) || autoRatios[spec.key] <= 0) {
            autoRatios[spec.key] = seededRatio(seed, spec.min, spec.max);
        }
    });

    return autoRatios;
}

let incentiveModalEscapeHandler = null;

function openIncentiveAdminModal(teamId, versionId) {
    const modal = document.getElementById('incentiveAdminModal');
    const frame = document.getElementById('incentiveAdminFrame');

    const resolvedTeam = Number.isFinite(Number(teamId)) ? Number(teamId) : (window.AppState?.currentTeam ?? null);
    const resolvedVersion = Number.isFinite(Number(versionId)) ? Number(versionId) : (window.AppState?.currentVersion?.version_id ?? null);

    const params = new URLSearchParams();
    if (resolvedTeam !== null && resolvedTeam !== undefined && !Number.isNaN(resolvedTeam)) {
        params.set('teamId', resolvedTeam);
    }
    if (resolvedVersion !== null && resolvedVersion !== undefined && !Number.isNaN(resolvedVersion)) {
        params.set('versionId', resolvedVersion);
    }
    const url = params.toString() ? `/incentive-admin.html?${params.toString()}` : '/incentive-admin.html';

    if (!modal || !frame) {
        window.open(url, '_blank');
        return;
    }

    if (frame.dataset.currentSrc !== url) {
        frame.src = url;
        frame.dataset.currentSrc = url;
    }

    if (!modal.dataset.outsideCloseBound) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeIncentiveAdminModal();
            }
        });
        modal.dataset.outsideCloseBound = 'true';
    }

    if (!incentiveModalEscapeHandler) {
        incentiveModalEscapeHandler = (event) => {
            if (event.key === 'Escape') {
                closeIncentiveAdminModal();
            }
        };
    }
    document.addEventListener('keydown', incentiveModalEscapeHandler);

    modal.style.display = 'block';
    modal.classList.add('active');
}

function closeIncentiveAdminModal() {
    const modal = document.getElementById('incentiveAdminModal');
    if (!modal) {
        return;
    }

    modal.style.display = 'none';
    modal.classList.remove('active');

    const frame = document.getElementById('incentiveAdminFrame');
    if (frame) {
        delete frame.dataset.currentSrc;
        frame.src = 'about:blank';
    }

    if (incentiveModalEscapeHandler) {
        document.removeEventListener('keydown', incentiveModalEscapeHandler);
    }
}
// Helper function to calculate average
function calculateAverage(values) {
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
}

// Export to make it available globally
window.openIncentiveAdminModal = openIncentiveAdminModal;
window.closeIncentiveAdminModal = closeIncentiveAdminModal;
window.renderIncentiveTab = renderIncentiveTab;
