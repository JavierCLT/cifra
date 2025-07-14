// public/js/incentive-calculations.js
// Logic for calculating incentive metrics

const IncentiveCalculator = {
    // Get production data for calculations
    getProductionData: function(teamData, month) {
    const months = generateMonthList();
    const monthIndex = months.indexOf(month);
    const businessDays = window.BUSINESS_DAYS?.[monthIndex] || 21;
    
    // Calculate total headcount
    const totalHeadcount = PG_LEVELS.reduce((sum, pg) => 
        sum + teamData.pgLevels[pg][month], 0);
    
    // Get productivity
    const productivity = parseFloat(teamData.productivity[month]) || 0;
    
    // Calculate total accounts for investment products
    const totalAccounts = Math.round(totalHeadcount * productivity * businessDays);
    
    // Investment products (A, B, C, D)
    const investmentProducts = ['Product A', 'Product B', 'Product C', 'Product D'];
    let investmentAccounts = 0;
    let investmentAssets = 0;
    
    investmentProducts.forEach(product => {
        const mix = teamData.productMix[product][month] || 0;
        const accounts = Math.round(totalAccounts * mix);
        const abpa = teamData.abpa[product][month] || 0;
        
        investmentAccounts += accounts;
        investmentAssets += accounts * abpa;
    });
    
    // Banking products (AA through HH) - these use individual productivity
    const bankingProducts = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'];
    let bankingAccounts = 0;
    let bankingAssets = 0;
    
    bankingProducts.forEach(product => {
        // Access from additionalProducts structure
        const productProductivity = parseFloat(teamData.additionalProducts?.[product]?.productivity?.[month] || 0);
        const productAbpa = parseFloat(teamData.additionalProducts?.[product]?.abpa?.[month] || 0);
        
        // Banking products use: (headcount * weekly_productivity * business_days) / 5
        const accounts = Math.round((totalHeadcount * productProductivity * businessDays) / 5);
        bankingAccounts += accounts;
        bankingAssets += accounts * productAbpa;
    });
    
    // Get Product C balance specifically for AR calculations
    const productCMix = teamData.productMix['Product C'][month] || 0;
    const productCAccounts = Math.round(totalAccounts * productCMix);
    const productCAbpa = teamData.abpa['Product C'][month] || 0;
    const productCBalance = productCAccounts * productCAbpa;
    
    return {
        totalHeadcount,
        investmentAccounts,
        investmentAssets,
        bankingAccounts,
        bankingAssets,
        productCBalance
    };
},
    
    // Calculate incentive metrics for a team and month
    calculateMetrics: function(teamId, month, productionData, compensableMetrics, qualityRatios, isForecast) {
    // Get productive headcount quality ratio
    const headcountRatio = qualityRatios.productive_headcount || 0.9;
    const adjustedHeadcount = productionData.totalHeadcount * headcountRatio;
    
        if (adjustedHeadcount === 0) {
            return {
                accountsPerAdvisor: 0,
                assetsPerAdvisor: 0,
                arEnrollPerAdvisor: 0,
                arBookPerAdvisor: 0,
                arRampPerAdvisor: 0,
                arTotalPerAdvisor: 0
            };
        }
        
        // Calculate Accounts per Advisor
        let totalAdjustedAccounts = 0;
        
        // Only apply compensable metrics adjustments for forecast periods
        if (isForecast) {
            if (compensableMetrics.investment_accounts) {
                const ratio = qualityRatios.investment_accounts || 1;
                totalAdjustedAccounts += productionData.investmentAccounts * ratio;
            }
            
            if (compensableMetrics.banking_accounts) {
                const ratio = qualityRatios.banking_accounts || 1;
                totalAdjustedAccounts += productionData.bankingAccounts * ratio;
            }
            
            if (compensableMetrics.wealth_accounts) {
                const ratio = qualityRatios.wealth_accounts || 0.05;
                const totalAccounts = productionData.investmentAccounts + productionData.bankingAccounts;
                totalAdjustedAccounts += totalAccounts * ratio;
            }
        } else {
            // For actuals, include all accounts without compensable metric filtering
            totalAdjustedAccounts = productionData.investmentAccounts + productionData.bankingAccounts;
        }
        
        const accountsPerAdvisor = totalAdjustedAccounts / adjustedHeadcount;
        
        // Calculate Assets per Advisor
        let totalAdjustedAssets = 0;
        
        // Only apply compensable metrics adjustments for forecast periods
        if (isForecast) {
            if (compensableMetrics.investment_assets) {
                const ratio = qualityRatios.investment_assets || 1;
                totalAdjustedAssets += productionData.investmentAssets * ratio;
            }
            
            if (compensableMetrics.banking_assets) {
                const ratio = qualityRatios.banking_assets || 1;
                totalAdjustedAssets += productionData.bankingAssets * ratio;
            }
            
            if (compensableMetrics.wealth_assets) {
                const ratio = qualityRatios.wealth_assets || 0.05;
                const totalAssets = productionData.investmentAssets + productionData.bankingAssets;
                totalAdjustedAssets += totalAssets * ratio;
            }
        } else {
            // For actuals, include all assets without compensable metric filtering
            totalAdjustedAssets = productionData.investmentAssets + productionData.bankingAssets;
        }
        
        const assetsPerAdvisor = totalAdjustedAssets / adjustedHeadcount;
        
        // Calculate AR metrics (same for both forecast and actuals)
        const arEnrollRatio = qualityRatios.ar_enroll || 0.05;
        const arBookRatio = qualityRatios.ar_book || 0.05;
        const arRampRatio = qualityRatios.ar_ramp || 0.05;
        
        const arEnroll = productionData.productCBalance * arEnrollRatio;
        const arBook = arEnroll * arBookRatio;
        const arRamp = arBook * arRampRatio;
        
        const arEnrollPerAdvisor = arEnroll / adjustedHeadcount;
        const arBookPerAdvisor = arBook / adjustedHeadcount;
        const arRampPerAdvisor = arRamp / adjustedHeadcount;
        const arTotalPerAdvisor = arEnrollPerAdvisor + arBookPerAdvisor + arRampPerAdvisor;
        
        return {
            accountsPerAdvisor: Math.round(accountsPerAdvisor * 100) / 100,
            assetsPerAdvisor: Math.round(assetsPerAdvisor),
            arEnrollPerAdvisor: Math.round(arEnrollPerAdvisor),
            arBookPerAdvisor: Math.round(arBookPerAdvisor),
            arRampPerAdvisor: Math.round(arRampPerAdvisor),
            arTotalPerAdvisor: Math.round(arTotalPerAdvisor)
        };
    },
    
    // Get compensable metrics for a team from API
    getCompensableMetrics: async function(teamId, versionId) {
    try {
        const response = await fetch(`/api/incentives/compensable-metrics/${teamId}?versionId=${versionId}`);
        const result = await response.json();
        
        if (result.success) {
            return result.data;
        } else {
            console.error('Failed to fetch compensable metrics');
            // Return default configuration as fallback
            return {
                investment_accounts: true,
                investment_assets: true,
                banking_accounts: false,
                banking_assets: false,
                wealth_accounts: false,
                wealth_assets: false
            };
        }
    } catch (error) {
        console.error('Error fetching compensable metrics:', error);
        // Return default configuration as fallback
        return {
            investment_accounts: true,
            investment_assets: true,
            banking_accounts: false,
            banking_assets: false,
            wealth_accounts: false,
            wealth_assets: false
        };
    }
    },
    
    // Get quality ratios for a team from API
    getQualityRatios: async function(teamId, period, versionId = 2) {
        try {
            const response = await fetch(`/api/incentives/quality-ratios/${teamId}/${period}?versionId=${versionId}`);
            const result = await response.json();
            
            if (result.success) {
                return result.data;
            } else {
                console.error('Failed to fetch quality ratios');
                // Return default ratios as fallback
                return {
                    investment_accounts: 1.00,
                    investment_assets: 1.00,
                    banking_accounts: 0.90,
                    banking_assets: 0.80,
                    wealth_accounts: 0.05,
                    wealth_assets: 0.05,
                    productive_headcount: 0.90,
                    ar_enroll: 0.05,
                    ar_book: 0.05,
                    ar_ramp: 0.05
                };
            }
        } catch (error) {
            console.error('Error fetching quality ratios:', error);
            // Return default ratios as fallback
            return {
                investment_accounts: 1.00,
                investment_assets: 1.00,
                banking_accounts: 0.90,
                banking_assets: 0.80,
                wealth_accounts: 0.05,
                wealth_assets: 0.05,
                productive_headcount: 0.90,
                ar_enroll: 0.05,
                ar_book: 0.05,
                ar_ramp: 0.05
            };
        }
    }
};

// Export for use in other files
window.IncentiveCalculator = IncentiveCalculator;