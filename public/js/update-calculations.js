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
    });
    
    // Update grand total display
    const grandTotalCell = document.getElementById(`grand-total-${month}`);
    if (grandTotalCell) {
        const grandTotalInMillions = (grandTotal / 1000000).toFixed(1);
        grandTotalCell.textContent = `$${grandTotalInMillions}M`;
    }
    
    // Validate product mix
    validateProductMix(month);
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

