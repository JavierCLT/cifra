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


// Scroll to view functions
function scrollToView(view) {
    const wrapper = typeof getActiveWrapper === 'function'
        ? getActiveWrapper()
        : document.querySelector(`#${AppState.currentTab}-tab .data-table-wrapper`);
    if (!wrapper) return;
    
    const table = wrapper.querySelector('table');
    if (!table) return;

    const targetSelectorMap = {
        monthly: 'thead tr:last-child th.actual-col, thead tr:last-child th.forecast-col',
        quarterly: 'thead tr:last-child th.quarter-col',
        yearly: 'thead tr:first-child th.year-total-col'
    };

    const targetElement = table.querySelector(targetSelectorMap[view] || targetSelectorMap.monthly);
    if (!targetElement) return;

    const stickyColumn = table.querySelector('thead tr:first-child th[rowspan]') || table.querySelector('thead th');
    const stickyWidth = stickyColumn ? stickyColumn.offsetWidth : 0;
    const scrollLeft = Math.max(0, targetElement.offsetLeft - stickyWidth - 12);

    wrapper.scrollTo({ left: scrollLeft, behavior: 'smooth' });

    const scrollKey = typeof getScrollKeyForState === 'function'
        ? getScrollKeyForState()
        : AppState.currentTab;
    AppState.scrollPositions[scrollKey] = scrollLeft;
}

function closeModal() {
    document.getElementById('percentageModal').style.display = 'none';
    document.getElementById('percentageInput').value = '';
    AppState.selectedInputs.forEach(input => input.classList.remove('selected'));
    AppState.selectedInputs = [];
}

// (Deprecated helpers removed: applyPercentageChange, legacy setupInputSelection)

// (Removed duplicate validateProductMix and scrollToJan2024; authoritative versions live in render-tables.js and main.js)
