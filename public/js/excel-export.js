// public/js/excel-export.js - Excel export functionality

function exportToExcel() {
    try {
        showLoadingIndicator('Preparing Excel export...');
        
        // Get active tab data
        const activeTab = document.querySelector('.tab-content.active');
        const table = activeTab.querySelector('.data-table');
        
        if (!table) {
            hideLoadingIndicator();
            showError('No data to export');
            return;
        }
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Export current tab
        const ws = XLSX.utils.table_to_sheet(table, {
            raw: false, // Use formatted values
            cellStyles: true
        });
        
        // Apply styles to the worksheet
        applyExcelStyles(ws);
        
        // Add worksheet to workbook
        const sheetName = AppState.currentTab === 'headcount' ? 'Headcount' : 'Production';
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        // Add metadata sheet
        const metadataWs = createMetadataSheet();
        XLSX.utils.book_append_sheet(wb, metadataWs, 'Metadata');
        
        // Generate filename
        const teamOrGroup = AppState.isGroupView ? 
            `Group_${AppState.currentGroup}` : 
            `Team_${AppState.currentTeam}`;
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `${AppState.currentForecast}_${teamOrGroup}_${sheetName}_${timestamp}.xlsx`;
        
        // Write file
        XLSX.writeFile(wb, filename);
        
        hideLoadingIndicator();
        
        
        // Log export event
        console.log('Excel exported:', {
            filename: filename,
            tab: sheetName,
            team: teamOrGroup,
            forecast: AppState.currentForecast,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        hideLoadingIndicator();
        console.error('Export failed:', error);
        showError('Failed to export Excel file');
    }
}

// Apply Excel styles
function applyExcelStyles(ws) {
    // Get range of cells
    const range = XLSX.utils.decode_range(ws['!ref']);
    
    // Style configuration
    const styles = {
        header: {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "003D6A" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: {
                top: { style: "thin", color: { rgb: "000000" } },
                bottom: { style: "thin", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } }
            }
        },
        actual: {
            fill: { fgColor: { rgb: "F8F8F8" } },
            border: {
                top: { style: "thin", color: { rgb: "CCCCCC" } },
                bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                left: { style: "thin", color: { rgb: "CCCCCC" } },
                right: { style: "thin", color: { rgb: "CCCCCC" } }
            }
        },
        forecast: {
            fill: { fgColor: { rgb: "E6F2FA" } },
            border: {
                top: { style: "thin", color: { rgb: "CCCCCC" } },
                bottom: { style: "thin", color: { rgb: "CCCCCC" } },
                left: { style: "thin", color: { rgb: "CCCCCC" } },
                right: { style: "thin", color: { rgb: "CCCCCC" } }
            }
        },
        total: {
            font: { bold: true },
            fill: { fgColor: { rgb: "E6F2FA" } },
            border: {
                top: { style: "medium", color: { rgb: "000000" } },
                bottom: { style: "medium", color: { rgb: "000000" } }
            }
        },
        quarter: {
            font: { bold: true },
            fill: { fgColor: { rgb: "F0F8FF" } },
            border: {
                left: { style: "medium", color: { rgb: "0060A9" } }
            }
        },
        year: {
            font: { bold: true },
            fill: { fgColor: { rgb: "FFF8DC" } },
            border: {
                left: { style: "medium", color: { rgb: "003D6A" } }
            }
        }
    };
    
    // Apply header styles
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const headerCell1 = XLSX.utils.encode_cell({ r: 0, c: C });
        const headerCell2 = XLSX.utils.encode_cell({ r: 1, c: C });
        
        if (ws[headerCell1]) {
            if (!ws[headerCell1].s) ws[headerCell1].s = {};
            Object.assign(ws[headerCell1].s, styles.header);
        }
        if (ws[headerCell2]) {
            if (!ws[headerCell2].s) ws[headerCell2].s = {};
            Object.assign(ws[headerCell2].s, styles.header);
        }
    }
    
    // Apply column widths
    const colWidths = [];
    colWidths[0] = { wch: 25 }; // First column wider for labels
    
    for (let i = 1; i <= range.e.c; i++) {
        colWidths[i] = { wch: 12 }; // Standard width for data columns
    }
    
    ws['!cols'] = colWidths;
    
    // Freeze panes (first column and first two rows)
    ws['!freeze'] = { xSplit: 1, ySplit: 2 };
    
    return ws;
}

// Create metadata sheet
function createMetadataSheet() {
    const metadata = [
        ['Export Information'],
        [''],
        ['Export Date:', new Date().toLocaleString()],
        ['Exported By:', AppState.currentUser],
        [''],
        ['Data Selection'],
        ['Team/Group:', AppState.isGroupView ? `Group ${AppState.currentGroup}` : `Team ${AppState.currentTeam}`],
        ['Forecast Version:', AppState.currentForecast],
        ['Tab:', AppState.currentTab === 'headcount' ? 'Headcount' : 'Production'],
        [''],
        ['Legend'],
        ['PG Levels:', 'PG1 through PG7 represent different Production Groups'],
        ['Productivity:', 'Measured in accounts per advisor per week'],
        ['Product Mix:', 'Percentage distribution across products (must sum to 100%)'],
        ['ABPA:', 'Average Balance Per Account in dollars'],
        ['Total Balances:', 'Shown in millions of dollars']
    ];
    
    // Convert metadata to worksheet
    const ws = XLSX.utils.aoa_to_sheet(metadata);
    
    // Apply styles to metadata sheet
    const range = XLSX.utils.decode_range(ws['!ref']);
    
    // Style headers
    const headerRows = [0, 5, 10, 14, 20];
    headerRows.forEach(row => {
        const cell = XLSX.utils.encode_cell({ r: row, c: 0 });
        if (ws[cell]) {
            ws[cell].s = {
                font: { bold: true, sz: 14 },
                fill: { fgColor: { rgb: "003D6A" } },
                font: { color: { rgb: "FFFFFF" } }
            };
        }
    });
    
    // Set column widths
    ws['!cols'] = [
        { wch: 30 }, // Labels
        { wch: 50 }  // Values
    ];
    
    return ws;
}

// Export audit log
async function exportAuditLog() {
    try {
        showLoadingIndicator('Preparing audit log export...');
        
        // Fetch audit log data
        const auditData = await API.forecasts.getAuditLog(
            AppState.currentTeam,
            AppState.currentVersion.version_id
        );
        
        if (!auditData || auditData.length === 0) {
            hideLoadingIndicator();
            showError('No audit log data to export');
            return;
        }
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Transform audit data for Excel
        const excelData = auditData.map(entry => ({
            'Date/Time': new Date(entry.changed_at).toLocaleString(),
            'User': entry.changed_by,
            'Team': `Team ${AppState.currentTeam}`,
            'Period': entry.period_string,
            'Field': formatFieldName(entry.field_name),
            'Old Value': entry.old_value,
            'New Value': entry.new_value,
            'Change': calculateChange(entry.old_value, entry.new_value)
        }));
        
        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(excelData);
        
        // Apply styles
        applyAuditLogStyles(ws);
        
        // Add to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
        
        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `AuditLog_Team${AppState.currentTeam}_${AppState.currentForecast}_${timestamp}.xlsx`;
        
        // Write file
        XLSX.writeFile(wb, filename);
        
        hideLoadingIndicator();
        
        
    } catch (error) {
        hideLoadingIndicator();
        console.error('Audit log export failed:', error);
        showError('Failed to export audit log');
    }
}

// Format field names for display
function formatFieldName(fieldName) {
    const fieldMap = {
        'pg1_headcount': 'PG1 Headcount',
        'pg2_headcount': 'PG2 Headcount',
        'pg3_headcount': 'PG3 Headcount',
        'pg4_headcount': 'PG4 Headcount',
        'pg5_headcount': 'PG5 Headcount',
        'pg6_headcount': 'PG6 Headcount',
        'pg7_headcount': 'PG7 Headcount',
        'productivity': 'Productivity',
        'product_a_mix': 'Product A Mix',
        'product_b_mix': 'Product B Mix',
        'product_c_mix': 'Product C Mix',
        'product_d_mix': 'Product D Mix',
        'product_a_abpa': 'Product A ABPA',
        'product_b_abpa': 'Product B ABPA',
        'product_c_abpa': 'Product C ABPA',
        'product_d_abpa': 'Product D ABPA'
    };
    
    return fieldMap[fieldName] || fieldName;
}

// Calculate change between old and new values
function calculateChange(oldValue, newValue) {
    const old = parseFloat(oldValue) || 0;
    const newVal = parseFloat(newValue) || 0;
    const change = newVal - old;
    const percentChange = old !== 0 ? ((change / old) * 100).toFixed(1) : 'N/A';
    
    if (change > 0) {
        return `+${change.toFixed(2)} (${percentChange}%)`;
    } else if (change < 0) {
        return `${change.toFixed(2)} (${percentChange}%)`;
    } else {
        return 'No change';
    }
}

// Apply styles to audit log
function applyAuditLogStyles(ws) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    
    // Header style
    for (let C = range.s.c; C <= range.e.c; ++C) {
        const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
        if (ws[headerCell]) {
            ws[headerCell].s = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "E31837" } },
                alignment: { horizontal: "center" }
            };
        }
    }
    
    // Set column widths
    ws['!cols'] = [
        { wch: 20 }, // Date/Time
        { wch: 25 }, // User
        { wch: 10 }, // Team
        { wch: 10 }, // Period
        { wch: 20 }, // Field
        { wch: 15 }, // Old Value
        { wch: 15 }, // New Value
        { wch: 20 }  // Change
    ];
    
    // Freeze header row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    
    return ws;
}

// Export all teams summary
async function exportAllTeamsSummary() {
    try {
        showLoadingIndicator('Preparing summary export...');
        
        const wb = XLSX.utils.book_new();
        const summaryData = [];
        
        // Collect data for all teams
        for (let teamId = 1; teamId <= 22; teamId++) {
            const teamData = await API.teamData.get(
                teamId,
                AppState.currentVersion.version_id
            );
            
            if (teamData && teamData.length > 0) {
                // Calculate summary metrics
                const latestPeriod = teamData[teamData.length - 1];
                const totalHeadcount = PG_LEVELS.reduce((sum, pg) => {
                    const pgField = `pg${pg.substring(2)}_headcount`;
                    return sum + (latestPeriod[pgField.toLowerCase()] || 0);
                }, 0);
                
                summaryData.push({
                    'Team': `Team ${teamId}`,
                    'Group': teamId <= 4 ? 'ABC' : teamId <= 10 ? 'DEF' : teamId <= 18 ? 'GHI' : 'JKL',
                    'Latest Period': latestPeriod.period_string,
                    'Total Headcount': totalHeadcount,
                    'Productivity': latestPeriod.productivity,
                    'Product A Mix': Math.round(latestPeriod.product_a_mix * 100) + '%',
                    'Product B Mix': Math.round(latestPeriod.product_b_mix * 100) + '%',
                    'Product C Mix': Math.round(latestPeriod.product_c_mix * 100) + '%',
                    'Product D Mix': Math.round(latestPeriod.product_d_mix * 100) + '%'
                });
            }
        }
        
        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(summaryData);
        
        // Apply styles
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
            if (ws[headerCell]) {
                ws[headerCell].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "0060A9" } },
                    alignment: { horizontal: "center" }
                };
            }
        }
        
        // Add to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'All Teams Summary');
        
        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `AllTeamsSummary_${AppState.currentForecast}_${timestamp}.xlsx`;
        
        // Write file
        XLSX.writeFile(wb, filename);
        
        hideLoadingIndicator();
        
        
    } catch (error) {
        hideLoadingIndicator();
        console.error('Summary export failed:', error);
        showError('Failed to export summary');
    }
}