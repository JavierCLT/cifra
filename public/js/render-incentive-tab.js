// public/js/render-incentive-tab.js
// Rendering function for the INCENTIVE tab

async function renderIncentiveTab(data) {
    const container = document.getElementById('incentive-tab');
    const months = generateMonthList();
    
    // Show loading while fetching data
    container.innerHTML = '<div class="loading">Loading incentive data...</div>';
    
    // Get team-specific configuration from API
    const teamId = AppState.currentTeam;
    const compensableMetrics = await IncentiveCalculator.getCompensableMetrics(teamId);
    const qualityRatios = await IncentiveCalculator.getQualityRatios(teamId, months[0], AppState.currentVersion.version_id);
    
    let html = '<div class="data-table-wrapper"><table class="data-table">';
    
    // Header rows
    html += '<thead><tr><th rowspan="2">Target Metric</th>';
    
    // Month headers with business days
    months.forEach((month, idx) => {
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${businessDays}</th>`;
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
        html += `<th class="${isForecast ? 'forecast-col' : 'actual-col'}">${month}</th>`;
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
    
    // Calculate metrics for each month
    const monthlyMetrics = {};
    months.forEach(month => {
        const productionData = IncentiveCalculator.getProductionData(data, month);
        monthlyMetrics[month] = IncentiveCalculator.calculateMetrics(
            teamId, month, productionData, compensableMetrics, qualityRatios
        );
    });
    
    // Display Raw Production Metrics Section
    html += '<tr><td colspan="52" class="section-header">Raw Production Metrics</td></tr>';
    
    // Total Productive Headcount
    html += '<tr><td>Total Productive Headcount</td>';
    months.forEach(month => {
        const total = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">${total}</td>`;
    });
    // Quarter and year averages
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
    
    // Adjusted Productive Headcount
    html += '<tr><td>Adjusted Productive Headcount</td>';
    const headcountRatio = qualityRatios.productive_headcount;
    months.forEach(month => {
        const total = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
        const adjusted = Math.round(total * headcountRatio * 10) / 10;
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">${adjusted}</td>`;
    });
    // Quarter and year calculations
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const quarterTotals = quarterMonths.map(month => {
            const total = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
            return total * headcountRatio;
        });
        const avg = quarterTotals.length > 0 ? 
            Math.round(quarterTotals.reduce((a, b) => a + b, 0) / quarterTotals.length * 10) / 10 : 0;
        html += `<td class="quarter-col">${avg}</td>`;
    });
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const yearTotals = yearMonths.map(month => {
            const total = PG_LEVELS.reduce((sum, pg) => sum + data.pgLevels[pg][month], 0);
            return total * headcountRatio;
        });
        const avg = Math.round(yearTotals.reduce((a, b) => a + b, 0) / yearTotals.length * 10) / 10;
        html += `<td class="year-total-col">${avg}</td>`;
    });
    html += '</tr>';
    
    // Display Per-Advisor Target Metrics Section
    html += '<tr><td colspan="52" class="section-header">Per-Advisor Monthly Targets</td></tr>';
    
    // Accounts per Advisor
    html += '<tr class="subtotal-row"><td>Accounts per Advisor</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].accountsPerAdvisor;
        const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
        const isForecast = data.forecastStatus[month] === 'Forecast';
        
        if (isForecast && !AppState.isGroupView && isCurrentForecast) {
            html += `<td class="forecast-col">
                <input type="number" 
                       value="${value}" 
                       step="0.01"
                       data-month="${month}"
                       data-metric="accounts_target"
                       data-team="${AppState.currentTeam}"
                       onchange="handleIncentiveChange(this)"
                       readonly
                       style="background-color: #f0f0f0;">
            </td>`;
        } else {
            html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value.toFixed(2)}</td>`;
        }
    });
    // Quarter and year averages
    QUARTERS.forEach(quarter => {
        const quarterData = {};
        getMonthsInQuarter(quarter).forEach(m => {
            quarterData[m] = monthlyMetrics[m]?.accountsPerAdvisor || 0;
        });
        const avg = calculateQuarterAverage(quarterData, quarter);
        html += `<td class="quarter-col">${avg.toFixed(2)}</td>`;
    });
    YEARS.forEach(year => {
        const yearData = {};
        months.filter(m => getYearFromMonth(m) === year).forEach(m => {
            yearData[m] = monthlyMetrics[m]?.accountsPerAdvisor || 0;
        });
        const avg = calculateYearAverage(yearData, months, year);
        html += `<td class="year-total-col">${avg.toFixed(2)}</td>`;
    });
    html += '</tr>';
    
    // Assets per Advisor
    html += '<tr class="subtotal-row"><td>Assets per Advisor ($000)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].assetsPerAdvisor / 1000; // Convert to thousands
        const isCurrentForecast = AppState.currentVersion && AppState.currentVersion.version_id === 2;
        const isForecast = data.forecastStatus[month] === 'Forecast';
        
        if (isForecast && !AppState.isGroupView && isCurrentForecast) {
            html += `<td class="forecast-col">
                <input type="number" 
                       value="${value.toFixed(1)}" 
                       step="0.1"
                       data-month="${month}"
                       data-metric="assets_target"
                       data-team="${AppState.currentTeam}"
                       onchange="handleIncentiveChange(this)"
                       readonly
                       style="background-color: #f0f0f0;">
            </td>`;
        } else {
            html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">$${value.toFixed(1)}</td>`;
        }
    });
    // Quarter and year calculations
    QUARTERS.forEach(quarter => {
        const quarterData = {};
        getMonthsInQuarter(quarter).forEach(m => {
            quarterData[m] = monthlyMetrics[m]?.assetsPerAdvisor || 0;
        });
        const avg = calculateQuarterAverage(quarterData, quarter) / 1000;
        html += `<td class="quarter-col">$${avg.toFixed(1)}</td>`;
    });
    YEARS.forEach(year => {
        const yearData = {};
        months.filter(m => getYearFromMonth(m) === year).forEach(m => {
            yearData[m] = monthlyMetrics[m]?.assetsPerAdvisor || 0;
        });
        const avg = calculateYearAverage(yearData, months, year) / 1000;
        html += `<td class="year-total-col">$${avg.toFixed(1)}</td>`;
    });
    html += '</tr>';
    
    // AR Metrics Section
    html += '<tr><td colspan="52" class="section-header">Annuity Revenue (AR) Targets per Advisor</td></tr>';
    
    // AR Enroll
    html += '<tr><td>AR Enroll per Advisor ($000)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arEnrollPerAdvisor / 1000;
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">$${value.toFixed(1)}</td>`;
    });
    // Quarter and year totals
    const totalCells = QUARTERS.length + YEARS.length;
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    // AR Book
    html += '<tr><td>AR Book per Advisor ($000)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arBookPerAdvisor / 1000;
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">$${value.toFixed(1)}</td>`;
    });
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    // AR Ramp
    html += '<tr><td>AR Ramp per Advisor ($000)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arRampPerAdvisor / 1000;
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">$${value.toFixed(1)}</td>`;
    });
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    // Total AR
    html += '<tr class="total-row"><td>Total AR per Advisor ($000)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arTotalPerAdvisor / 1000;
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">$${value.toFixed(1)}</td>`;
    });
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    // Quality Ratios Applied Section (for transparency)
    html += '<tr><td colspan="52" class="section-header">Quality Ratios Applied</td></tr>';
    
    const ratioDisplay = [
        { label: 'Investment Accounts', value: (qualityRatios.investment_accounts * 100).toFixed(0) + '%' },
        { label: 'Investment Assets', value: (qualityRatios.investment_assets * 100).toFixed(0) + '%' },
        { label: 'Banking Accounts', value: (qualityRatios.banking_accounts * 100).toFixed(0) + '%' },
        { label: 'Banking Assets', value: (qualityRatios.banking_assets * 100).toFixed(0) + '%' },
        { label: 'Wealth Mgmt Overlay', value: (qualityRatios.wealth_accounts * 100).toFixed(0) + '%' },
        { label: 'Productive Headcount', value: (qualityRatios.productive_headcount * 100).toFixed(0) + '%' }
    ];
    
    ratioDisplay.forEach(ratio => {
        html += `<tr><td>${ratio.label} Ratio</td>`;
        html += `<td colspan="52" style="text-align: left; padding-left: 20px; font-weight: bold;">${ratio.value}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Handle changes to incentive inputs (if you want to make them editable later)
function handleIncentiveChange(input) {
    // For now, these are read-only calculated fields
    // In the future, you might allow manual adjustments
    console.log('Incentive change:', input.dataset.metric, input.value);
}

// Make function available globally
window.renderIncentiveTab = renderIncentiveTab;