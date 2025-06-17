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
    // FIX #5: Remove period and version from quality ratios call
    const qualityRatios = await IncentiveCalculator.getQualityRatios(teamId);
    
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
    
    // Display Per-Advisor Target Metrics Section
    html += '<tr><td colspan="52" class="section-header">Per-Advisor Monthly Targets</td></tr>';
    
    // FIX #1: QS Target - Display only (no input field)
    html += '<tr class="subtotal-row"><td>QS Target</td>';
    months.forEach(month => {
        const value = Math.round(monthlyMetrics[month].accountsPerAdvisor);
        const isForecast = data.forecastStatus[month] === 'Forecast';
        // Just display the value directly - NO INPUT FIELD
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}</td>`;
    });
    
    // Quarter and year averages
    QUARTERS.forEach(quarter => {
        const quarterData = {};
        getMonthsInQuarter(quarter).forEach(m => {
            quarterData[m] = monthlyMetrics[m]?.accountsPerAdvisor || 0;
        });
        const avg = Math.round(calculateQuarterAverage(quarterData, quarter));
        html += `<td class="quarter-col">${avg}</td>`;
    });
    
    YEARS.forEach(year => {
        const yearData = {};
        months.filter(m => getYearFromMonth(m) === year).forEach(m => {
            yearData[m] = monthlyMetrics[m]?.accountsPerAdvisor || 0;
        });
        const avg = Math.round(calculateYearAverage(yearData, months, year));
        html += `<td class="year-total-col">${avg}</td>`;
    });
    html += '</tr>';
    
    // FIX #1 & #3: BG Target - Display only with 1 decimal
    html += '<tr class="subtotal-row"><td>BG Target ($M)</td>';
    months.forEach(month => {
        // FIX #3: Use .toFixed(1) for 1 decimal place
        const value = (monthlyMetrics[month].assetsPerAdvisor / 1000000).toFixed(1);
        const isForecast = data.forecastStatus[month] === 'Forecast';
        // Just display the value directly - NO INPUT FIELD
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}</td>`;
    });
    
    // Quarter and year calculations with 1 decimal
    QUARTERS.forEach(quarter => {
        const quarterData = {};
        getMonthsInQuarter(quarter).forEach(m => {
            quarterData[m] = monthlyMetrics[m]?.assetsPerAdvisor || 0;
        });
        const avg = (calculateQuarterAverage(quarterData, quarter) / 1000000).toFixed(1);
        html += `<td class="quarter-col">${avg}</td>`;
    });
    
    YEARS.forEach(year => {
        const yearData = {};
        months.filter(m => getYearFromMonth(m) === year).forEach(m => {
            yearData[m] = monthlyMetrics[m]?.assetsPerAdvisor || 0;
        });
        const avg = (calculateYearAverage(yearData, months, year) / 1000000).toFixed(1);
        html += `<td class="year-total-col">${avg}</td>`;
    });
    html += '</tr>';
    
    // AR Metrics Section
    html += '<tr><td colspan="52" class="section-header">Annuity Revenue (AR) Targets per Advisor</td></tr>';
    
    // FIX #2: AR Enroll - Changed from ($000) to ($M), divide by 1,000,000
    html += '<tr><td>AR Enroll ($M)</td>';
    months.forEach(month => {
        const value = (monthlyMetrics[month].arEnrollPerAdvisor / 1000000).toFixed(1);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">${value}</td>`;
    });
    // Quarter and year totals
    const totalCells = QUARTERS.length + YEARS.length;
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    // FIX #2: AR Book - Changed from ($000) to ($M), divide by 1,000,000
    html += '<tr><td>AR Book ($M)</td>';
    months.forEach(month => {
        const value = (monthlyMetrics[month].arBookPerAdvisor / 1000000).toFixed(1);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">${value}</td>`;
    });
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    // FIX #2: AR Ramp - Changed from ($000) to ($M), divide by 1,000,000
    html += '<tr><td>AR Ramp ($M)</td>';
    months.forEach(month => {
        const value = (monthlyMetrics[month].arRampPerAdvisor / 1000000).toFixed(1);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">${value}</td>`;
    });
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    // FIX #2: Total AR - Changed from ($000) to ($M), divide by 1,000,000
    html += '<tr class="total-row"><td>Total AR ($M)</td>';
    months.forEach(month => {
        const value = (monthlyMetrics[month].arTotalPerAdvisor / 1000000).toFixed(1);
        html += `<td class="${data.forecastStatus[month] === 'Forecast' ? 'forecast-col' : 'actual-col'}">${value}</td>`;
    });
    for (let i = 0; i < totalCells; i++) {
        html += `<td class="${i < QUARTERS.length ? 'quarter-col' : 'year-total-col'}">-</td>`;
    }
    html += '</tr>';
    
    html += '</tbody></table></div>';
    
    // Add admin panel button
    html += `<div style="margin-top: 20px; text-align: right;">
        <button onclick="window.open('/incentive-admin.html', '_blank')" 
                style="padding: 10px 20px; background-color: var(--boa-blue); color: white; border: none; border-radius: 4px; cursor: pointer;">
            Configure Incentive Settings
        </button>
    </div>`;
    
    container.innerHTML = html;
}

// Make function available globally
window.renderIncentiveTab = renderIncentiveTab;