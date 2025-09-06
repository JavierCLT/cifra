// public/js/render-incentive-tab.js
// Rendering function for the INCENTIVE tab

async function renderIncentiveTab(data) {
    const container = document.getElementById('incentive-tab');
    const months = generateMonthList();
    
    // Show loading while fetching data
    container.innerHTML = '<div class="loading">Loading incentive data...</div>';
    
    // Get team-specific configuration from API
    const teamId = AppState.currentTeam;
    const versionId = AppState.currentVersion.version_id;
    
    const compensableMetrics = await IncentiveCalculator.getCompensableMetrics(teamId, versionId);
    
    // For quality ratios, we need to pass a specific period - use the first forecast month
    const firstForecastMonth = months.find(month => data.forecastStatus[month] === 'Forecast') || months[0];
    const qualityRatios = await IncentiveCalculator.getQualityRatios(teamId, firstForecastMonth, versionId);
    
    // Add admin panel button to the tab navigation area (only for team view)
    if (!AppState.isGroupView) {
        // Find the tabs container and add the button
        const tabsContainer = document.querySelector('.tabs');
        if (tabsContainer && !document.getElementById('incentiveAdminBtn')) {
            const adminButton = document.createElement('button');
            adminButton.id = 'incentiveAdminBtn';
            adminButton.className = 'btn btn-primary';
            adminButton.style.cssText = `
                background-color: #0066cc;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 14px;
                cursor: pointer;
                transition: background-color 0.3s;
                margin-left: 20px;
                float: right;
            `;
            adminButton.textContent = 'Open Incentive Admin Panel';
            adminButton.onclick = () => {
                const teamId = AppState.currentTeam;
                const versionId = AppState.currentVersion?.version_id;
                const url = `incentive-admin.html?teamId=${encodeURIComponent(teamId)}${versionId ? `&versionId=${encodeURIComponent(versionId)}` : ''}`;
                window.open(url, '_blank');
            };
            adminButton.onmouseover = () => adminButton.style.backgroundColor = '#0052a3';
            adminButton.onmouseout = () => adminButton.style.backgroundColor = '#0066cc';
            
            tabsContainer.appendChild(adminButton);
        }
    }
    
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
        const isForecast = data.forecastStatus[month] === 'Forecast';
        
        monthlyMetrics[month] = IncentiveCalculator.calculateMetrics(
            teamId, month, productionData, compensableMetrics, qualityRatios, isForecast
        );
    });
    
    // Display Per-Advisor Target Metrics Section
    html += '<tr><td colspan="52" class="section-header">Per-Advisor Monthly Targets</td></tr>';
    
    // QS Target - Display only (no input field)
    html += '<tr class="subtotal-row"><td>QS Target</td>';
    months.forEach(month => {
        const value = Math.round(monthlyMetrics[month].accountsPerAdvisor);
        const isForecast = data.forecastStatus[month] === 'Forecast';
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${value}</td>`;
    });
    
    // Calculate and display quarter averages for QS Target
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const avg = calculateAverage(quarterMonths.map(m => monthlyMetrics[m]?.accountsPerAdvisor || 0));
        html += `<td class="quarter-col">${Math.round(avg)}</td>`;
    });
    
    // Calculate and display year averages for QS Target
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const avg = calculateAverage(yearMonths.map(m => monthlyMetrics[m]?.accountsPerAdvisor || 0));
        html += `<td class="year-total-col">${Math.round(avg)}</td>`;
    });
    html += '</tr>';
    
    // Assets Target
    html += '<tr class="subtotal-row"><td>Assets Target ($M)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].assetsPerAdvisor;
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const displayValue = value >= 1000000 ? 
            `$${(value / 1000000).toFixed(1)}M` : 
            `$${Math.round(value / 1000)}K`;
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${displayValue}</td>`;
    });
    
    // Quarter averages for Assets
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const avg = calculateAverage(quarterMonths.map(m => monthlyMetrics[m]?.assetsPerAdvisor || 0));
        const displayValue = avg >= 1000000 ? 
            `$${(avg / 1000000).toFixed(1)}M` : 
            `$${Math.round(avg / 1000)}K`;
        html += `<td class="quarter-col">${displayValue}</td>`;
    });
    
    // Year averages for Assets
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const avg = calculateAverage(yearMonths.map(m => monthlyMetrics[m]?.assetsPerAdvisor || 0));
        const displayValue = avg >= 1000000 ? 
            `$${(avg / 1000000).toFixed(1)}M` : 
            `$${Math.round(avg / 1000)}K`;
        html += `<td class="year-total-col">${displayValue}</td>`;
    });
    html += '</tr>';
    
    // Spacing row
    html += '<tr class="spacing-row"><td colspan="52">&nbsp;</td></tr>';
    
    // AR Metrics Section
    html += '<tr><td colspan="52" class="section-header">AR Metrics (Per Advisor)</td></tr>';
    
    // AR Enroll
    html += '<tr><td>AR Enroll ($M)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arEnrollPerAdvisor;
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const displayValue = (value / 1000000).toFixed(1);
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${displayValue}</td>`;
    });
    
    // Quarter averages for AR Enroll
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const avg = calculateAverage(quarterMonths.map(m => monthlyMetrics[m]?.arEnrollPerAdvisor || 0));
        const displayValue = (avg / 1000000).toFixed(1);
        html += `<td class="quarter-col">${displayValue}</td>`;
    });
    
    // Year averages for AR Enroll
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const avg = calculateAverage(yearMonths.map(m => monthlyMetrics[m]?.arEnrollPerAdvisor || 0));
        const displayValue = (avg / 1000000).toFixed(1);
        html += `<td class="year-total-col">${displayValue}</td>`;
    });
    html += '</tr>';
    
    // AR Book
    html += '<tr><td>AR Book ($M)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arBookPerAdvisor;
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const displayValue = (value / 1000000).toFixed(1);
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${displayValue}</td>`;
    });
    
    // Quarter averages for AR Book
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const avg = calculateAverage(quarterMonths.map(m => monthlyMetrics[m]?.arBookPerAdvisor || 0));
        const displayValue = (avg / 1000000).toFixed(1);
        html += `<td class="quarter-col">${displayValue}</td>`;
    });
    
    // Year averages for AR Book
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const avg = calculateAverage(yearMonths.map(m => monthlyMetrics[m]?.arBookPerAdvisor || 0));
        const displayValue = (avg / 1000000).toFixed(1);
        html += `<td class="year-total-col">${displayValue}</td>`;
    });
    html += '</tr>';
    
    // AR Ramp
    html += '<tr><td>AR Ramp ($M)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arBookPerAdvisor;
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const displayValue = (value / 1000000).toFixed(1);
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${displayValue}</td>`;
    });
    
    // Quarter averages for AR Ramp
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const avg = calculateAverage(quarterMonths.map(m => monthlyMetrics[m]?.arRampPerAdvisor || 0));
        const displayValue = avg >= 1000 ? `$${Math.round(avg / 1000)}K` : `$${Math.round(avg)}`;
        html += `<td class="quarter-col">${displayValue}</td>`;
    });
    
    // Year averages for AR Ramp
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const avg = calculateAverage(yearMonths.map(m => monthlyMetrics[m]?.arRampPerAdvisor || 0));
        const displayValue = avg >= 1000 ? `$${Math.round(avg / 1000)}K` : `$${Math.round(avg)}`;
        html += `<td class="year-total-col">${displayValue}</td>`;
    });
    html += '</tr>';
    
    // AR Total (subtotal row)
    html += '<tr class="subtotal-row"><td>AR Total ($M)</td>';
    months.forEach(month => {
        const value = monthlyMetrics[month].arTotalPerAdvisor;
        const isForecast = data.forecastStatus[month] === 'Forecast';
        const displayValue = (value / 1000000).toFixed(1);
        html += `<td class="${isForecast ? 'forecast-col' : 'actual-col'}">${displayValue}</td>`;
    });
    
    // Quarter averages for AR Total
    QUARTERS.forEach(quarter => {
        const quarterMonths = getMonthsInQuarter(quarter);
        const avg = calculateAverage(quarterMonths.map(m => monthlyMetrics[m]?.arTotalPerAdvisor || 0));
        const displayValue = (avg / 1000000).toFixed(1);
        html += `<td class="quarter-col">${displayValue}</td>`;
    });
    
    // Year averages for AR Total
    YEARS.forEach(year => {
        const yearMonths = months.filter(m => getYearFromMonth(m) === year);
        const avg = calculateAverage(yearMonths.map(m => monthlyMetrics[m]?.arTotalPerAdvisor || 0));
        const displayValue = (avg / 1000000).toFixed(1);
        html += `<td class="year-total-col">${displayValue}</td>`;
    });
    html += '</tr>';
    
    html += '</tbody></table></div>';
    
    container.innerHTML = html;

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
            // Keep saving as user scrolls so refreshes don’t jump
            wrapper.addEventListener('scroll', () => {
                if (typeof AppState !== 'undefined' && AppState.scrollPositions) {
                    AppState.scrollPositions.incentive = wrapper.scrollLeft;
                }
            }, { passive: true });
        }
    } catch (e) { /* no-op */ }
}

// Helper function to calculate average
function calculateAverage(values) {
    const validValues = values.filter(v => v !== null && v !== undefined && !isNaN(v));
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
}

// Export to make it available globally
window.renderIncentiveTab = renderIncentiveTab;
