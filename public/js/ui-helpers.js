// public/js/ui-helpers.js - UI helper functions

// Loading indicator
function showLoadingIndicator(message = 'Loading...') {
    let loadingDiv = document.getElementById('loadingIndicator');
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'loadingIndicator';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px 40px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 16px;
            color: #333;
        `;
        document.body.appendChild(loadingDiv);
    }
    loadingDiv.textContent = message;
    loadingDiv.style.display = 'block';
}

function hideLoadingIndicator() {
    const loadingDiv = document.getElementById('loadingIndicator');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

// Error messages
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #dc3545;
        color: white;
        padding: 15px 25px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        font-size: 14px;
        max-width: 400px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => errorDiv.remove(), 5000);
}

// Success indicator
function showSaveIndicator() {
    const indicator = document.getElementById('saveIndicator');
    if (indicator) {
        indicator.style.display = 'block';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 2000);
    }
}

// Format numbers with thousand separators
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Remove formatting from input
function removeFormatting(input) {
    input.value = input.value.replace(/,/g, '');
}

// Add formatting to input
function addFormatting(input) {
    const value = parseFloat(input.value.replace(/,/g, '')) || 0;
    input.value = formatNumber(value);
}

// Update undo/redo button states
function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = AppState.undoStack.length === 0;
    document.getElementById('redoBtn').disabled = AppState.redoStack.length === 0;
}

// Undo functionality
async function undo() {
    if (AppState.undoStack.length === 0) return;
    
    const action = AppState.undoStack.pop();
    AppState.redoStack.push(action);
    
    const wrapper = document.querySelector('.data-table-wrapper');
    const currentScroll = wrapper ? wrapper.scrollLeft : 0;
    
    if (action.type === 'headcountChange') {
        const { team, pg, month, previousValue } = action.data;
        const teamKey = `Team ${team}`;
        AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month] = previousValue;
        
        // Update database
        try {
            const fieldName = `pg${pg.substring(2)}_headcount`;
            await API.forecasts.updateData({
                teamId: parseInt(team),
                periodDate: getPeriodDate(month),
                versionId: AppState.currentVersion.version_id,
                field: fieldName,
                value: previousValue,
                updatedBy: AppState.currentUser
            });
        } catch (error) {
            console.error('Failed to undo change:', error);
        }
        
        renderCurrentTab();
    } else if (action.type === 'percentageChange') {
        // Handle bulk percentage changes
        const updates = [];
        
        for (const state of action.data) {
            const teamKey = `Team ${state.team}`;
            
            if (state.metric === 'productivity') {
                AppState.teamData[AppState.currentForecast][teamKey].productivity[state.month] = parseFloat(state.previousValue);
            } else if (state.metric === 'mix') {
                AppState.teamData[AppState.currentForecast][teamKey].productMix[state.product][state.month] = parseFloat(state.previousValue) / 100;
            } else if (state.metric === 'abpa') {
                AppState.teamData[AppState.currentForecast][teamKey].abpa[state.product][state.month] = parseFloat(state.previousValue);
            }
            
            // Prepare database update
            let fieldName;
            let value = parseFloat(state.previousValue);
            
            if (state.metric === 'productivity') {
                fieldName = 'productivity';
            } else if (state.metric === 'mix') {
                const productLetter = state.product.split(' ')[1].toLowerCase();
                fieldName = `product_${productLetter}_mix`;
                value = value / 100;
            } else if (state.metric === 'abpa') {
                const productLetter = state.product.split(' ')[1].toLowerCase();
                fieldName = `product_${productLetter}_abpa`;
            }
            
            updates.push({
                teamId: parseInt(state.team),
                periodDate: getPeriodDate(state.month),
                field: fieldName,
                newValue: value
            });
        }
        
        // Update database
        try {
            await API.forecasts.bulkUpdate({
                updates: updates,
                versionId: AppState.currentVersion.version_id,
                updatedBy: AppState.currentUser
            });
        } catch (error) {
            console.error('Failed to undo bulk changes:', error);
        }
        
        renderCurrentTab();
    }
    
    // Restore scroll position
    setTimeout(() => {
        const newWrapper = document.querySelector('.data-table-wrapper');
        if (newWrapper) {
            newWrapper.scrollLeft = currentScroll;
        }
    }, 100);
    
    updateUndoRedoButtons();
}

// Redo functionality
async function redo() {
    if (AppState.redoStack.length === 0) return;
    
    const action = AppState.redoStack.pop();
    AppState.undoStack.push(action);
    
    const wrapper = document.querySelector('.data-table-wrapper');
    const currentScroll = wrapper ? wrapper.scrollLeft : 0;
    
    if (action.type === 'headcountChange') {
        const { team, pg, month, newValue } = action.data;
        const teamKey = `Team ${team}`;
        AppState.teamData[AppState.currentForecast][teamKey].pgLevels[pg][month] = newValue;
        
        // Update database
        try {
            const fieldName = `pg${pg.substring(2)}_headcount`;
            await API.forecasts.updateData({
                teamId: parseInt(team),
                periodDate: getPeriodDate(month),
                versionId: AppState.currentVersion.version_id,
                field: fieldName,
                value: newValue,
                updatedBy: AppState.currentUser
            });
        } catch (error) {
            console.error('Failed to redo change:', error);
        }
        
        renderCurrentTab();
    }
    
    // Restore scroll position
    setTimeout(() => {
        const newWrapper = document.querySelector('.data-table-wrapper');
        if (newWrapper) {
            newWrapper.scrollLeft = currentScroll;
        }
    }, 100);
    
    updateUndoRedoButtons();
}

// Scroll to view functions
function scrollToView(view) {
    const wrapper = document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (!wrapper) return;
    
    const table = wrapper.querySelector('table');
    if (!table) return;
    
    const headers = table.querySelectorAll('thead tr:last-child th');
    
    let targetIndex = 0;
    if (view === 'quarterly') {
        // Find first quarter column
        for (let i = 0; i < headers.length; i++) {
            if (headers[i].textContent.includes('Q')) {
                targetIndex = i;
                break;
            }
        }
    } else if (view === 'yearly') {
        // Find first year column
        for (let i = headers.length - 1; i >= 0; i--) {
            const headerText = headers[i].textContent;
            if (headerText === 'FY23' || headerText === 'Total' || headerText === 'Avg') {
                let foundQuarter = false;
                for (let j = i - 1; j >= 0; j--) {
                    if (headers[j].textContent.includes('Q')) {
                        foundQuarter = true;
                        break;
                    }
                }
                if (foundQuarter) {
                    targetIndex = i;
                    break;
                }
            }
        }
    } else {
        // Monthly view - scroll to beginning
        targetIndex = 1;
    }
    
    if (targetIndex > 0) {
        const targetElement = headers[targetIndex];
        const firstColumn = headers[0];
        const firstColumnWidth = firstColumn.offsetWidth;
        const elementLeft = targetElement.offsetLeft - firstColumnWidth - 10;
        const scrollLeft = Math.max(0, elementLeft);
        wrapper.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        
        AppState.scrollPositions[AppState.currentTab] = scrollLeft;
    }
}

// Percentage change modal functions
function openPercentageModal() {
    const modal = document.getElementById('percentageModal');
    const info = document.getElementById('selectionInfo');
    info.textContent = `${AppState.selectedInputs.length} cells selected`;
    modal.style.display = 'block';
    document.getElementById('percentageInput').focus();
}

function closeModal() {
    document.getElementById('percentageModal').style.display = 'none';
    document.getElementById('percentageInput').value = '';
    AppState.selectedInputs.forEach(input => input.classList.remove('selected'));
    AppState.selectedInputs = [];
}

// Apply percentage change
async function applyPercentageChange() {
    const percentage = parseFloat(document.getElementById('percentageInput').value);
    if (isNaN(percentage)) {
        alert('Please enter a valid percentage');
        return;
    }
    
    const updates = [];
    const previousState = AppState.selectedInputs.map(input => {
        const newValue = input.step === '0.1' ? 
            (parseFloat(input.value) * (1 + percentage / 100)).toFixed(1) : 
            Math.round(parseFloat(input.value.replace(/,/g, '')) * (1 + percentage / 100));
        
        let fieldName;
        let dbValue = parseFloat(newValue);
        
        if (input.dataset.metric === 'productivity') {
            fieldName = 'productivity';
        } else if (input.dataset.metric === 'mix') {
            const productLetter = input.dataset.product.split(' ')[1].toLowerCase();
            fieldName = `product_${productLetter}_mix`;
            dbValue = dbValue / 100;
        } else if (input.dataset.metric === 'abpa') {
            const productLetter = input.dataset.product.split(' ')[1].toLowerCase();
            fieldName = `product_${productLetter}_abpa`;
        }
        
        updates.push({
            teamId: parseInt(input.dataset.team),
            periodDate: getPeriodDate(input.dataset.month),
            field: fieldName,
            newValue: dbValue
        });
        
        return {
            team: input.dataset.team,
            month: input.dataset.month,
            metric: input.dataset.metric,
            product: input.dataset.product,
            pg: input.dataset.pg,
            previousValue: input.value,
            newValue: newValue
        };
    });
    
    AppState.undoStack.push({
        type: 'percentageChange',
        data: previousState
    });
    AppState.redoStack = [];
    updateUndoRedoButtons();
    
    // Apply changes locally
    previousState.forEach(state => {
        const input = AppState.selectedInputs.find(i => 
            i.dataset.month === state.month && 
            i.dataset.metric === state.metric &&
            (i.dataset.product === state.product || i.dataset.pg === state.pg)
        );
        if (input) {
            if (input.dataset.metric === 'abpa') {
                input.value = formatNumber(state.newValue);
            } else {
                input.value = state.newValue;
            }
            handleProductionChange(input);
        }
    });
    
    // Update database
    try {
        await API.forecasts.bulkUpdate({
            updates: updates,
            versionId: AppState.currentVersion.version_id,
            updatedBy: AppState.currentUser
        });
        showSaveIndicator();
    } catch (error) {
        console.error('Failed to apply bulk changes:', error);
        showError('Failed to apply changes');
    }
    
    closeModal();
}

// Setup input selection for bulk changes
function setupInputSelection() {
    if (AppState.currentTab !== 'production') return;
    
    const inputs = document.querySelectorAll('.selectable-input');
    let isSelecting = false;
    let startRow = null;
    
    inputs.forEach(input => {
        input.addEventListener('mousedown', (e) => {
            if (e.shiftKey) {
                e.preventDefault();
                isSelecting = true;
                startRow = input.closest('tr');
                AppState.selectedInputs = [input];
                input.classList.add('selected');
            }
        });
        
        input.addEventListener('mouseenter', (e) => {
            if (isSelecting && input.closest('tr') === startRow) {
                if (!AppState.selectedInputs.includes(input)) {
                    AppState.selectedInputs.push(input);
                    input.classList.add('selected');
                }
            }
        });
    });
    
    document.addEventListener('mouseup', () => {
        if (isSelecting && AppState.selectedInputs.length > 1) {
            isSelecting = false;
            openPercentageModal();
        }
    });
}

// Validate product mix
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