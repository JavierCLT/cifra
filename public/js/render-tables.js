// public/js/render-tables.js - Table rendering functions

// ========== CONFIGURATION SECTION ==========
const TABLE_CONFIG = {
    startYear: 2023,
    endYear: 2025,  // Just change this to add more years (e.g., 2027)
    monthNames: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
};

// Derived configurations
const YEARS = [];
for (let year = TABLE_CONFIG.startYear; year <= TABLE_CONFIG.endYear; year++) {
    YEARS.push(year.toString());
}

const QUARTERS = [];
for (let year = TABLE_CONFIG.startYear; year <= TABLE_CONFIG.endYear; year++) {
    const yearShort = year.toString().slice(-2);
    for (let q = 1; q <= 4; q++) {
        QUARTERS.push(`${q}Q${yearShort}`);
    }
}

// ========== MONTH GENERATION ==========
function generateMonthList() {
    const months = [];
    
    for (let year = TABLE_CONFIG.startYear; year <= TABLE_CONFIG.endYear; year++) {
        for (let month = 0; month < 12; month++) {
            months.push(`${TABLE_CONFIG.monthNames[month]}-${year.toString().slice(-2)}`);
        }
    }
    
    return months;
}

// Get year from month string
function getYearFromMonth(month) {
    return '20' + month.split('-')[1];
}

// Get quarter from month
function getQuarterFromMonth(month) {
    const monthIndex = TABLE_CONFIG.monthNames.indexOf(month.split('-')[0]);
    const quarter = Math.floor(monthIndex / 3) + 1;
    const year = month.split('-')[1];
    return `${quarter}Q${year}`;
}

// Get months in quarter
function getMonthsInQuarter(quarter) {
    const [q, year] = quarter.split('Q');
    const qNum = parseInt(q);
    const startMonth = (qNum - 1) * 3;
    
    return [
        `${TABLE_CONFIG.monthNames[startMonth]}-${year}`,
        `${TABLE_CONFIG.monthNames[startMonth + 1]}-${year}`,
        `${TABLE_CONFIG.monthNames[startMonth + 2]}-${year}`
    ];
}

// Calculate average for year columns
function calculateYearAverage(data, months, year) {
    const yearMonths = months.filter(m => getYearFromMonth(m) === year);
    const sum = yearMonths.reduce((acc, month) => acc + (data[month] || 0), 0);
    return Math.round(sum / yearMonths.length);
}

// Calculate sum for year columns
function calculateYearSum(data, months, year) {
    const yearMonths = months.filter(m => getYearFromMonth(m) === year);
    return yearMonths.reduce((acc, month) => acc + (data[month] || 0), 0);
}

// Calculate quarter average
function calculateQuarterAverage(data, quarter) {
    const months = getMonthsInQuarter(quarter);
    const validMonths = months.filter(m => data[m] !== undefined);
    const sum = validMonths.reduce((acc, month) => acc + (data[month] || 0), 0);
    return validMonths.length > 0 ? Math.round(sum / validMonths.length) : 0;
}

// Calculate quarter sum
function calculateQuarterSum(data, quarter) {
    const months = getMonthsInQuarter(quarter);
    return months.reduce((acc, month) => acc + (data[month] || 0), 0);
}

// Format number with thousand separators
function formatNumber(num) {
    return num.toLocaleString();
}

function formatThousands(num, digits = 1) {
    const value = Number(num);
    if (!Number.isFinite(value)) {
        return "0";
    }
    const thousands = value / 1000;
    return thousands.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

// Remove formatting for editing
function removeFormatting(input) {
    input.value = input.value.replace(/,/g, '');
}

// Add formatting after editing
function addFormatting(input) {
    const value = parseFloat(input.value.replace(/,/g, '')) || 0;
    input.value = value.toLocaleString();
}

function canEditSelectedForecast() {
    return !AppState.isGroupView && !!AppState.currentVersion && !AppState.currentVersion.is_locked;
}

function getFirstForecastMonthKey(forecastStatus, months = generateMonthList()) {
    if (!forecastStatus || !Array.isArray(months)) {
        return null;
    }
    return months.find(month => forecastStatus[month] === 'Forecast') || null;
}

window.getFirstForecastMonthKey = getFirstForecastMonthKey;

function initializeStickySectionDividers(root) {
    const context = root instanceof HTMLElement ? root : document;
    const wrapper = context.querySelector('.data-table-wrapper');
    if (!wrapper) {
        return;
    }

    const host = wrapper.parentElement || context;
    if (!host) {
        return;
    }

    host.classList.add('table-divider-container');

    let overlay = Array.from(host.children).find(child => child.classList?.contains('table-section-overlay'));
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'table-section-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        host.insertBefore(overlay, wrapper);
    }

    const table = wrapper.querySelector('table.data-table');
    if (!table) {
        overlay.innerHTML = '';
        return;
    }

    const renderBands = () => {
        const rows = Array.from(table.querySelectorAll('tbody tr')).filter(row => row.querySelector('td.section-header'));
        overlay.innerHTML = '';
        if (!rows.length) {
            return;
        }

        const wrapperOffset = wrapper.offsetTop;
        rows.forEach(row => {
            const cell = row.querySelector('td.section-header');
            const title = cell?.textContent?.trim();
            if (!title) {
                return;
            }
            const band = document.createElement('div');
            band.className = 'table-section-band';
            band.style.top = `${wrapperOffset + row.offsetTop}px`;
            band.innerHTML = `<span class="table-section-band__title">${title}</span>`;
            overlay.appendChild(band);
        });
    };

    if (host.__sectionDividerObserver) {
        host.__sectionDividerObserver.disconnect();
    }
    if (host.__sectionDividerResizeHandler) {
        window.removeEventListener('resize', host.__sectionDividerResizeHandler);
    }

    const refresh = () => requestAnimationFrame(renderBands);
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(refresh);
        observer.observe(wrapper);
        observer.observe(table);
        host.__sectionDividerObserver = observer;
    }

    host.__sectionDividerResizeHandler = refresh;
    window.addEventListener('resize', refresh);
    renderBands();
}

window.initializeStickySectionDividers = initializeStickySectionDividers;

function renderHeadcountFlowsTable(data, months, opts = {}) {
    const DEFAULT_FLOW_ROWS = [
        { key: 'starting_headcount', label: 'Starting Headcount', isStarting: true },
        { key: 'flow_1', label: 'Flow 1' },
        { key: 'flow_2', label: 'Flow 2' },
        { key: 'flow_3', label: 'Flow 3' },
        { key: 'flow_4', label: 'Flow 4' },
        { key: 'flow_5', label: 'Flow 5' },
        { key: 'ending_headcount', label: 'Ending Headcount', isCalculated: true }
    ];
    const flowRows = Array.isArray(window.HEADCOUNT_FLOW_ROWS) && window.HEADCOUNT_FLOW_ROWS.length ? window.HEADCOUNT_FLOW_ROWS : DEFAULT_FLOW_ROWS;
    if (!flowRows.length || !data) {
        return '';
    }

    const forecastStatus = data.forecastStatus || {};
    const flows = data.headcountFlows || {};
    const teamId = opts.teamId || AppState.currentTeam;
    const allowEditing = canEditSelectedForecast();
    const editableKeys = new Set(flowRows.filter(row => !row.isCalculated && !row.isStarting).map(row => row.key));

    let html = '<div class="headcount-flow-container"><table class="data-table headcount-flow-table">';
    html += '<thead><tr><th rowspan="2">Flow</th>';
    months.forEach((month, idx) => {
        const isForecast = forecastStatus[month] === 'Forecast';
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${businessDays}</th>`;
    });
    QUARTERS.forEach(() => {
        html += '<th class="quarter-col">Avg</th>';
    });
    YEARS.forEach(year => {
        html += `<th class="year-total-col">FY${year.slice(-2)}</th>`;
    });
    html += '</tr><tr>';
    months.forEach(month => {
        const isForecast = forecastStatus[month] === 'Forecast';
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${month}</th>`;
    });
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">${quarter}</th>`;
    });
    YEARS.forEach(() => {
        html += '<th class="year-total-col">Avg</th>';
    });
    html += '</tr></thead><tbody>';

    flowRows.forEach(row => {
        const rowValues = flows[row.key] || {};
        html += `<tr><td>${row.label}</td>`;
        months.forEach(month => {
            const isForecast = forecastStatus[month] === 'Forecast';
            const baseClass = isForecast ? 'forecast-col' : 'actual-col';
            const value = Number(rowValues[month] ?? 0);
            const editable = allowEditing && isForecast && editableKeys.has(row.key);
            if (editable) {
                html += `<td class="${baseClass}"><input type="number" class="selectable-input" data-month="${month}" data-flow-key="${row.key}" data-team="${teamId}" value="${value}" onchange="handleHeadcountFlowChange(this)"></td>`;
            } else {
                html += `<td class="${baseClass}" data-flow-team="${teamId}" data-flow-key="${row.key}" data-month="${month}">${value}</td>`;
            }
        });
        QUARTERS.forEach(quarter => {
            const avg = calculateQuarterAverage(rowValues, quarter);
            html += `<td class="quarter-col">${avg}</td>`;
        });
        YEARS.forEach(year => {
            const avg = calculateYearAverage(rowValues, months, year);
            html += `<td class="year-total-col">${avg}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
}
// Render headcount tab (supports Sales and Non-Sales modes)
function renderHeadcountTab(data, opts = {}) {
    const containerId = opts.containerId || 'headcount-tab';
    const mode = opts.mode || 'sales'; // 'sales' | 'non-sales'
    const container = document.getElementById(containerId);
    const changeHandler = mode === 'non-sales' ? 'handleNonSalesHeadcountChange' : 'handleHeadcountChange';
    const months = generateMonthList();
    let html = '';
    html += '<div class="data-table-wrapper headcount-scroll-wrapper">';

    const toolbar = document.getElementById('headcount-toolbar');
    const subtabsEl = document.getElementById('headcount-subtabs');
    const adminButton = document.getElementById('headcount-admin-btn');

    if (toolbar) {
        toolbar.style.display = 'flex';
    }
    if (subtabsEl) {
        subtabsEl.style.display = 'inline-flex';
    }
    if (adminButton) {
        const shouldShowAdmin = mode === 'sales' && !AppState.isGroupView;
        adminButton.style.display = shouldShowAdmin ? '' : 'none';
    }

    if (mode === 'sales' && !AppState.isGroupView) {
        const flowsHtml = renderHeadcountFlowsTable(data, months, { teamId: AppState.currentTeam });
        if (flowsHtml) {
            html += flowsHtml;
        }

    }

    html += '<table class="data-table">';
    
    // Header rows
    html += '<thead><tr><th rowspan="2">PG Level</th>';
    
    // Add month headers with business days
    months.forEach((month, idx) => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${businessDays}</th>`;
    });
    
    // Add quarter headers
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">Avg</th>`;
    });
    
    // Add year total headers - dynamically generated
    YEARS.forEach(year => {
        html += `<th class="year-total-col">FY${year.slice(-2)}</th>`;
    });
    html += '</tr><tr>';
    
    // Month names row
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${month}</th>`;
    });
    
    // Quarter labels
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">${quarter}</th>`;
    });
    
    // Year average labels
    YEARS.forEach(() => {
        html += '<th class="year-total-col">Avg</th>';
    });
    html += '</tr></thead><tbody>';
    
    // PG Level rows
    PG_LEVELS.forEach(pg => {
        html += `<tr><td>${pg}</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = data.pgLevels[pg][month];
            
            // Check if this is the current forecast (version_id = 2)
            const isCurrentForecast = canEditSelectedForecast();
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td class="forecast-col">
                    <input type="number" 
                           value="${value}" 
                           data-month="${month}" 
                           data-pg="${pg}"
                           data-team="${AppState.currentTeam}"
                           data-metric="headcount"
                           class="selectable-input"
                           onchange="${changeHandler}(this)">
                </td>`;
            } else {
                html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}</td>`;
            }
        });
        
        // Quarter averages
        QUARTERS.forEach(quarter => {
            const avg = calculateQuarterAverage(data.pgLevels[pg], quarter);
            html += `<td class="quarter-col">${avg}</td>`;
        });
        
        // Year averages - using YEARS array
        YEARS.forEach(year => {
            const avg = calculateYearAverage(data.pgLevels[pg], months, year);
            html += `<td class="year-total-col">${avg}</td>`;
        });
        
        html += '</tr>';
    });
    
    // Total row
    const totalLabel = mode === 'non-sales' ? 'Total Non-Sales Headcount' : 'Total Productive HC';
    const idPrefix = mode === 'non-sales' ? 'ns-' : '';
    html += `<tr class="total-row"><td>${totalLabel}</td>`;
    months.forEach(month => {
        const total = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}" id="${idPrefix}headcount-total-${month}">${total}</td>`;
    });
    
    // Quarter total averages
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const quarterTotals = quarterMonths.map(month => 
            PG_LEVELS.reduce((sum, pg) => sum + (data.pgLevels[pg][month] || 0), 0)
        );
        const avg = quarterTotals.length > 0 ? 
            Math.round(quarterTotals.reduce((a, b) => a + b, 0) / quarterTotals.length) : 0;
        html += `<td class="quarter-col">${avg}</td>`;
    });
    
    // Year total averages - using YEARS array
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const yearTotals = yearMonths.map(month => 
            PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0)
        );
        const avg = Math.round(yearTotals.reduce((a, b) => a + b, 0) / yearTotals.length);
        html += `<td class="year-total-col" id="headcount-year-avg-${year}">${avg}</td>`;
    });
    
    html += '</tr></tbody></table></div>';
    container.innerHTML = html;

    initializeTableScrollbars(container);
    initializeStickySectionDividers(container);

    // Setup input selection for bulk operations
    setupInputSelection();
}

function renderNonSalesHeadcountTab(groupData, opts = {}) {
    const containerId = opts.containerId || 'non-sales-headcount-subtab';
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }
    if (!groupData || !groupData.teams) {
        container.innerHTML = '<div class="loading">Non-sales data unavailable...</div>';
        return;
    }

    const months = generateMonthList();
    const statusMap = groupData.forecastStatus || {};
    const groupKey = groupData.groupKey || AppState.currentNonSalesGroup || 'non-sales';
    const allowEditing = canEditSelectedForecast();

    const teamOrder = Array.isArray(groupData.teamOrder) && groupData.teamOrder.length
        ? groupData.teamOrder
        : Object.keys(groupData.teams);
    const teams = teamOrder
        .map(teamId => groupData.teams[teamId])
        .filter(Boolean);

    if (!teams.length) {
        container.innerHTML = '<div class="loading">No teams configured for this non-sales group.</div>';
        return;
    }

    const totalsByMonth = months.reduce((acc, month) => {
        acc[month] = 0;
        return acc;
    }, {});

    let html = '<div class="data-table-wrapper"><table class="data-table">';

    html += '<thead><tr><th rowspan="2">Team</th>';
    months.forEach((month, idx) => {
        const isForecast = statusMap[month] === 'Forecast';
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${businessDays}</th>`;
    });
    QUARTERS.forEach(() => {
        html += '<th class="quarter-col">Avg</th>';
    });
    YEARS.forEach(() => {
        html += '<th class="year-total-col">Avg</th>';
    });
    html += '</tr><tr>';
    months.forEach(month => {
        const isForecast = statusMap[month] === 'Forecast';
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${month}</th>`;
    });
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">${quarter}</th>`;
    });
    YEARS.forEach(year => {
        html += `<th class="year-total-col">FY${year.slice(-2)}</th>`;
    });
    html += '</tr></thead><tbody>';

    teams.forEach(team => {
        const values = team.values || {};
        html += `<tr><td>${team.teamName || team.team_name || team.teamId}</td>`;
        months.forEach(month => {
            const value = values[month] ?? 0;
            totalsByMonth[month] += value;
            const isForecast = statusMap[month] === 'Forecast';
            if (isForecast && allowEditing) {
                html += `<td class="forecast-col">
                    <input type="number"
                           value="${value}"
                           data-month="${month}"
                           data-group="${groupKey}"
                           data-team-id="${team.teamId || team.team_id}"
                           data-team-name="${team.teamName || team.team_name || ''}"
                           data-metric="headcount"
                           class="selectable-input"
                           onchange="handleNonSalesHeadcountChange(this)">
                </td>`;
            } else {
                html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}</td>`;
            }
        });

        QUARTERS.forEach(quarter => {
            const avg = calculateQuarterAverage(values, quarter);
            html += `<td class="quarter-col">${avg}</td>`;
        });

        YEARS.forEach(year => {
            const avg = calculateYearAverage(values, months, year);
            html += `<td class="year-total-col">${avg}</td>`;
        });

        html += '</tr>';
    });

    html += '<tr class="total-row"><td>Total Non-Sales Headcount</td>';
    months.forEach(month => {
        const isForecast = statusMap[month] === 'Forecast';
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}" id="ns-headcount-total-${groupKey}-${month}">${totalsByMonth[month]}</td>`;
    });

    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const values = quarterMonths.map(month => totalsByMonth[month] || 0);
        const avg = values.length ? Math.round(values.reduce((sum, val) => sum + val, 0) / values.length) : 0;
        html += `<td class="quarter-col">${avg}</td>`;
    });

    YEARS.forEach(year => {
        const yearMonths = months.filter(month => getYearFromMonth(month) === year);
        const values = yearMonths.map(month => totalsByMonth[month] || 0);
        const avg = values.length ? Math.round(values.reduce((sum, val) => sum + val, 0) / values.length) : 0;
        html += `<td class="year-total-col" id="ns-headcount-year-avg-${groupKey}-${year}">${avg}</td>`;
    });

    html += '</tr></tbody></table></div>';
    container.innerHTML = html;
    initializeTableScrollbars(container);
    initializeStickySectionDividers(container);
    setupInputSelection();
}
// Render production tab
function renderProductionBaselineColumn(data, months, mode = 'investments') {
    if (AppState.isGroupView) return '';

    const baselineState = getProductionBaselineState(mode);
    if (!baselineState) return '';

    const period = baselineState.period || 12;
    const averages = computeProductionBaselineAverages(data, months, period, mode);

    if (mode === 'banking') {
        ADDITIONAL_PRODUCTS.forEach(product => {
            if (baselineState.productivity[product] == null) {
                baselineState.productivity[product] = Number(toNumber(averages.productivity?.[product], 0).toFixed(2));
            }
            if (baselineState.abpa[product] == null) {
                baselineState.abpa[product] = Math.round(toNumber(averages.abpa?.[product], 0));
            }
        });
    } else {
        if (baselineState.productivity == null) {
            baselineState.productivity = Number(toNumber(averages.productivity, 0).toFixed(2));
        }
        if (baselineState.deepeningPercent == null) {
            baselineState.deepeningPercent = toNumber(averages.deepeningPercent, 0);
        }

        PRODUCTS.forEach(product => {
            if (baselineState.mix[product] == null) {
                baselineState.mix[product] = toNumber(averages.mix[product], 0);
            }
            if (baselineState.abpa[product] == null) {
                baselineState.abpa[product] = Math.round(toNumber(averages.abpa[product], 0));
            }
        });
    }

    const allowEditing = canEditSelectedForecast();
    const slugifyValue = (value) => (typeof slugify === 'function' ? slugify(value) : String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const periodOptions = [6, 12, 18].map(option => `<option value="${option}" ${option === period ? 'selected' : ''}>${option} months</option>`).join('');
    const periodSelectId = `production-baseline-period-${mode}`;

    let html = `<div class="production-baseline-column" data-baseline-mode="${mode}">`;
    html += `
        <div class="baseline-top">
            <h3 class="baseline-title">Baseline Auto-Fill</h3>
            <div class="baseline-period-control">
                <label for="${periodSelectId}">Trailing average window</label>
                <select id="${periodSelectId}" class="production-baseline-period" ${allowEditing ? '' : 'disabled'}>${periodOptions}</select>
            </div>
        </div>
    `;

    if (mode === 'banking') {
        html += `
        <div class="baseline-columns">
            <div class="baseline-column-labels">
                <span class="baseline-column-label baseline-column-label--avg">
                    <span class="baseline-avg-label">AVG</span>
                    <span class="baseline-avg-value">${period} mo</span>
                </span>
                <span class="baseline-column-label baseline-column-label--baseline">Baseline</span>
            </div>
            <div class="baseline-grid">
                <div class="baseline-row--spacer baseline-spacer--banking-top"></div>
                ${ADDITIONAL_PRODUCTS.map(product => {
                    const slug = slugifyValue(product);
                    return `
                    <div class="baseline-row--metric" data-baseline-metric="productivity" data-baseline-product="${slug}">
                        <div class="baseline-cell--avg">${toNumber(averages.productivity?.[product], 0).toFixed(2)}</div>
                        <div class="baseline-cell--input">
                            <input type="number" step="0.01" class="baseline-input" data-baseline-metric="productivity" data-baseline-product="${product}" value="${toNumber(baselineState.productivity?.[product], 0).toFixed(2)}" ${allowEditing ? '' : 'disabled'}>
                        </div>
                    </div>`;
                }).join('')}
                <div class="baseline-row--spacer baseline-spacer--banking-accounts"></div>
                ${ADDITIONAL_PRODUCTS.map(product => {
                    const slug = slugifyValue(product);
                    const avgValue = formatThousands(toNumber(averages.abpa?.[product], 0), 0);
                    const baselineValue = Math.round(toNumber(baselineState.abpa?.[product], 0) / 1000);
                    return `
                    <div class="baseline-row--metric" data-baseline-metric="abpa" data-baseline-product="${slug}">
                        <div class="baseline-cell--avg">${avgValue}K</div>
                        <div class="baseline-cell--input">
                            <input type="number" step="1" min="0" class="baseline-input" data-baseline-metric="abpa" data-baseline-product="${product}" value="${baselineValue}" ${allowEditing ? '' : 'disabled'}>
                            <span class="baseline-suffix">K</span>
                        </div>
                    </div>`;
                }).join('')}
                <div class="baseline-row--spacer baseline-spacer--banking-balances"></div>
                <div class="baseline-row--spacer baseline-spacer--tail"></div>
            </div>
        </div>
        `;
    } else {
        html += `
        <div class="baseline-columns">
            <div class="baseline-column-labels">
                <span class="baseline-column-label baseline-column-label--avg">
                    <span class="baseline-avg-label">AVG</span>
                    <span class="baseline-avg-value">${period} mo</span>
                </span>
                <span class="baseline-column-label baseline-column-label--baseline">Baseline</span>
            </div>
            <div class="baseline-grid">
                
                <div class="baseline-row--metric" data-baseline-metric="productivity">
                    <div class="baseline-cell--avg">${toNumber(averages.productivity, 0).toFixed(2)}</div>
                    <div class="baseline-cell--input">
                        <input type="number" step="0.01" class="baseline-input" data-baseline-metric="productivity" value="${(baselineState.productivity ?? 0).toFixed(2)}" ${allowEditing ? '' : 'disabled'}>
                    </div>
                </div>
                <div class="baseline-row--spacer baseline-spacer--totals"></div>
                <div class="baseline-row--spacer baseline-spacer--balances"></div>
                <div class="baseline-row--divider baseline-divider--mix"></div>
                <div class="baseline-column-labels baseline-column-labels--section">
                    <span class="baseline-column-label baseline-column-label--avg baseline-section-avg-label">AVG ${period} MO</span>
                    <span class="baseline-column-label baseline-column-label--baseline">Baseline</span>
                </div>
                ${PRODUCTS.map(product => {
                    const slug = slugifyValue(product);
                    const avgPercent = (toNumber(averages.mix[product], 0) * 100).toFixed(1);
                    const baselinePercent = (toNumber(baselineState.mix[product], 0) * 100).toFixed(1);
                    return `
                    <div class="baseline-row--metric" data-baseline-metric="mix" data-baseline-product="${slug}">
                        <div class="baseline-cell--avg">${avgPercent}%</div>
                        <div class="baseline-cell--input">
                            <input type="number" step="0.1" min="0" max="100" class="baseline-input" data-baseline-metric="mix" data-baseline-product="${product}" value="${baselinePercent}" ${allowEditing ? '' : 'disabled'}>
                            <span class="baseline-suffix">%</span>
                        </div>
                    </div>`;
                }).join('')}
                <div class="baseline-row--divider baseline-divider--abpa"></div>
                <div class="baseline-column-labels baseline-column-labels--section">
                    <span class="baseline-column-label baseline-column-label--avg baseline-section-avg-label">AVG ${period} MO</span>
                    <span class="baseline-column-label baseline-column-label--baseline">Baseline</span>
                </div>
                ${PRODUCTS.map(product => {
                    const slug = slugifyValue(product);
                    const avgValue = formatThousands(toNumber(averages.abpa[product], 0), 0);
                    const baselineValue = Math.round(toNumber(baselineState.abpa[product], 0) / 1000);
                    return `
                    <div class="baseline-row--metric" data-baseline-metric="abpa" data-baseline-product="${slug}">
                        <div class="baseline-cell--avg">${avgValue}K</div>
                        <div class="baseline-cell--input">
                            <input type="number" step="1" min="0" class="baseline-input" data-baseline-metric="abpa" data-baseline-product="${product}" value="${baselineValue}" ${allowEditing ? '' : 'disabled'}>
                            <span class="baseline-suffix">K</span>
                        </div>
                    </div>`;
                }).join('')}
                <div class="baseline-row--divider baseline-divider--deepening"></div>
                <div class="baseline-row--spacer baseline-spacer--product-balances"></div>
                <div class="baseline-column-labels baseline-column-labels--section">
                    <span class="baseline-column-label baseline-column-label--avg baseline-section-avg-label">AVG ${period} MO</span>
                    <span class="baseline-column-label baseline-column-label--baseline">Baseline</span>
                </div>
                <div class="baseline-row--metric" data-baseline-metric="deepening-percent">
                    <div class="baseline-cell--avg">${(toNumber(averages.deepeningPercent, 0) * 100).toFixed(1)}%</div>
                    <div class="baseline-cell--input">
                        <input type="number" step="0.1" min="0" max="100" class="baseline-input" data-baseline-metric="deepening-percent" value="${((baselineState.deepeningPercent ?? 0) * 100).toFixed(1)}" ${allowEditing ? '' : 'disabled'}>
                        <span class="baseline-suffix">%</span>
                    </div>
                </div>
                <div class="baseline-row--spacer baseline-spacer--tail"></div>
                
            </div>
        </div>
        `;
    }

    html += '</div>';
    return html;
}

function renderProductionTab(data, opts = {}) {
    const container = document.getElementById(opts.containerId || 'production-tab');
    const mode = opts.mode || 'all'; // 'investments' | 'banking' | 'all'
    const months = generateMonthList();
    const slugifyProductName = (value) => (typeof slugify === 'function' ? slugify(value) : String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const totalDashCells = QUARTERS.length + YEARS.length;
    const isCurrentForecastVersion = canEditSelectedForecast();
    if (!data.deepening) {
        data.deepening = { amount: {}, percent: {} };
    } else {
        data.deepening.amount = data.deepening.amount || {};
        data.deepening.percent = data.deepening.percent || {};
    }

    let layoutClass = 'production-layout';

    let baselineColumn = '';
    if ((mode === 'investments' || mode === 'banking') && !AppState.isGroupView) {
        baselineColumn = renderProductionBaselineColumn(data, months, mode);
        if (!baselineColumn) {
            layoutClass += ' production-layout--single-column';
        }
    } else {
        layoutClass += ' production-layout--single-column';
    }

    let html = `<div class="${layoutClass}">`;

    if (baselineColumn) {
        html += baselineColumn;
    }

    if (typeof updateProductionToolbarCaption === 'function') {
        updateProductionToolbarCaption(mode);
    }

    html += '<div class="production-table-container"><div class="data-table-wrapper"><table class="data-table production-table">';

    html += '<thead><tr><th rowspan="2">Metric</th>';
    months.forEach((month, idx) => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${businessDays}</th>`;
    });
    QUARTERS.forEach(quarter => { html += `<th class="quarter-col">Total</th>`; });
    YEARS.forEach(year => { html += `<th class="year-total-col">FY${year.slice(-2)}</th>`; });
    html += '</tr><tr>';
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${month}</th>`;
    });
    QUARTERS.forEach(quarter => { html += `<th class="quarter-col">${quarter}</th>`; });
    YEARS.forEach(() => { html += '<th class="year-total-col">Total</th>'; });
    html += '</tr></thead><tbody>';

    html += '<tr class="subtotal-row" data-baseline-anchor="headcount"><td>Total Productive HC</td>';
    months.forEach(month => {
        const total = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}" id="prod-total-${month}">${total}</td>`;
    });
    
    // Quarter averages for headcount
    QUARTERS.forEach(quarter => {
        const avg = calculateQuarterAverage(
            months.reduce((acc, month) => {
                acc[month] = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
                return acc;
            }, {}),
            quarter
        );
        html += `<td class="quarter-col">${avg}</td>`;
    });
    
    // Year averages for headcount - using YEARS array
    YEARS.forEach(year => {
        const avg = calculateYearAverage(
            months.reduce((acc, month) => {
                acc[month] = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
                return acc;
            }, {}),
            months, year
        );
        html += `<td class="year-total-col">${avg}</td>`;
    });
    html += '</tr>';
    
    // Productivity - investments only
    if (mode === 'investments' || mode === 'all') {
    html += '<tr data-baseline-anchor="productivity"><td>Productivity</td>';
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        // Ensure value always has 2 decimals
        const value = parseFloat(data.productivity[month]).toFixed(2);
        const isCurrentForecast = canEditSelectedForecast();
        
        if (isForecast && !AppState.isGroupView && isCurrentForecast) {
            html += `<td class="forecast-col">
                <input type="number" 
                       value="${value}" 
                       step="0.01"
                       data-month="${month}" 
                       data-metric="productivity"
                       data-team="${AppState.currentTeam}"
                       class="selectable-input"
                       title="Weekly productivity: accounts per headcount per 5-day work week"
                       onchange="handleProductionChange(this)">
            </td>`;
        } else {
            html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}</td>`;
        }
    });
    
    // Quarter and year cells for productivity (show dash)
    const totalDashCells = QUARTERS.length + YEARS.length;
    for (let i = 0; i < totalDashCells; i++) {
        const isYearCol = i >= QUARTERS.length;
        html += `<td class="${isYearCol ? 'year-total-col' : 'quarter-col'}">-</td>`;
    }
    html += '</tr>';
    }
    
    // Total Accounts Sold - investments only
    let accountsData = {};
    if (mode === 'investments' || mode === 'all') {
    html += '<tr class="subtotal-row" data-baseline-anchor="total-accounts"><td>Total Accounts</td>';
    accountsData = {};
    months.forEach((month, idx) => {
        const headcount = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
        const weeklyProductivity = parseFloat(data.productivity[month]);
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        const totalAccounts = Math.round((headcount * weeklyProductivity * businessDays) / 5);
        accountsData[month] = totalAccounts;
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" id="total-accounts-${month}">${formatNumber(totalAccounts)}</td>`;
    });
    
    // Quarter totals for accounts
    QUARTERS.forEach(quarter => {
        const sum = calculateQuarterSum(accountsData, quarter);
        html += `<td class="quarter-col">${formatNumber(sum)}</td>`;
    });
    
    // Year totals for accounts - using YEARS array
    YEARS.forEach(year => {
        const sum = calculateYearSum(accountsData, months, year);
        html += `<td class="year-total-col">${formatNumber(sum)}</td>`;
    });
    html += '</tr>';
    }

    // Total Accounts Sold - banking only
    if (mode === 'banking' || mode === 'all') {
    html += '<tr class="subtotal-row" data-baseline-anchor="banking-total-accounts"><td>Total Accounts</td>';
    const bankingAccountsData = {};
    months.forEach((month, idx) => {
        const headcount = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        let monthTotal = 0;
        ADDITIONAL_PRODUCTS.forEach(product => {
            const weeklyProductivity = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
            const productAccounts = Math.round((headcount * weeklyProductivity * businessDays) / 5);
            monthTotal += productAccounts;
        });
        bankingAccountsData[month] = monthTotal;
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" id="banking-total-accounts-${month}">${formatNumber(monthTotal)}</td>`;
    });

    QUARTERS.forEach(quarter => {
        const sum = calculateQuarterSum(bankingAccountsData, quarter);
        const quarterSlug = slugifyProductName(quarter);
        html += `<td class="quarter-col" id="banking-total-accounts-quarter-${quarterSlug}">${formatNumber(sum)}</td>`;
    });
    
    YEARS.forEach(year => {
        const sum = calculateYearSum(bankingAccountsData, months, year);
        html += `<td class="year-total-col" id="banking-total-accounts-year-${year}">${formatNumber(sum)}</td>`;
    });
    html += '</tr>';
    }
    
    // Total Balances in millions
    html += '<tr class="total-row" data-baseline-anchor="total-balances"><td>Total Balances ($M)</td>';
    const includeInvestments = mode === 'investments' || mode === 'all';
    const includeBanking = mode === 'banking' || mode === 'all';
    const grandTotalData = {};
    months.forEach((month, idx) => {
        let grandTotal = 0;
        const headcount = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;

        if (includeInvestments) {
            const weeklyProductivity = parseFloat(data.productivity[month]) || 0;
            const totalAccounts = (headcount * weeklyProductivity * businessDays) / 5;
            PRODUCTS.forEach(product => {
                const productMix = data.productMix[product][month] || 0;
                const productAccounts = Math.round(totalAccounts * productMix);
                const abpa = data.abpa[product][month] || 0;
                grandTotal += productAccounts * abpa;
            });
        }

        if (includeBanking) {
            ADDITIONAL_PRODUCTS.forEach(product => {
                const weeklyProductivity = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
                const abpa = parseFloat(data.additionalProducts?.[product]?.abpa?.[month] || 0);
                const accounts = Math.round((headcount * weeklyProductivity * businessDays) / 5);
                grandTotal += accounts * abpa;
            });
        }

        grandTotalData[month] = grandTotal;
        const grandTotalInMillions = (grandTotal / 1000000).toFixed(1);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" id="grand-total-${month}">$${grandTotalInMillions}M</td>`;
    });
    
    // Quarter totals for balances
    QUARTERS.forEach(quarter => {
        const sum = calculateQuarterSum(grandTotalData, quarter);
        const sumInMillions = (sum / 1000000).toFixed(1);
        const quarterSlug = slugifyProductName(quarter);
        html += `<td class="quarter-col" id="grand-total-quarter-${quarterSlug}">$${sumInMillions}M</td>`;
    });
    
    // Year totals for balances - using YEARS array
    YEARS.forEach(year => {
        const sum = calculateYearSum(grandTotalData, months, year);
        const sumInMillions = (sum / 1000000).toFixed(1);
        html += `<td class="year-total-col" id="grand-total-year-${year}">$${sumInMillions}M</td>`;
    });
    html += '</tr>';
    
    // Product Mix Section - investments only
    if (mode === 'investments' || mode === 'all') {
    html += '<tr data-baseline-anchor="mix-header"><td colspan="52" class="section-header">Product Mix (%)</td></tr>';

    PRODUCTS.forEach((product, productIndex) => {
        const productSlug = slugifyProductName(product);
        const isLastProduct = productIndex === PRODUCTS.length - 1;
        html += `<tr data-baseline-anchor="mix" data-product="${productSlug}"><td>${product} Mix (%)</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = Math.round(data.productMix[product][month] * 100);
            const isCurrentForecast = canEditSelectedForecast();
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td class="forecast-col">
                    <div class="table-input-with-suffix">
                        <input type="number" 
                               value="${value}" 
                               data-month="${month}" 
                               data-product="${product}"
                               data-metric="mix"
                               data-team="${AppState.currentTeam}"
                               class="selectable-input"
                               onchange="handleProductionChange(this)"
                               onblur="validateProductMix('${month}')">
                        <span class="table-input-suffix">%</span>
                    </div>
                    ${isLastProduct ? `<span id="mix-error-${month}" style="display: none;"></span>` : ''}
                </td>`;
            } else {
                html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}%</td>`;
            }
        });
        
        // Quarter mix calculation
        QUARTERS.forEach(quarter => {
            const quarterMonths = getMonthsInQuarter(quarter);
            let quarterProductAccounts = 0;
            let quarterTotalAccounts = 0;
            
            quarterMonths.forEach(month => {
                if (accountsData[month]) {
                    const accounts = accountsData[month];
                    const mix = data.productMix[product][month];
                    quarterProductAccounts += accounts * mix;
                    quarterTotalAccounts += accounts;
                }
            });
            
            const quarterMix = quarterTotalAccounts > 0 ? 
                Math.round((quarterProductAccounts / quarterTotalAccounts) * 100) : 0;
            html += `<td class="quarter-col">${quarterMix}%</td>`;
        });
        
        // Year mix calculation - using YEARS array
        YEARS.forEach(year => {
            const yearMonths = months.filter(m => getYearFromMonth(m) === year);
            let yearProductAccounts = 0;
            let yearTotalAccounts = 0;
            
            yearMonths.forEach(month => {
                const accounts = accountsData[month];
                const mix = data.productMix[product][month];
                yearProductAccounts += accounts * mix;
                yearTotalAccounts += accounts;
            });
            
            const yearMix = yearTotalAccounts > 0 ? 
                Math.round((yearProductAccounts / yearTotalAccounts) * 100) : 0;
            html += `<td class="year-total-col">${yearMix}%</td>`;
        });
        
        html += '</tr>';
    });
    
    
// Accounts by Product Section - investments only
    html += '<tr><td colspan="52" class="section-header">Accounts by Product</td></tr>';
    
    const productAccountsData = {};
    PRODUCTS.forEach(product => {
        productAccountsData[product] = {};
        html += `<tr><td>${product} Accounts</td>`;
        months.forEach((month, idx) => {
            const totalAccounts = accountsData[month];
            const productMix = data.productMix[product][month];
            const productAccounts = Math.round(totalAccounts * productMix);
            productAccountsData[product][month] = productAccounts;
            html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" id="accounts-${product}-${month}">${formatNumber(productAccounts)}</td>`;
        });
        
        // Quarter totals
        QUARTERS.forEach(quarter => {
            const sum = calculateQuarterSum(productAccountsData[product], quarter);
            html += `<td class="quarter-col">${formatNumber(sum)}</td>`;
        });
        
        // Year totals - using YEARS array
        YEARS.forEach(year => {
            const sum = calculateYearSum(productAccountsData[product], months, year);
            html += `<td class="year-total-col">${formatNumber(sum)}</td>`;
        });
        
        html += '</tr>';
    });
    
    // Average Balance per Account Section - investments only
    html += '<tr data-baseline-anchor="abpa-header"><td colspan="52" class="section-header">Average Balance per Account ($K)</td></tr>';

    PRODUCTS.forEach(product => {
        const productSlug = slugifyProductName(product);
        html += `<tr data-baseline-anchor="abpa" data-product="${productSlug}"><td>ABPA ${product} ($K)</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = data.abpa[product][month] || 0;
            const displayValue = formatThousands(value, 0);
            const editableValue = Math.round(value / 1000);
            const isCurrentForecast = canEditSelectedForecast();
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td id="abpa-${productSlug}-${month}" class="forecast-col">
                    <div class="table-input-with-suffix">
                        <input type="number"
                               step="1"
                               min="0"
                               value="${editableValue}"
                               data-month="${month}"
                               data-product="${product}"
                               data-metric="abpa"
                               data-team="${AppState.currentTeam}"
                               class="selectable-input"
                               onchange="handleProductionChange(this)">
                        <span class="table-input-suffix">K</span>
                    </div>
                </td>`;
            } else {
                html += `<td id="abpa-${productSlug}-${month}" class="${isForecast ? 'forecast-col' : 'actual-col'}">${displayValue}<span class="table-value-suffix">K</span></td>`;
            }
        });
        
        // Quarter average ABPA
        QUARTERS.forEach(quarter => {
            const quarterMonths = getMonthsInQuarter(quarter);
            let totalBalance = 0;
            let totalAccounts = 0;
            
            quarterMonths.forEach(month => {
                if (productAccountsData[product] && productAccountsData[product][month]) {
                    const accounts = productAccountsData[product][month];
                    const abpa = data.abpa[product][month] || 0;
                    totalBalance += accounts * abpa;
                    totalAccounts += accounts;
                }
            });
            
            const avgABPA = totalAccounts > 0 ? Math.round(totalBalance / totalAccounts) : 0;
            html += `<td class="quarter-col">${formatThousands(avgABPA, 0)}K</td>`;
        });
        
        // Year average ABPA - using YEARS array
        YEARS.forEach(year => {
            const yearMonths = months.filter(m => getYearFromMonth(m) === year);
            let totalBalance = 0;
            let totalAccounts = 0;
            
            yearMonths.forEach(month => {
                if (productAccountsData[product] && productAccountsData[product][month]) {
                    const accounts = productAccountsData[product][month];
                    const abpa = data.abpa[product][month] || 0;
                    totalBalance += accounts * abpa;
                    totalAccounts += accounts;
                }
            });
            
            const avgABPA = totalAccounts > 0 ? Math.round(totalBalance / totalAccounts) : 0;
            html += `<td class="year-total-col">${formatThousands(avgABPA, 0)}K</td>`;
        });
        
        html += '</tr>';
    });
    
    // Total Balances by Product Section
    html += '<tr><td colspan="52" class="section-header">Total Balances by Product ($M)</td></tr>';

    PRODUCTS.forEach(product => {
        html += `<tr><td>${product} Balances</td>`;
        const productBalanceData = {};
        months.forEach(month => {
            const productAccounts = productAccountsData[product][month];
            const abpa = data.abpa[product][month] || 0;
            const totalBalance = productAccounts * abpa;
            productBalanceData[month] = totalBalance;
            // Format in millions like the total at the top
            const balanceInMillions = (totalBalance / 1000000).toFixed(1);
            html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" id="balance-${product}-${month}">$${balanceInMillions}M</td>`;
        });
        
        // Quarter totals
        QUARTERS.forEach(quarter => {
            const sum = calculateQuarterSum(productBalanceData, quarter);
            const sumInMillions = (sum / 1000000).toFixed(1);
            html += `<td class="quarter-col">$${sumInMillions}M</td>`;
        });
        
        // Year totals - using YEARS array
        YEARS.forEach(year => {
            const sum = calculateYearSum(productBalanceData, months, year);
            const sumInMillions = (sum / 1000000).toFixed(1);
            html += `<td class="year-total-col">$${sumInMillions}M</td>`;
        });
        
        html += '</tr>';
    });
    
    const deepeningAmountData = {};
    html += '<tr><td colspan="52" class="section-header">Deepening</td></tr>';
    html += '<tr class="total-row"><td>Deepening ($M)</td>';
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const amount = Number(data.deepening?.amount?.[month]) || 0;
        deepeningAmountData[month] = amount;
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'} calculated-value" id="deepening-amount-${month}">$${(amount / 1000000).toFixed(1)}M</td>`;
    });
    QUARTERS.forEach(quarter => {
        const sum = calculateQuarterSum(deepeningAmountData, quarter);
        const sumInMillions = (sum / 1000000).toFixed(1);
        const quarterSlug = slugifyProductName(quarter);
        html += `<td class="quarter-col" id="deepening-amount-quarter-${quarterSlug}">$${sumInMillions}M</td>`;
    });
    YEARS.forEach(year => {
        const sum = calculateYearSum(deepeningAmountData, months, year);
        const sumInMillions = (sum / 1000000).toFixed(1);
        html += `<td class="year-total-col" id="deepening-amount-year-${year}">$${sumInMillions}M</td>`;
    });
    html += '</tr>';

    const deepeningPercentData = {};
    html += '<tr><td>Deepening %</td>';
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const percent = Number(data.deepening?.percent?.[month]) || 0;
        deepeningPercentData[month] = percent;
        if (isForecast && !AppState.isGroupView && isCurrentForecastVersion) {
            html += `<td class="forecast-col" id="deepening-percent-${month}">
                <div class="table-input-with-suffix">
                    <input type="number"
                           step="0.1"
                           min="0"
                           max="100"
                           value="${(percent * 100).toFixed(1)}"
                           data-month="${month}"
                           data-metric="deepening-percent"
                           data-team="${AppState.currentTeam}"
                           class="selectable-input"
                           onchange="handleProductionChange(this)">
                    <span class="table-input-suffix">%</span>
                </div>
            </td>`;
        } else {
            html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}" id="deepening-percent-${month}">${(percent * 100).toFixed(1)}%</td>`;
        }
    });
    QUARTERS.forEach(quarter => {
        const deepSum = calculateQuarterSum(deepeningAmountData, quarter);
        const balanceSum = calculateQuarterSum(grandTotalData, quarter);
        const pct = balanceSum > 0 ? deepSum / balanceSum : 0;
        const quarterSlug = slugifyProductName(quarter);
        html += `<td class="quarter-col" id="deepening-percent-quarter-${quarterSlug}">${(pct * 100).toFixed(1)}%</td>`;
    });
    YEARS.forEach(year => {
        const deepSum = calculateYearSum(deepeningAmountData, months, year);
        const balanceSum = calculateYearSum(grandTotalData, months, year);
        const pct = balanceSum > 0 ? deepSum / balanceSum : 0;
        html += `<td class="year-total-col" id="deepening-percent-year-${year}">${(pct * 100).toFixed(1)}%</td>`;
    });
    html += '</tr>';
    
    }
    // ========== ADDITIONAL PRODUCTS SECTION (Banking) ==========
    if (mode === 'banking' || mode === 'all') {
    html += '<tr data-baseline-anchor="banking-productivity-header"><td colspan="52" class="section-header">Weekly Productivity</td></tr>';

    ADDITIONAL_PRODUCTS.forEach(product => {
        const productSlug = slugifyProductName(product);
        html += `<tr data-baseline-anchor="banking-productivity" data-product="${productSlug}"><td>${product} Productivity</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = data.additionalProducts?.[product]?.productivity?.[month] || '0.00';
            const isCurrentForecast = canEditSelectedForecast();
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td class="forecast-col">
                    <input type="number" 
                           value="${value}" 
                           step="0.01"
                           data-month="${month}" 
                           data-product="${product}"
                           data-metric="additional-productivity"
                           data-team="${AppState.currentTeam}"
                           class="selectable-input"
                           title="Weekly productivity: accounts per headcount per 5-day work week"
                           onchange="handleAdditionalProductChange(this)">
                </td>`;
            } else {
                html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}</td>`;
            }
        });
        
        // No quarters/years for productivity (show dash)
        for (let i = 0; i < totalDashCells; i++) {
            const isYearCol = i >= QUARTERS.length;
            html += `<td class="${isYearCol ? 'year-total-col' : 'quarter-col'}">-</td>`;
        }
        html += '</tr>';
    });

    html += '<tr data-baseline-anchor="banking-accounts-header"><td colspan="52" class="section-header">Accounts by Product</td></tr>';

    ADDITIONAL_PRODUCTS.forEach(product => {
        const productName = `Product ${product}`;
        const productSlug = slugifyProductName(product);
        html += `<tr data-baseline-anchor="banking-accounts" data-product="${productSlug}"><td>${productName} Accounts</td>`;
        const additionalProductAccountsData = {};
        months.forEach((month, idx) => {
            const headcount = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
            const weeklyProductivity = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
            const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
            const accounts = Math.round((headcount * weeklyProductivity * businessDays) / 5);
            additionalProductAccountsData[month] = accounts;
            
            html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" 
                         id="additional-accounts-${product}-${month}">${formatNumber(accounts)}</td>`;
        });
        
        QUARTERS.forEach(quarter => {
            const sum = calculateQuarterSum(additionalProductAccountsData, quarter);
            html += `<td class="quarter-col">${formatNumber(sum)}</td>`;
        });
        
        YEARS.forEach(year => {
            const sum = calculateYearSum(additionalProductAccountsData, months, year);
            html += `<td class="year-total-col">${formatNumber(sum)}</td>`;
        });
        html += '</tr>';
    });

    html += '<tr data-baseline-anchor="banking-abpa-header"><td colspan="52" class="section-header">Average Balance per Account ($K)</td></tr>';

    ADDITIONAL_PRODUCTS.forEach(product => {
        const productName = `Product ${product}`;
        const productSlug = slugifyProductName(product);
        html += `<tr data-baseline-anchor="banking-abpa" data-product="${productSlug}"><td>${productName} ABPA ($K)</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = data.additionalProducts?.[product]?.abpa?.[month] || 0;
            const displayValue = formatThousands(value, 0);
            const editableValue = Math.round(value / 1000);
            const isCurrentForecast = canEditSelectedForecast();
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td id="additional-abpa-${product}-${month}" class="forecast-col">
                    <div class="table-input-with-suffix">
                        <input type="number" 
                               step="1"
                               min="0"
                               value="${editableValue}" 
                               data-month="${month}" 
                               data-product="${product}"
                               data-metric="additional-abpa"
                               data-team="${AppState.currentTeam}"
                               class="selectable-input"
                               onchange="handleAdditionalProductChange(this)">
                        <span class="table-input-suffix">K</span>
                    </div>
                </td>`;
            } else {
                html += `<td id="additional-abpa-${product}-${month}" class="${isForecast ? 'forecast-col' : 'actual-col'}">${displayValue}<span class="table-value-suffix">K</span></td>`;
            }
        });
        
        // No quarters/years for ABPA (show dash)
        for (let i = 0; i < totalDashCells; i++) {
            const isYearCol = i >= QUARTERS.length;
            html += `<td class="${isYearCol ? 'year-total-col' : 'quarter-col'}">-</td>`;
        }
        html += '</tr>';
    });

    html += '<tr data-baseline-anchor="banking-balances-header"><td colspan="52" class="section-header">Total Balances by Product ($M)</td></tr>';

    ADDITIONAL_PRODUCTS.forEach(product => {
        const productName = `Product ${product}`;
        const productSlug = slugifyProductName(product);
        html += `<tr data-baseline-anchor="banking-balances" data-product="${productSlug}"><td>${productName} Balances</td>`;
        const additionalProductAccountsData = {};
        months.forEach((month, idx) => {
            const headcount = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
            const weeklyProductivity = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
            const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
            const accounts = Math.round((headcount * weeklyProductivity * businessDays) / 5);
            additionalProductAccountsData[month] = accounts;

            const accountsForMonth = additionalProductAccountsData[month] || 0;
            const abpa = data.additionalProducts?.[product]?.abpa?.[month] || 0;
            const balance = accountsForMonth * abpa;
            const balanceInMillions = (balance / 1000000).toFixed(1);
            
            html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" 
                         id="additional-balance-${product}-${month}">$${balanceInMillions}M</td>`;
        });
        
        QUARTERS.forEach(quarter => {
            const quarterMonths = getMonthsInQuarter(quarter);
            let quarterBalance = 0;
            quarterMonths.forEach(month => {
                const accounts = additionalProductAccountsData[month] || 0;
                const abpa = data.additionalProducts?.[product]?.abpa?.[month] || 0;
                quarterBalance += accounts * abpa;
            });
            const balanceInMillions = (quarterBalance / 1000000).toFixed(1);
            html += `<td class="quarter-col">$${balanceInMillions}M</td>`;
        });
        
        YEARS.forEach(year => {
            const yearMonths = months.filter(m => getYearFromMonth(m) === year);
            let yearBalance = 0;
            yearMonths.forEach(month => {
                const accounts = additionalProductAccountsData[month] || 0;
                const abpa = data.additionalProducts?.[product]?.abpa?.[month] || 0;
                yearBalance += accounts * abpa;
            });
            const balanceInMillions = (yearBalance / 1000000).toFixed(1);
            html += `<td class="year-total-col">$${balanceInMillions}M</td>`;
        });
        html += '</tr>';
    });
    }
    
    html += '</tbody></table></div></div>';

    if (mode === 'investments' && !AppState.isGroupView && baselineColumn) {
        html += '<div class="production-actions"></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    initializeTableScrollbars(container);
    initializeStickySectionDividers(container);

    if ((mode === 'banking' || mode === 'all') && typeof recalculateBankingTotals === 'function' && !AppState.isGroupView) {
        recalculateBankingTotals(AppState.currentTeam);
    }

    if (mode === 'investments' && !AppState.isGroupView) {
        const column = container.querySelector('.production-baseline-column');
        if (column) {
            bindProductionBaselineEvents(column);
        }
        const actionBtn = container.querySelector('.production-actions .production-admin-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                const versionId = AppState.currentVersion?.version_id;
                openProductionAdminModal(versionId);
            });
        }
    }

    applyProductionBaselines({ data, months, updateDom: mode === 'investments' || mode === 'banking', mode });
    if (!AppState.isGroupView && baselineColumn && typeof scheduleBaselineLayoutSync === 'function') {
        scheduleBaselineLayoutSync();
    }

    setupInputSelection();
}

// Setup input selection functionality for bulk operations
function initializeTableScrollbars(root) {
    const context = root instanceof HTMLElement ? root : document;
    const wrappers = context.querySelectorAll('.data-table-wrapper');

    wrappers.forEach(wrapper => {
        const isHeadcountWrapper = !!wrapper.closest('#headcount-tab');
        if (isHeadcountWrapper) {
            if (wrapper.previousElementSibling && wrapper.previousElementSibling.classList.contains('data-table-top-scroll')) {
                wrapper.previousElementSibling.remove();
            }
            wrapper.dataset.topScrollInitialized = 'skipped';
            return;
        }

        if (wrapper.dataset.topScrollInitialized === 'true') {
            const refresh = wrapper.__topScrollRefresh;
            if (typeof refresh === 'function') {
                refresh();
            }
            return;
        }

        const parent = wrapper.parentElement;
        if (!parent) {
            return;
        }

        if (wrapper.previousElementSibling && wrapper.previousElementSibling.classList.contains('data-table-top-scroll')) {
            wrapper.previousElementSibling.remove();
        }

        const topScroll = document.createElement('div');
        topScroll.className = 'data-table-top-scroll';

        const inner = document.createElement('div');
        inner.className = 'data-table-top-scroll-inner';
        topScroll.appendChild(inner);

        parent.insertBefore(topScroll, wrapper);

        let isSyncingTop = false;
        let isSyncingWrapper = false;

        const syncWidths = () => {
            inner.style.width = `${wrapper.scrollWidth}px`;
        };

        const handleWrapperScroll = () => {
            if (isSyncingWrapper) {
                return;
            }
            isSyncingTop = true;
            topScroll.scrollLeft = wrapper.scrollLeft;
            isSyncingTop = false;
        };

        const handleTopScroll = () => {
            if (isSyncingTop) {
                return;
            }
            isSyncingWrapper = true;
            wrapper.scrollLeft = topScroll.scrollLeft;
            isSyncingWrapper = false;
        };

        wrapper.addEventListener('scroll', handleWrapperScroll);
        topScroll.addEventListener('scroll', handleTopScroll);

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(syncWidths);
            observer.observe(wrapper);
            const table = wrapper.querySelector('table');
            if (table) {
                observer.observe(table);
            }
            wrapper.__topScrollObserver = observer;
        } else {
            window.addEventListener('resize', syncWidths);
        }

        syncWidths();

        wrapper.dataset.topScrollInitialized = 'true';
        wrapper.__topScrollElement = topScroll;
        wrapper.__topScrollRefresh = syncWidths;
    });
}

function setupInputSelection() {
    // Initialize selection state for this table
    window.currentSelection = {
        isSelecting: false,
        isDragging: false,
        startCell: null,
        selectionType: null,
        lastEnteredCell: null // Track last entered cell for deselection
    };
    
    // Get all cells - but we need to handle them differently
    const allCells = document.querySelectorAll('td.actual-col, td.forecast-col');
    const inputElements = document.querySelectorAll('.selectable-input, input[type="number"]'); // Include headcount inputs
    
    // Create arrays to avoid using :has() which may not be supported
    const staticCells = [];
    const inputContainerCells = [];
    
    // Separate static cells from cells containing inputs
    allCells.forEach(cell => {
        if (cell.querySelector('input')) {
            inputContainerCells.push(cell);
        } else {
            staticCells.push(cell);
        }
    });
    
    // Handle static cells
    staticCells.forEach(cell => {
        cell.addEventListener('mousedown', (e) => {
            e.preventDefault();
            
            // Clear previous selection if not shift or ctrl key
            if (!e.shiftKey && !e.ctrlKey) {
                AppState.selectedInputs.forEach(c => c.classList.remove('selected'));
                AppState.selectedInputs = [];
            }
            
            window.currentSelection.isDragging = true;
            window.currentSelection.selectionType = 'static';
            window.currentSelection.startCell = cell; // Store the actual cell element
            AppState.selectedInputs = [cell];
            cell.classList.add('selected');
            updateSelectionStats();
        });
        
        cell.addEventListener('mouseenter', (e) => {
            if (window.currentSelection.isDragging && window.currentSelection.selectionType === 'static') {
                const wrapper = cell.closest('.data-table-wrapper') || document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
                const startEl = window.currentSelection.startCell;
                const endEl = cell;
                if (wrapper && startEl && endEl) {
                    const r1 = startEl.getBoundingClientRect();
                    const r2 = endEl.getBoundingClientRect();
                    const minX = Math.min(r1.left, r2.left);
                    const maxX = Math.max(r1.right, r2.right);
                    const minY = Math.min(r1.top, r2.top);
                    const maxY = Math.max(r1.bottom, r2.bottom);

                    const tds = wrapper.querySelectorAll('td.actual-col, td.forecast-col, td.quarter-col, td.year-total-col');
                    AppState.selectedInputs = [];
                    tds.forEach(td => {
                        const rect = td.getBoundingClientRect();
                        const cx = rect.left + rect.width/2;
                        const cy = rect.top + rect.height/2;
                        const inside = cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
                        if (inside) {
                            td.classList.add('selected');
                            AppState.selectedInputs.push(td);
                        } else {
                            td.classList.remove('selected');
                        }
                    });
                    window.currentSelection.lastEnteredCell = cell;
                    updateSelectionStats();
                }
            }
        });
    });
    
    // Handle input elements directly (not their container cells)
    inputElements.forEach(input => {
        // Allow normal click to focus and edit
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // If not holding shift or ctrl, allow normal editing
            if (!e.shiftKey && !e.ctrlKey) {
                // Clear any existing selection
                AppState.selectedInputs.forEach(c => c.classList.remove('selected'));
                AppState.selectedInputs = [];
                updateSelectionStats();
                // Let the input focus naturally
                return;
            }
        });
        
        input.addEventListener('mousedown', (e) => {
            // Only prevent default if shift or ctrl is held
            if (e.shiftKey || e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                
                // Clear previous selection if not shift or ctrl key
                if (!e.shiftKey && !e.ctrlKey) {
                    AppState.selectedInputs.forEach(c => c.classList.remove('selected'));
                    AppState.selectedInputs = [];
                }
                
                if (e.shiftKey) {
                    // Shift for bulk update (inputs only)
                    window.currentSelection.isSelecting = true;
                    window.currentSelection.selectionType = 'input';
                    window.currentSelection.startCell = input.closest('tr'); // Store the row for shift selection
                    if (!AppState.selectedInputs.includes(input)) {
                        AppState.selectedInputs.push(input);
                        input.classList.add('selected');
                    }
                } else if (e.ctrlKey) {
                    // Ctrl for adding to selection
                    window.currentSelection.isDragging = true;
                    window.currentSelection.selectionType = 'input';
                    window.currentSelection.startCell = input; // Store the actual input element
                    if (!AppState.selectedInputs.includes(input)) {
                        AppState.selectedInputs.push(input);
                        input.classList.add('selected');
                    } else {
                        // Remove if already selected
                        AppState.selectedInputs = AppState.selectedInputs.filter(i => i !== input);
                        input.classList.remove('selected');
                    }
                }
                updateSelectionStats();
            }
        });
        
        input.addEventListener('mouseenter', (e) => {
            if (window.currentSelection.isSelecting && window.currentSelection.selectionType === 'input' && input.closest('tr') === window.currentSelection.startCell) {
                // Shift selection within same row for bulk update
                if (!AppState.selectedInputs.includes(input)) {
                    AppState.selectedInputs.push(input);
                    input.classList.add('selected');
                    updateSelectionStats();
                }
            } else if (window.currentSelection.isDragging && window.currentSelection.selectionType === 'input' && (e.buttons === 1)) {
                // In production tab, only allow selection within same row
                if (AppState.currentTab === 'production' && window.currentSelection.startCell) {
                    const startInput = window.currentSelection.startCell;
                    const startRow = (startInput.tagName === 'INPUT') ? startInput.closest('tr') : startInput;
                    const currentRow = input.closest('tr');
                    if (startRow !== currentRow) return;
                }
                
                // Handle deselection when moving backwards
                if (window.currentSelection.lastEnteredCell && window.currentSelection.lastEnteredCell !== input) {
                    const inputArray = Array.from(inputElements);
                    const cellIndex = inputArray.indexOf(input);
                    const lastIndex = inputArray.indexOf(window.currentSelection.lastEnteredCell);
                    const startIndex = inputArray.indexOf(window.currentSelection.startCell);
                    
                    if ((startIndex < lastIndex && cellIndex < lastIndex && cellIndex >= startIndex) ||
                        (startIndex > lastIndex && cellIndex > lastIndex && cellIndex <= startIndex)) {
                        AppState.selectedInputs = AppState.selectedInputs.filter(c => {
                            const cIndex = inputArray.indexOf(c);
                            if (startIndex < lastIndex) {
                                return cIndex < cellIndex || cIndex > lastIndex;
                            } else {
                                return cIndex > cellIndex || cIndex < lastIndex;
                            }
                        });
                        
                        inputElements.forEach(c => {
                            if (!AppState.selectedInputs.includes(c)) {
                                c.classList.remove('selected');
                            }
                        });
                    }
                }
                
                if (!AppState.selectedInputs.includes(input)) {
                    AppState.selectedInputs.push(input);
                    input.classList.add('selected');
                }
                
                window.currentSelection.lastEnteredCell = input;
                updateSelectionStats();
            }
        });
    });
    
    // Handle cells that contain inputs - make them selectable too
    inputContainerCells.forEach(cell => {
        cell.addEventListener('mousedown', (e) => {
            // Only handle if clicked on the cell, not the input
            if (e.target === cell) {
                e.preventDefault();
                
                // Clear previous selection if not shift or ctrl key
                if (!e.shiftKey && !e.ctrlKey) {
                    AppState.selectedInputs.forEach(c => c.classList.remove('selected'));
                    AppState.selectedInputs = [];
                }
                
                window.currentSelection.isDragging = true;
                window.currentSelection.selectionType = 'mixed';
                window.currentSelection.startCell = cell; // Store the actual cell element
                AppState.selectedInputs = [cell];
                cell.classList.add('selected');
                updateSelectionStats();
            }
        });
        
        cell.addEventListener('mouseenter', (e) => {
            if (window.currentSelection.isDragging && (window.currentSelection.selectionType === 'mixed' || window.currentSelection.selectionType === 'static')) {
                const wrapper = cell.closest('.data-table-wrapper') || document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
                const startEl = window.currentSelection.startCell;
                const endEl = cell;
                if (wrapper && startEl && endEl) {
                    const r1 = startEl.getBoundingClientRect();
                    const r2 = endEl.getBoundingClientRect();
                    const minX = Math.min(r1.left, r2.left);
                    const maxX = Math.max(r1.right, r2.right);
                    const minY = Math.min(r1.top, r2.top);
                    const maxY = Math.max(r1.bottom, r2.bottom);

                    // All potential cells in wrapper
                    const tds = wrapper.querySelectorAll('td.actual-col, td.forecast-col, td.quarter-col, td.year-total-col');
                    AppState.selectedInputs = [];
                    tds.forEach(td => {
                        const rect = td.getBoundingClientRect();
                        const cx = rect.left + rect.width/2;
                        const cy = rect.top + rect.height/2;
                        const inside = cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
                        if (inside) {
                            td.classList.add('selected');
                            AppState.selectedInputs.push(td);
                        } else {
                            td.classList.remove('selected');
                        }
                    });
                    window.currentSelection.lastEnteredCell = cell;
                    updateSelectionStats();
                }
            }
        });
    });
}

// Validate product mix totals to 100%
function validateProductMix(month) {
    if (AppState.isGroupView) return;
    
    const teamKey = `Team ${AppState.currentTeam}`;
    const data = AppState.teamData[AppState.currentForecast][teamKey];
    let total = 0;
    
    PRODUCTS.forEach(product => {
        total += data.productMix[product][month] * 100;
    });
    
    const errorSpan = document.getElementById(`mix-error-${month}`);
    if (errorSpan) {
        if (Math.abs(total - 100) > 0.1) {
            errorSpan.innerHTML = `<span class="mix-validation-indicator">Sum: ${Math.round(total)}%</span>`;
            errorSpan.style.display = 'inline';
        } else {
            errorSpan.style.display = 'none';
        }
    }
}

// Helper function to get year range (for other files if needed)
function getYearRange() {
    return YEARS;
}

// Helper function to get quarter range (for other files if needed)
function getQuarterRange() {
    return QUARTERS;
}

// Export configuration for use in other files if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TABLE_CONFIG, YEARS, QUARTERS, getYearRange, getQuarterRange };
}
