function slugifyProductId(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function updateHeadcountTotals(team, month) {
    const teamKey = `Team ${team}`;
    const data = AppState.teamData[AppState.currentForecast][teamKey];
    
    const total = PG_LEVELS.reduce((sum, pg) => 
        sum + data.pgLevels[pg][month], 0);
    
    const totalCell = document.getElementById(`headcount-total-${month}`);
    if (totalCell) {
        totalCell.textContent = total;
    }
    
    // Also update production tab total if visible
    const prodTotalCell = document.getElementById(`prod-total-${month}`);
    if (prodTotalCell) {
        prodTotalCell.textContent = total;
    }
}

// Update production calculations
function updateProductionCalculations(team, month) {
    const teamKey = `Team ${team}`;
    const data = AppState.teamData[AppState.currentForecast][teamKey];
    if (!data.deepening) {
        data.deepening = { amount: {}, percent: {} };
    } else {
        data.deepening.amount = data.deepening.amount || {};
        data.deepening.percent = data.deepening.percent || {};
    }
    
    // Get the month index for business days
    const months = generateMonthList();
    const monthIndex = months.indexOf(month);
    if (monthIndex === -1) return;
    
    const businessDays = window.BUSINESS_DAYS?.[monthIndex] || 21;
    
    // Calculate total headcount
    const totalHeadcount = PG_LEVELS.reduce((sum, pg) => 
        sum + data.pgLevels[pg][month], 0);
    
    // Update production total headcount display
    const prodTotalCell = document.getElementById(`prod-total-${month}`);
    if (prodTotalCell) {
        prodTotalCell.textContent = totalHeadcount;
    }
    
    // Get productivity
    const productivity = parseFloat(data.productivity[month]) || 0;
    
    // Calculate total accounts
    const totalAccounts = Math.round(totalHeadcount * productivity * businessDays/5);
    
    // Update total accounts display
    const totalAccountsCell = document.getElementById(`total-accounts-${month}`);
    if (totalAccountsCell) {
        totalAccountsCell.textContent = formatNumber(totalAccounts);
    }
    
    // Update product-specific accounts and balances
    let grandTotal = 0;
    let investmentAccountsTotal = 0;
    let investmentAssetsTotal = 0;
    let productCAccounts = 0;
    let productCAbpa = 0;

    PRODUCTS.forEach(product => {
        // Get product mix
        const productMix = data.productMix[product][month];
        
        // Calculate product accounts
        const productAccounts = Math.round(totalAccounts * productMix);
        
        // Update product accounts display
        const accountsCell = document.getElementById(`accounts-${product}-${month}`);
        if (accountsCell) {
            accountsCell.textContent = formatNumber(productAccounts);
        }
        
        const abpa = data.abpa[product][month] || 0;
        const productSlug = slugifyProductId(product);
        const abpaCell = document.getElementById(`abpa-${productSlug}-${month}`);
        if (abpaCell) {
            const inputEl = abpaCell.querySelector('input');
            if (inputEl) {
                inputEl.value = String(Math.round(abpa / 1000));
            } else {
                abpaCell.innerHTML = `${formatThousands(abpa, 0)}<span class="table-value-suffix">K</span>`;
            }
        }

        // Calculate product balance
        const productBalance = productAccounts * abpa;
        
        // Update product balance display
        const balanceCell = document.getElementById(`balance-${product}-${month}`);
        if (balanceCell) {
            const balanceInMillions = (productBalance / 1000000).toFixed(1);
            balanceCell.textContent = `$${balanceInMillions}M`;
        }
        
        // Add to grand total
        grandTotal += productBalance;
        investmentAccountsTotal += productAccounts;
        investmentAssetsTotal += productBalance;
        if (product === 'Product C') {
            productCAccounts = productAccounts;
            productCAbpa = abpa;
        }
    });
    
    // Update grand total display
    const grandTotalCell = document.getElementById(`grand-total-${month}`);
    if (grandTotalCell) {
        const grandTotalInMillions = (grandTotal / 1000000).toFixed(1);
        grandTotalCell.textContent = `$${grandTotalInMillions}M`;
    }

    const status = data.forecastStatus?.[month];
    const isForecastStatus = status === 'Forecast';
    const storedDeepPercent = Number(data.deepening.percent[month]);
    const storedDeepAmount = Number(data.deepening.amount[month]);
    let deepPercent = Number.isFinite(storedDeepPercent) ? storedDeepPercent : 0.15;
    let deepAmount = storedDeepAmount;

    if (isForecastStatus) {
        deepAmount = grandTotal * deepPercent;
    } else {
        if (!Number.isFinite(deepAmount)) {
            deepAmount = grandTotal * deepPercent;
        }
        deepPercent = grandTotal > 0 ? deepAmount / grandTotal : 0;
    }

    data.deepening.percent[month] = deepPercent;
    data.deepening.amount[month] = deepAmount;

    const deepAmountCell = document.getElementById(`deepening-amount-${month}`);
    if (deepAmountCell) {
        deepAmountCell.textContent = `$${(deepAmount / 1000000).toFixed(1)}M`;
    }
    const deepPercentCell = document.getElementById(`deepening-percent-${month}`);
    if (deepPercentCell) {
        const inputEl = deepPercentCell.querySelector('input');
        const pctDisplay = (deepPercent * 100).toFixed(1);
        if (inputEl) {
            inputEl.value = pctDisplay;
        } else {
            deepPercentCell.textContent = `${pctDisplay}%`;
        }
    }

    let bankingAccountsTotal = 0;
    let bankingAssetsTotal = 0;
    if (Array.isArray(ADDITIONAL_PRODUCTS)) {
        ADDITIONAL_PRODUCTS.forEach(product => {
            const weeklyProd = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
            const abpa = parseFloat(data.additionalProducts?.[product]?.abpa?.[month] || 0);
            const productAccounts = Math.round((totalHeadcount * weeklyProd * businessDays) / 5);
            bankingAccountsTotal += productAccounts;
            bankingAssetsTotal += productAccounts * abpa;
        });
    }

    const productCBalance = productCAccounts * productCAbpa;
    if (!data.productionTotals) {
        data.productionTotals = {};
    }
    data.productionTotals[month] = {
        businessDays,
        productiveHeadcount: totalHeadcount,
        totalInvestmentAccounts: totalAccounts,
        investmentAccounts: investmentAccountsTotal,
        investmentAssets: investmentAssetsTotal,
        productCAccounts,
        productCAbpa,
        productCBalance,
        bankingAccounts: bankingAccountsTotal,
        bankingAssets: bankingAssetsTotal
    };

    const investmentBalanceByMonth = {};
    months.forEach(m => {
        investmentBalanceByMonth[m] = Number(data.productionTotals?.[m]?.investmentAssets) || 0;
    });

    if (typeof QUARTERS !== 'undefined' && Array.isArray(QUARTERS) && typeof getMonthsInQuarter === 'function') {
        QUARTERS.forEach(quarter => {
            const slug = slugifyProductId(quarter);
            const deepQuarterAmount = calculateQuarterSum(data.deepening.amount, quarter);
            const balanceQuarter = calculateQuarterSum(investmentBalanceByMonth, quarter);
            const deepQuarterPercent = balanceQuarter > 0 ? deepQuarterAmount / balanceQuarter : 0;
            const amtCell = document.getElementById(`deepening-amount-quarter-${slug}`);
            if (amtCell) {
                amtCell.textContent = `$${(deepQuarterAmount / 1000000).toFixed(1)}M`;
            }
            const pctCell = document.getElementById(`deepening-percent-quarter-${slug}`);
            if (pctCell) {
                pctCell.textContent = `${(deepQuarterPercent * 100).toFixed(1)}%`;
            }
        });
    }

    if (typeof YEARS !== 'undefined' && Array.isArray(YEARS)) {
        YEARS.forEach(year => {
            const deepYearAmount = calculateYearSum(data.deepening.amount, months, year);
            const balanceYear = calculateYearSum(investmentBalanceByMonth, months, year);
            const deepYearPercent = balanceYear > 0 ? deepYearAmount / balanceYear : 0;
            const amtCell = document.getElementById(`deepening-amount-year-${year}`);
            if (amtCell) {
                amtCell.textContent = `$${(deepYearAmount / 1000000).toFixed(1)}M`;
            }
            const pctCell = document.getElementById(`deepening-percent-year-${year}`);
            if (pctCell) {
                pctCell.textContent = `${(deepYearPercent * 100).toFixed(1)}%`;
            }
        });
    }
    
    // Validate product mix
    validateProductMix(month);

    // Refresh banking totals if present
    recalculateBankingTotals(team);
}

// Format number helper
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

function recalculateBankingTotals(team) {
    if (!Array.isArray(ADDITIONAL_PRODUCTS) || ADDITIONAL_PRODUCTS.length === 0) {
        return;
    }

    const forecastKey = AppState.currentForecast;
    const teamKey = `Team ${team}`;
    const data = AppState.teamData?.[forecastKey]?.[teamKey];
    if (!data) {
        return;
    }

    const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
    if (!months.length) {
        return;
    }

    const sanitizeKey = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const bankingAccountsData = {};
    const bankingBalancesData = {};
    const grandTotalData = {};

    months.forEach((month, idx) => {
        const headcount = PG_LEVELS.reduce((sum, pg) => sum + (parseInt(data.pgLevels?.[pg]?.[month] || 0, 10)), 0);
        const businessDays = window.BUSINESS_DAYS?.[idx] || 21;

        let monthlyBankingAccounts = 0;
        let monthlyBankingBalance = 0;

        ADDITIONAL_PRODUCTS.forEach(product => {
            const weeklyProd = parseFloat(data.additionalProducts?.[product]?.productivity?.[month] || 0);
            const abpa = parseFloat(data.additionalProducts?.[product]?.abpa?.[month] || 0);
            const accounts = Math.round((headcount * weeklyProd * businessDays) / 5);
            monthlyBankingAccounts += accounts;
            monthlyBankingBalance += accounts * abpa;
        });

        bankingAccountsData[month] = monthlyBankingAccounts;
        bankingBalancesData[month] = monthlyBankingBalance;

        const monthlyGrandTotal = monthlyBankingBalance;
        grandTotalData[month] = monthlyGrandTotal;

        if (!data.productionTotals) {
            data.productionTotals = {};
        }
        const totals = data.productionTotals[month] || {};
        totals.businessDays = businessDays;
        totals.productiveHeadcount = Number.isFinite(totals.productiveHeadcount) ? totals.productiveHeadcount : headcount;
        totals.bankingAccounts = monthlyBankingAccounts;
        totals.bankingAssets = monthlyBankingBalance;
        if (!Number.isFinite(totals.productCAccounts)) {
            totals.productCAccounts = 0;
        }
        if (!Number.isFinite(totals.productCAbpa)) {
            totals.productCAbpa = 0;
        }
        totals.productCBalance = totals.productCAccounts * totals.productCAbpa;
        data.productionTotals[month] = totals;

        const accountsCell = document.querySelector(`#production-banking-subtab #banking-total-accounts-${month}`);
        if (accountsCell) {
            accountsCell.textContent = formatNumber(monthlyBankingAccounts);
        }

        const totalBalanceCell = document.querySelector(`#production-banking-subtab #grand-total-${month}`);
        if (totalBalanceCell) {
            totalBalanceCell.textContent = `$${(monthlyGrandTotal / 1000000).toFixed(1)}M`;
        }
    });

    if (typeof QUARTERS !== 'undefined' && Array.isArray(QUARTERS) && typeof getMonthsInQuarter === 'function') {
        QUARTERS.forEach(quarter => {
            const quarterBankingAccounts = calculateQuarterSum(bankingAccountsData, quarter);
            const bankingQuarterCell = document.querySelector(`#production-banking-subtab #banking-total-accounts-quarter-${sanitizeKey(quarter)}`);
            if (bankingQuarterCell) {
                bankingQuarterCell.textContent = formatNumber(quarterBankingAccounts);
            }

            const quarterGrandTotal = calculateQuarterSum(grandTotalData, quarter);
            const totalQuarterCell = document.querySelector(`#production-banking-subtab #grand-total-quarter-${sanitizeKey(quarter)}`);
            if (totalQuarterCell) {
                totalQuarterCell.textContent = `$${(quarterGrandTotal / 1000000).toFixed(1)}M`;
            }
        });
    }

    if (typeof YEARS !== 'undefined' && Array.isArray(YEARS)) {
        YEARS.forEach(year => {
            const bankingYearSum = calculateYearSum(bankingAccountsData, months, year);
            const bankingYearCell = document.querySelector(`#production-banking-subtab #banking-total-accounts-year-${year}`);
            if (bankingYearCell) {
                bankingYearCell.textContent = formatNumber(bankingYearSum);
            }

            const grandYearSum = calculateYearSum(grandTotalData, months, year);
            const totalYearCell = document.querySelector(`#production-banking-subtab #grand-total-year-${year}`);
            if (totalYearCell) {
                totalYearCell.textContent = `$${(grandYearSum / 1000000).toFixed(1)}M`;
            }
        });
    }
}

function getReferralDefaultRatio(type) {
    if (type === 'total') {
        return typeof window.REFERRAL_DEFAULT_TOTAL_RATIO === 'number'
            ? window.REFERRAL_DEFAULT_TOTAL_RATIO
            : 1.2;
    }
    return typeof window.REFERRAL_DEFAULT_WINS_RATIO === 'number'
        ? window.REFERRAL_DEFAULT_WINS_RATIO
        : 0.3;
}

function updateReferralCalculations(team, month, flowKey) {
    if (!flowKey) {
        return;
    }
    const teamKey = `Team ${team}`;
    const data = AppState.teamData[AppState.currentForecast]?.[teamKey];
    if (!data || !data.referrals || !data.referrals.outbound || !data.referrals.outbound[flowKey]) {
        return;
    }

    const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
    const monthIndex = months.indexOf(month);
    if (monthIndex === -1) {
        return;
    }

    const businessDays = window.BUSINESS_DAYS?.[monthIndex] || 21;
    const totalHeadcount = PG_LEVELS.reduce((sum, pg) => {
        const value = Number(data.pgLevels[pg][month] || 0);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    const productivityValue = Number.parseFloat(
        data.referrals.outbound[flowKey].productivity[month] || 0
    ) || 0;

    const status = data.forecastStatus?.[month];
    const qualityCell = document.getElementById(`referral-quality-${flowKey}-${month}`);

    if (status !== 'Forecast') {
        const actualQuality = Number(data.referrals.outbound[flowKey].qualityReferrals?.[month]);
        if (qualityCell && Number.isFinite(actualQuality)) {
            qualityCell.textContent = formatNumber(actualQuality);
        }
        const totalValueActual = Number(data.referrals.outbound[flowKey].totalActuals[month]) || 0;
        const wonValueActual = Number(data.referrals.outbound[flowKey].wonActuals[month]) || 0;
        const totalCellActual = document.getElementById(`referral-total-${flowKey}-${month}`);
        const wonCellActual = document.getElementById(`referral-won-${flowKey}-${month}`);
        if (totalCellActual) {
            totalCellActual.textContent = formatNumber(totalValueActual);
        }
        if (wonCellActual) {
            wonCellActual.textContent = formatNumber(wonValueActual);
        }
        return;
    }

    const quality = Math.round((totalHeadcount * productivityValue * businessDays) / 5);
    if (!data.referrals.outbound[flowKey].qualityReferrals) {
        data.referrals.outbound[flowKey].qualityReferrals = {};
    }
    data.referrals.outbound[flowKey].qualityReferrals[month] = quality;

    if (qualityCell) {
        qualityCell.textContent = formatNumber(quality);
    }

    const config = AppState.referralConfig || getDefaultReferralConfig();
    const totalRatio = config.totalToQuality?.[flowKey] ?? getReferralDefaultRatio('total');
    const winsRatio = config.winsToQuality?.[flowKey] ?? getReferralDefaultRatio('wins');

    const totalValue = Math.round(quality * totalRatio);
    const wonValue = Math.round(quality * winsRatio);
    data.referrals.outbound[flowKey].totalActuals[month] = totalValue;
    data.referrals.outbound[flowKey].wonActuals[month] = wonValue;

    const totalCell = document.getElementById(`referral-total-${flowKey}-${month}`);
    if (totalCell) {
        totalCell.textContent = formatNumber(totalValue);
    }

    const wonCell = document.getElementById(`referral-won-${flowKey}-${month}`);
    if (wonCell) {
        wonCell.textContent = formatNumber(wonValue);
    }
}

window.updateReferralCalculations = updateReferralCalculations;

function recalcForecastProductionTotals(team) {
    if (typeof generateMonthList !== 'function') return;
    const forecastKey = AppState.currentForecast;
    const teamKey = `Team ${team}`;
    const data = AppState.teamData?.[forecastKey]?.[teamKey];
    if (!data || !data.forecastStatus) return;
    const months = generateMonthList();
    months.forEach(month => {
        if (data.forecastStatus[month] === 'Forecast') {
            updateProductionCalculations(team, month);
        }
    });
}

window.recalcForecastProductionTotals = recalcForecastProductionTotals;

