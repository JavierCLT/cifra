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

// Remove formatting for editing
function removeFormatting(input) {
    input.value = input.value.replace(/,/g, '');
}

// Add formatting after editing
function addFormatting(input) {
    const value = parseFloat(input.value.replace(/,/g, '')) || 0;
    input.value = value.toLocaleString();
}

// Render headcount tab (supports Sales and Non-Sales modes)
function renderHeadcountTab(data, opts = {}) {
    const containerId = opts.containerId || 'headcount-tab';
    const mode = opts.mode || 'sales'; // 'sales' | 'non-sales'
    const container = document.getElementById(containerId);
    const changeHandler = mode === 'non-sales' ? 'handleNonSalesHeadcountChange' : 'handleHeadcountChange';
    const months = generateMonthList();
    
    let html = '<div class="data-table-wrapper"><table class="data-table">';
    
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
            const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
            
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
    const totalLabel = mode === 'non-sales' ? 'Total Non-Sales Headcount' : 'Total Productive Headcount';
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

    // Setup input selection for bulk operations
    setupInputSelection();
}

// Render production tab
function renderProductionTab(data, opts = {}) {
    const container = document.getElementById(opts.containerId || 'production-tab');
    const mode = opts.mode || 'all'; // 'investments' | 'banking' | 'all'
    const months = generateMonthList();
    // Used by several sections (both investments and banking)
    const totalDashCells = QUARTERS.length + YEARS.length;
    
    let html = '<div class="data-table-wrapper"><table class="data-table">';
    
    // Header rows
    html += '<thead><tr><th rowspan="2">Metric</th>';
    
    // Business days in header
    months.forEach((month, idx) => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${businessDays}</th>`;
    });
    
    // Quarter columns
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">Total</th>`;
    });
    
    // Year columns - using YEARS array
    YEARS.forEach(year => {
        html += `<th class="year-total-col">FY${year.slice(-2)}</th>`;
    });
    html += '</tr><tr>';
    
    // Month names
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${month}</th>`;
    });
    
    // Quarter labels
    QUARTERS.forEach(quarter => {
        html += `<th class="quarter-col">${quarter}</th>`;
    });
    
    // Year labels
    YEARS.forEach(() => {
        html += '<th class="year-total-col">Total</th>';
    });
    html += '</tr></thead><tbody>';
    
    // Total Productive Headcount
    html += '<tr class="subtotal-row"><td>Total Productive Headcount</td>';
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
    html += '<tr><td>Productivity (accounts/headcount/week)</td>';
    months.forEach(month => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        // Ensure value always has 2 decimals
        const value = parseFloat(data.productivity[month]).toFixed(2);
        const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
        
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
    html += '<tr class="subtotal-row"><td>Total Accounts Sold</td>';
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
    
    // Total Balances in millions
    html += '<tr class="total-row"><td>Total Balances ($M)</td>';
    const grandTotalData = {};
    months.forEach((month, idx) => {
        let grandTotal = 0;
        PRODUCTS.forEach(product => {
            const headcount = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
            const weeklyProductivity = parseFloat(data.productivity[month]);
            const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
            // Updated formula with weekly productivity
            const totalAccounts = (headcount * weeklyProductivity * businessDays) / 5;
            const productMix = data.productMix[product][month];
            const productAccounts = Math.round(totalAccounts * productMix);
            const abpa = data.abpa[product][month];
            grandTotal += productAccounts * abpa;
        });
        grandTotalData[month] = grandTotal;
        const grandTotalInMillions = (grandTotal / 1000000).toFixed(1);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" id="grand-total-${month}">$${grandTotalInMillions}M</td>`;
    });
    
    // Quarter totals for balances
    QUARTERS.forEach(quarter => {
        const sum = calculateQuarterSum(grandTotalData, quarter);
        const sumInMillions = (sum / 1000000).toFixed(1);
        html += `<td class="quarter-col">$${sumInMillions}M</td>`;
    });
    
    // Year totals for balances - using YEARS array
    YEARS.forEach(year => {
        const sum = calculateYearSum(grandTotalData, months, year);
        const sumInMillions = (sum / 1000000).toFixed(1);
        html += `<td class="year-total-col">$${sumInMillions}M</td>`;
    });
    html += '</tr>';
    
    // Product Mix Section - investments only
    if (mode === 'investments' || mode === 'all') {
    html += '<tr><td colspan="52" class="section-header">Product Mix (%)</td></tr>';

    PRODUCTS.forEach((product, productIndex) => {
        const isLastProduct = productIndex === PRODUCTS.length - 1;
        html += `<tr><td>${product} Mix (%)</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = Math.round(data.productMix[product][month] * 100);
            const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td class="forecast-col">
                    <input type="number" 
                           value="${value}" 
                           data-month="${month}" 
                           data-product="${product}"
                           data-metric="mix"
                           data-team="${AppState.currentTeam}"
                           class="selectable-input"
                           onchange="handleProductionChange(this)"
                           onblur="validateProductMix('${month}')"
                           style="width: calc(100% - 20px); display: inline-block;">
                    <span style="margin-left: 2px;">%</span>
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
    html += '<tr><td colspan="52" class="section-header">Average Balance per Account ($)</td></tr>';

    PRODUCTS.forEach(product => {
        html += `<tr><td>ABPA ${product}</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = data.abpa[product][month] || 0;
            const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td class="forecast-col">
                    <input type="text" 
                           value="${formatNumber(value)}" 
                           data-month="${month}" 
                           data-product="${product}"
                           data-metric="abpa"
                           data-team="${AppState.currentTeam}"
                           class="selectable-input"
                           onchange="handleProductionChange(this)"
                           onfocus="removeFormatting(this)"
                           onblur="addFormatting(this)">
                </td>`;
            } else {
                html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${formatNumber(value)}</td>`;
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
            
            const avgABPA = totalAccounts > 0 ? 
                Math.round(totalBalance / totalAccounts) : 0;
            html += `<td class="quarter-col">${formatNumber(avgABPA)}</td>`;
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
            
            const avgABPA = totalAccounts > 0 ? 
                Math.round(totalBalance / totalAccounts) : 0;
            html += `<td class="year-total-col">${formatNumber(avgABPA)}</td>`;
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
    
    }
    // ========== ADDITIONAL PRODUCTS SECTION (Banking) ==========
    if (mode === 'banking' || mode === 'all') {
    html += '<tr><td colspan="52" class="section-header">Additional Products</td></tr>';

    // Create sub-sections for each additional product
    ADDITIONAL_PRODUCTS.forEach(product => {
        const productName = `Product ${product}`;
        
        // Product sub-header
        html += `<tr style="height:12px;"><td colspan="52" style="padding:0; background:#f9f9f9;"></td></tr>`;
        
        // Productivity row
        html += `<tr><td>${productName} Productivity</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = data.additionalProducts?.[product]?.productivity?.[month] || '0.00';
            const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
            
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
        
        // ABPA row
        html += `<tr><td>${productName} ABPA</td>`;
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const value = data.additionalProducts?.[product]?.abpa?.[month] || 0;
            const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
            
            if (isForecast && !AppState.isGroupView && isCurrentForecast) {
                html += `<td class="forecast-col">
                    <input type="text" 
                           value="${formatNumber(value)}" 
                           data-month="${month}" 
                           data-product="${product}"
                           data-metric="additional-abpa"
                           data-team="${AppState.currentTeam}"
                           class="selectable-input"
                           onchange="handleAdditionalProductChange(this)"
                           onfocus="removeFormatting(this)"
                           onblur="addFormatting(this)">
                </td>`;
            } else {
                html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${formatNumber(value)}</td>`;
            }
        });
        
        // No quarters/years for ABPA (show dash)
        for (let i = 0; i < totalDashCells; i++) {
            const isYearCol = i >= QUARTERS.length;
            html += `<td class="${isYearCol ? 'year-total-col' : 'quarter-col'}">-</td>`;
        }
        html += '</tr>';
        
        // Accounts row (calculated) - UPDATED WITH WEEKLY PRODUCTIVITY
        html += `<tr><td>${productName} Accounts</td>`;
        const additionalProductAccountsData = {};
        months.forEach((month, idx) => {
            const headcount = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
            const weeklyProductivity = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
            const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
            // Updated formula: (headcount * weekly_productivity * business_days) / 5
            const accounts = Math.round((headcount * weeklyProductivity * businessDays) / 5);
            additionalProductAccountsData[month] = accounts;
            
            html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" 
                         id="additional-accounts-${product}-${month}">${formatNumber(accounts)}</td>`;
        });
        
        // Quarter and year totals for accounts
        QUARTERS.forEach(quarter => {
            const sum = calculateQuarterSum(additionalProductAccountsData, quarter);
            html += `<td class="quarter-col">${formatNumber(sum)}</td>`;
        });
        
        YEARS.forEach(year => {
            const sum = calculateYearSum(additionalProductAccountsData, months, year);
            html += `<td class="year-total-col">${formatNumber(sum)}</td>`;
        });
        html += '</tr>';
        
        // Balances row (calculated)
        html += `<tr><td>${productName} Balances</td>`;
        months.forEach(month => {
            const accounts = additionalProductAccountsData[month] || 0;
            const abpa = data.additionalProducts?.[product]?.abpa?.[month] || 0;
            const balance = accounts * abpa;
            const balanceInMillions = (balance / 1000000).toFixed(1);
            
            html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'} calculated-value" 
                         id="additional-balance-${product}-${month}">$${balanceInMillions}M</td>`;
        });
        
        // Quarter and year totals for balances
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
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
    
    // Setup input selection for bulk operations
    setupInputSelection();
}

// Setup input selection functionality for bulk operations
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
