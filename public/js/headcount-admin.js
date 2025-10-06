
(function () {
    if (typeof window === 'undefined') {
        return;
    }

    const STORAGE_PREFIX = 'hcAdmin.v1';
    const DEFAULT_PG_LEVELS = ['PG1', 'PG2', 'PG3', 'PG4', 'PG5', 'PG6', 'PG7'];

    const cache = new Map();
    let openContext = null;
    let hooksInstalled = false;

    function getPgLevels() {
        if (Array.isArray(window.PG_LEVELS) && window.PG_LEVELS.length) {
            return window.PG_LEVELS;
        }
        return DEFAULT_PG_LEVELS;
    }

    function makeKey(versionId, versionKey, teamId) {
        const versionPart = Number.isFinite(versionId) ? `id:${versionId}` : `name:${versionKey || 'default'}`;
        return `${versionPart}|team:${teamId}`;
    }

    function storageKey(versionId, versionKey, teamId) {
        const versionPart = Number.isFinite(versionId) ? `id:${versionId}` : `name:${versionKey || 'default'}`;
        return `${STORAGE_PREFIX}:${versionPart}:team:${teamId}`;
    }

    function loadState(versionId, versionKey, teamId) {
        const key = makeKey(versionId, versionKey, teamId);
        const existing = cache.get(key);
        if (existing) {
            return existing;
        }
        try {
            const raw = window.localStorage?.getItem(storageKey(versionId, versionKey, teamId));
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            cache.set(key, parsed);
            return parsed;
        } catch (err) {
            console.warn('HeadcountAdmin: failed to read stored state', err);
            return null;
        }
    }

    function saveState(versionId, versionKey, teamId, state) {
        const key = makeKey(versionId, versionKey, teamId);
        cache.set(key, state);
        try {
            window.localStorage?.setItem(storageKey(versionId, versionKey, teamId), JSON.stringify(state));
        } catch (err) {
            console.warn('HeadcountAdmin: failed to persist state', err);
        }
    }

    function sanitizeOverrides(raw) {
        const overrides = {};
        if (!raw || typeof raw !== 'object') {
            return overrides;
        }
        const PG_LEVELS = getPgLevels();
        Object.entries(raw).forEach(([month, pgMap]) => {
            if (!pgMap || typeof pgMap !== 'object') {
                return;
            }
            const cleaned = {};
            Object.entries(pgMap).forEach(([pg, value]) => {
                if (!PG_LEVELS.includes(pg)) return;
                const numeric = Number(value);
                if (Number.isFinite(numeric)) {
                    cleaned[pg] = Math.round(numeric);
                }
            });
            if (Object.keys(cleaned).length) {
                overrides[month] = cleaned;
            }
        });
        return overrides;
    }

    function computeDefaults(teamData, months) {
        const PG_LEVELS = getPgLevels();
        const defaults = {
            productiveRatio: 100,
            pgSplits: {}
        };
        const fallbackShare = PG_LEVELS.length ? 100 / PG_LEVELS.length : 100;
        PG_LEVELS.forEach(pg => {
            defaults.pgSplits[pg] = Number(fallbackShare.toFixed(2));
        });

        if (!teamData) {
            return defaults;
        }

        const forecastStatus = teamData.forecastStatus || {};
        const endingMap = teamData.headcountFlows?.ending_headcount || {};
        const pgLevels = teamData.pgLevels || {};
        const monthList = Array.isArray(months) && months.length ? months : (typeof window.generateMonthList === 'function' ? window.generateMonthList() : []);
        const forecastMonths = monthList.filter(month => forecastStatus[month] === 'Forecast');
        const baseMonth = forecastMonths.find(month => Number.isFinite(Number(endingMap[month]))) || monthList.find(month => Number.isFinite(Number(endingMap[month])));
        if (!baseMonth) {
            return defaults;
        }

        const ending = Number(endingMap[baseMonth] ?? 0);
        const totals = PG_LEVELS.map(pg => Number(pgLevels?.[pg]?.[baseMonth] ?? 0));
        const totalProd = totals.reduce((sum, val) => sum + val, 0);

        if (ending > 0 && totalProd > 0) {
            const ratio = Math.round((totalProd / ending) * 100);
            if (Number.isFinite(ratio)) {
                defaults.productiveRatio = Math.min(100, Math.max(1, ratio));
            }
        }

        if (totalProd > 0) {
            let runningSum = 0;
            PG_LEVELS.forEach(pg => {
                const share = (Number(pgLevels?.[pg]?.[baseMonth] ?? 0) / totalProd) * 100;
                const rounded = Number(share.toFixed(2));
                defaults.pgSplits[pg] = rounded;
                runningSum += rounded;
            });
            const diff = Number((100 - runningSum).toFixed(2));
            if (Math.abs(diff) >= 0.01) {
                const anchor = PG_LEVELS[0];
                defaults.pgSplits[anchor] = Number((defaults.pgSplits[anchor] + diff).toFixed(2));
            }
        }
        return defaults;
    }

    function ensureState({ versionId, versionKey, teamId, teamData, months }) {
        const cached = loadState(versionId, versionKey, teamId);
        if (cached) {
            return cached;
        }
        const defaults = computeDefaults(teamData, months);
        const state = {
            productiveRatio: defaults.productiveRatio,
            pgSplits: { ...defaults.pgSplits },
            manualOverrides: {}
        };
        saveState(versionId, versionKey, teamId, state);
        return state;
    }

    function getTeamStore(teamId) {
        const versionKey = window.AppState?.currentForecast;
        if (!versionKey) return null;
        return window.AppState?.teamData?.[versionKey]?.[`Team ${teamId}`] || null;
    }

    function getMonthsList() {
        if (typeof window.generateMonthList === 'function') {
            return window.generateMonthList();
        }
        return [];
    }
    function refreshOverrideIndicators({ versionId, versionKey, teamId }) {
        const state = loadState(versionId, versionKey, teamId);
        const container = document.getElementById('sales-headcount-subtab');
        if (container) {
            container.querySelectorAll('.manual-override').forEach(el => el.classList.remove('manual-override'));
        }
        if (!state || !container) {
            if (openContext && openContext.versionId === versionId && openContext.versionKey === versionKey && openContext.teamId === teamId) {
                updatePanelSummary(openContext, state);
            }
            return;
        }
        Object.entries(state.manualOverrides || {}).forEach(([month, pgMap]) => {
            Object.keys(pgMap).forEach(pg => {
                const selector = `input[data-month="${month}"][data-pg="${pg}"][data-team="${teamId}"]`;
                const input = container.querySelector(selector);
                if (input) {
                    input.classList.add('manual-override');
                }
            });
        });
        if (openContext && openContext.versionId === versionId && openContext.versionKey === versionKey && openContext.teamId === teamId) {
            updatePanelSummary(openContext, state);
        }
    }

function updatePanelSummary(context, state) {
        if (!context || !state) {
            return;
        }
        if (context.overrideSummary) {
            const months = Object.keys(state.manualOverrides || {});
            if (!months.length) {
                context.overrideSummary.textContent = 'No manual overrides';
                context.overrideSummary.classList.remove('warning');
            } else {
                context.overrideSummary.textContent = months.length + ' month' + (months.length === 1 ? '' : 's') + ' with manual overrides';
                context.overrideSummary.classList.add('warning');
            }
        }
        const overrides = state.manualOverrides || {};
        const monthsWithOverrides = Object.keys(overrides);
        if (context.resetSelect) {
            const previous = context.resetSelect.value;
            context.resetSelect.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = monthsWithOverrides.length ? 'Reset overrides for...' : 'No overrides to reset';
            context.resetSelect.appendChild(placeholder);
            if (monthsWithOverrides.length) {
                const ordered = (context.months || []).filter(month => overrides[month]);
                ordered.forEach(month => {
                    const option = document.createElement('option');
                    option.value = month;
                    const pgCount = Object.keys(overrides[month] || {}).length;
                    option.textContent = month + ' (' + pgCount + ' PG' + (pgCount === 1 ? '' : 's') + ')';
                    context.resetSelect.appendChild(option);
                });
                context.resetSelect.disabled = !context.canEdit;
            } else {
                context.resetSelect.disabled = true;
            }
            if (previous && overrides[previous]) {
                context.resetSelect.value = previous;
            }
        }
        const allowResets = Boolean(context.canEdit && monthsWithOverrides.length);
        if (context.resetMonthBtn) {
            context.resetMonthBtn.disabled = !allowResets;
        }
        if (context.resetAllBtn) {
            context.resetAllBtn.disabled = !allowResets;
        }
    }
function renderPanel(container, { versionId, versionKey, teamId, teamData, months, state, canEdit }) {
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'hc-admin-wrapper';
        if (!canEdit) {
            wrapper.classList.add('read-only');
        }
        const PG_LEVELS = getPgLevels();
        let ratioValue = Number(state.productiveRatio);
        if (!Number.isFinite(ratioValue)) {
            ratioValue = 100;
        }
        ratioValue = Math.min(100, Math.max(1, Math.round(ratioValue)));
        state.productiveRatio = ratioValue;

        const header = document.createElement('header');
        header.className = 'hc-admin-header';
        header.innerHTML = '<div class="hc-admin-header-text"><h1>Sales Headcount Admin Panel</h1></div><div class="hc-admin-status" role="status" aria-live="polite"></div>';
        wrapper.appendChild(header);

        const statusEl = header.querySelector('.hc-admin-status');

        const content = document.createElement('div');
        content.className = 'hc-admin-container';

        const layout = document.createElement('div');
        layout.className = 'hc-admin-layout';

        const mainColumn = document.createElement('div');
        mainColumn.className = 'hc-admin-column hc-admin-column--main';

        const sideColumn = document.createElement('div');
        sideColumn.className = 'hc-admin-column hc-admin-column--side';

        const ratioCard = document.createElement('section');
        ratioCard.className = 'hc-admin-card hc-admin-card--ratio';
        ratioCard.innerHTML = '' +
            '<div class="hc-card-header"><h2>Productive-to-Ending Ratio</h2></div>' +
            '<p class="hc-card-description">Set the productive-to-ending headcount ratio. The entire forecast will be updated. You can overwrite individual months manually</p>' +
            '<div class="hc-field-group">' +
                '<label class="hc-field-label" for="hc-productive-ratio">Productive headcount %</label>' +
                '<div class="hc-input-wrap">' +
                    '<input type="number" id="hc-productive-ratio" min="1" max="100" step="1" value="' + ratioValue + '"' + (canEdit ? '' : ' disabled') + '>' +
                    '<span class="hc-field-suffix">%</span>' +
                '</div>' +
                '<div class="hc-hint">Updates apply to forecast months only.</div>' +
            '</div>';

        const splitsCard = document.createElement('section');
        splitsCard.className = 'hc-admin-card hc-admin-card--splits';
        splitsCard.innerHTML = '' +
            '<div class="hc-card-header">' +
                '<h2>PG Split</h2>' +
                '<button type="button" class="hc-reset-btn" id="hc-reset-splits-btn"' + (canEdit ? '' : ' disabled') + '>Reset Split</button>' +
            '</div>' +
            '<p class="hc-card-description">Distribute productive headcount across PG levels. Totals must equal 100% before changes are saved.</p>';

        const splitGrid = document.createElement('div');
        splitGrid.className = 'hc-split-grid';

        const splitInputs = [];
        const formatSplitValue = function (value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) {
                return '0';
            }
            if (Math.abs(numeric - Math.round(numeric)) < 0.05) {
                return String(Math.round(numeric));
            }
            return numeric.toFixed(1);
        };

        PG_LEVELS.forEach(pg => {
            if (!Number.isFinite(Number(state.pgSplits && state.pgSplits[pg]))) {
                if (!state.pgSplits) {
                    state.pgSplits = {};
                }
                state.pgSplits[pg] = 0;
            }
            const row = document.createElement('div');
            row.className = 'hc-split-row';
            const displayValue = formatSplitValue(state.pgSplits[pg]);
            row.innerHTML = '<span class="hc-split-label">' + pg + '</span>' +
                '<div class="hc-input-wrap">' +
                    '<input type="number" min="0" step="0.1" data-pg="' + pg + '" value="' + displayValue + '"' + (canEdit ? '' : ' disabled') + '>' +
                    '<span class="hc-field-suffix">%</span>' +
                '</div>';
            const input = row.querySelector('input');
            splitInputs.push(input);
            splitGrid.appendChild(row);
        });

        splitsCard.appendChild(splitGrid);

        const totalRow = document.createElement('div');
        totalRow.className = 'hc-split-total-row';
        totalRow.innerHTML = '<span>Total</span><span class="hc-split-total-value">100%</span>';
        const totalLabel = totalRow.querySelector('.hc-split-total-value');
        splitsCard.appendChild(totalRow);

        mainColumn.appendChild(ratioCard);
        mainColumn.appendChild(splitsCard);

        const overridesCard = document.createElement('section');
        overridesCard.className = 'hc-admin-card hc-admin-card--overrides';
        overridesCard.innerHTML = '' +
            '<div class="hc-card-header"><h2>Manual Overrides</h2></div>' +
            '<p class="hc-card-description">Values edited directly in the table stay locked until you reset them here.</p>';

        const overrideSummary = document.createElement('div');
        overrideSummary.id = 'hc-override-summary';
        overrideSummary.className = 'hc-override-summary';
        overridesCard.appendChild(overrideSummary);

        const overrideActions = document.createElement('div');
        overrideActions.className = 'hc-override-actions';
        overrideActions.innerHTML = '<select id="hc-reset-month-select" aria-label="Reset overrides for month"' + (canEdit ? '' : ' disabled') + '></select>' +
            '<button type="button" id="hc-reset-month-btn" class="hc-secondary-btn"' + (canEdit ? '' : ' disabled') + '>Reset Month</button>';
        overridesCard.appendChild(overrideActions);

        const resetAllBtn = document.createElement('button');
        resetAllBtn.type = 'button';
        resetAllBtn.id = 'hc-reset-all-btn';
        resetAllBtn.className = 'hc-secondary-btn hc-secondary-btn--full';
        if (!canEdit) {
            resetAllBtn.disabled = true;
        }
        resetAllBtn.textContent = 'Reset All Overrides';
        overridesCard.appendChild(resetAllBtn);

        const overridesNote = document.createElement('p');
        overridesNote.className = 'hc-card-hint';
        overridesNote.textContent = 'Resetting redistributes forecast months using the current ratio and PG split.';
        overridesCard.appendChild(overridesNote);

        sideColumn.appendChild(overridesCard);

        layout.appendChild(mainColumn);
        layout.appendChild(sideColumn);
        content.appendChild(layout);
        wrapper.appendChild(content);

        const feedback = document.createElement('div');
        feedback.className = 'hc-admin-feedback';
        wrapper.appendChild(feedback);

        container.appendChild(wrapper);

        const ratioInput = ratioCard.querySelector('#hc-productive-ratio');
        const resetSplitsBtn = splitsCard.querySelector('#hc-reset-splits-btn');
        const resetSelect = overrideActions.querySelector('#hc-reset-month-select');
        const resetMonthBtn = overrideActions.querySelector('#hc-reset-month-btn');
        const feedbackEl = feedback;

        const context = {
            container,
            versionId,
            versionKey,
            teamId,
            teamData,
            months,
            state,
            ratioInput,
            splitInputs,
            totalLabel,
            resetSplitsBtn,
            resetSelect,
            resetMonthBtn,
            resetAllBtn,
            overrideSummary,
            statusEl,
            feedbackEl,
            canEdit
        };

        let statusTimer = null;
        function setStatus(message, variant, duration) {
            if (!statusEl) {
                return;
            }
            statusEl.textContent = message || '';
            statusEl.className = 'hc-admin-status';
            if (!message) {
                if (statusTimer) {
                    clearTimeout(statusTimer);
                    statusTimer = null;
                }
                return;
            }
            statusEl.classList.add('is-visible');
            if (variant === 'success') {
                statusEl.classList.add('is-success');
            } else if (variant === 'error') {
                statusEl.classList.add('is-error');
            } else {
                statusEl.classList.add('is-info');
            }
            if (statusTimer) {
                clearTimeout(statusTimer);
                statusTimer = null;
            }
            if (duration) {
                statusTimer = setTimeout(() => {
                    statusEl.textContent = '';
                    statusEl.className = 'hc-admin-status';
                }, duration);
            }
        }

        function setFeedback(message, variant) {
            if (!feedbackEl) {
                return;
            }
            feedbackEl.textContent = message || '';
            feedbackEl.className = 'hc-admin-feedback';
            if (!message) {
                return;
            }
            if (variant === 'success') {
                feedbackEl.classList.add('is-success');
            } else if (variant === 'error') {
                feedbackEl.classList.add('is-error');
            } else if (variant === 'warning') {
                feedbackEl.classList.add('is-warning');
            }
        }

        function updateValidation() {
            const total = splitInputs.reduce((sum, input) => sum + (Number(input.value) || 0), 0);
            if (totalLabel) {
                totalLabel.textContent = total.toFixed(1) + '%';
                totalLabel.classList.toggle('invalid', Math.abs(total - 100) > 0.5);
            }
            const ratioVal = Number(ratioInput ? ratioInput.value : ratioValue);
            const ratioValid = Number.isFinite(ratioVal) && ratioVal >= 1 && ratioVal <= 100;
            if (ratioInput) {
                ratioInput.classList.toggle('invalid', !ratioValid);
            }
            const splitsValid = Math.abs(total - 100) <= 0.5;
            return { total, ratioValid, splitsValid, isValid: ratioValid && splitsValid };
        }

        let applyTimer = null;
        let queuedLimit = null;
        let isApplying = false;
        let rerunArgs = null;

        function clearPendingApply() {
            if (applyTimer) {
                clearTimeout(applyTimer);
                applyTimer = null;
            }
            queuedLimit = null;
        }

        async function executeApply(limitMonths) {
            if (!canEdit) {
                return { updatedCells: 0, monthsAffected: 0, warnings: [] };
            }
            clearPendingApply();
            if (isApplying) {
                rerunArgs = { limitMonths };
                return { updatedCells: 0, monthsAffected: 0, warnings: [] };
            }
            const validation = updateValidation();
            if (!validation.isValid) {
                return { updatedCells: 0, monthsAffected: 0, warnings: [] };
            }
            isApplying = true;
            setStatus('Saving...', 'info');
            try {
                const result = await applyModel({
                    versionId,
                    versionKey,
                    teamId,
                    state,
                    teamData,
                    months,
                    limitMonths
                });
                setStatus('Changes saved!', 'success', 2200);
                return result;
            } catch (err) {
                setStatus(err && err.message ? err.message : 'Save failed', 'error', 5000);
                throw err;
            } finally {
                isApplying = false;
                if (rerunArgs) {
                    const next = rerunArgs;
                    rerunArgs = null;
                    executeApply(next.limitMonths);
                }
            }
        }

        function queueApply(options) {
            if (!canEdit) {
                return;
            }
            const settings = options || {};
            const delay = typeof settings.delay === 'number' ? settings.delay : 650;
            const limitMonths = settings.limitMonths || null;
            const validation = updateValidation();
            if (!validation.isValid) {
                clearPendingApply();
                return;
            }
            queuedLimit = limitMonths;
            if (applyTimer) {
                clearTimeout(applyTimer);
            }
            applyTimer = setTimeout(() => {
                executeApply(queuedLimit);
                queuedLimit = null;
            }, delay);
            setStatus('Saving...', 'info');
        }

        function runApplyNow(options) {
            const settings = options || {};
            clearPendingApply();
            return executeApply(settings.limitMonths || null);
        }

        context.setStatus = setStatus;
        context.setFeedback = setFeedback;
        context.queueApply = queueApply;
        context.runApplyNow = runApplyNow;

        if (ratioInput) {
            ratioInput.addEventListener('input', () => {
                if (!canEdit) {
                    return;
                }
                if (ratioInput.value === '') {
                    ratioInput.classList.add('invalid');
                    setFeedback('Enter a ratio between 1% and 100% to save changes.', 'warning');
                    clearPendingApply();
                    setStatus('', 'info');
                    return;
                }
                const numeric = Number(ratioInput.value);
                state.productiveRatio = numeric;
                saveState(versionId, versionKey, teamId, state);
                const validation = updateValidation();
                if (!validation.ratioValid) {
                    setFeedback('Productive percentage must be between 1% and 100%.', 'warning');
                    clearPendingApply();
                    setStatus('', 'info');
                    return;
                }
                if (!validation.splitsValid) {
                    setFeedback('PG split total must equal 100% before changes can save.', 'warning');
                    clearPendingApply();
                    setStatus('', 'info');
                    return;
                }
                setFeedback('');
                queueApply();
            });

            ratioInput.addEventListener('blur', () => {
                if (!canEdit) {
                    return;
                }
                let numeric = Number(ratioInput.value);
                if (!Number.isFinite(numeric)) {
                    numeric = state.productiveRatio || 100;
                }
                numeric = Math.min(100, Math.max(1, Math.round(numeric)));
                ratioInput.value = String(numeric);
                state.productiveRatio = numeric;
                saveState(versionId, versionKey, teamId, state);
                updateValidation();
            });
        }

        splitInputs.forEach(input => {
            input.addEventListener('input', () => {
                if (!canEdit) {
                    return;
                }
                const pg = input.dataset.pg;
                const numeric = Number(input.value);
                state.pgSplits[pg] = Number.isFinite(numeric) ? numeric : 0;
                saveState(versionId, versionKey, teamId, state);
                const validation = updateValidation();
                if (!validation.splitsValid) {
                    setFeedback('PG split total must equal 100% before changes can save.', 'warning');
                    clearPendingApply();
                    setStatus('', 'info');
                    return;
                }
                if (!validation.ratioValid) {
                    setFeedback('Productive percentage must be between 1% and 100%.', 'warning');
                    clearPendingApply();
                    setStatus('', 'info');
                    return;
                }
                setFeedback('');
                queueApply();
            });

            input.addEventListener('blur', () => {
                if (!canEdit) {
                    return;
                }
                const pg = input.dataset.pg;
                let numeric = Number(input.value);
                if (!Number.isFinite(numeric)) {
                    numeric = state.pgSplits[pg] || 0;
                }
                numeric = Math.max(0, Math.round(numeric * 10) / 10);
                state.pgSplits[pg] = numeric;
                if (Math.abs(numeric - Math.round(numeric)) < 0.05) {
                    input.value = String(Math.round(numeric));
                } else {
                    input.value = numeric.toFixed(1);
                }
                saveState(versionId, versionKey, teamId, state);
                updateValidation();
            });
        });

        if (resetSplitsBtn) {
            resetSplitsBtn.addEventListener('click', async () => {
                if (!canEdit) {
                    return;
                }
                const defaults = computeDefaults(teamData, months);
                if (ratioInput) {
                    ratioInput.value = String(defaults.productiveRatio);
                }
                state.productiveRatio = defaults.productiveRatio;
                if (!state.pgSplits) {
                    state.pgSplits = {};
                }
                PG_LEVELS.forEach(pg => {
                    const nextValue = Number(defaults.pgSplits && defaults.pgSplits[pg]);
                    state.pgSplits[pg] = Number.isFinite(nextValue) ? nextValue : 0;
                });
                splitInputs.forEach(field => {
                    const pg = field.dataset.pg;
                    const value = Number(state.pgSplits[pg]);
                    if (Math.abs(value - Math.round(value)) < 0.05) {
                        field.value = String(Math.round(value));
                    } else {
                        field.value = value.toFixed(1);
                    }
                });
                saveState(versionId, versionKey, teamId, state);
                updateValidation();
                setFeedback('Splits reset using the latest actual distribution.', 'info');
                try {
                    const result = await runApplyNow();
                    if (result.updatedCells) {
                        setFeedback('Splits reset and applied across forecast months.', 'success');
                    } else {
                        setFeedback('Splits reset. No forecast rows required updates.', 'info');
                    }
                } catch (err) {
                    console.error('Headcount admin reset split failed', err);
                    setFeedback(err && err.message ? err.message : 'Failed to reset splits.', 'error');
                }
            });
        }

        if (resetMonthBtn) {
            resetMonthBtn.addEventListener('click', async () => {
                if (!canEdit) {
                    return;
                }
                const month = resetSelect ? resetSelect.value : '';
                if (!month) {
                    setFeedback('Select a month to reset overrides.', 'warning');
                    return;
                }
                const overrides = state.manualOverrides || {};
                if (!overrides[month]) {
                    setFeedback(month + ': no overrides to reset.', 'info');
                    return;
                }
                delete overrides[month];
                if (!Object.keys(overrides).length) {
                    state.manualOverrides = {};
                }
                saveState(versionId, versionKey, teamId, state);
                updatePanelSummary(context, state);
                setFeedback('Resetting overrides for ' + month + '...', 'info');
                try {
                    const result = await runApplyNow({ limitMonths: [month] });
                    const updated = result.updatedCells || 0;
                    setFeedback('Reset ' + month + '. Updated ' + updated + ' cell' + (updated === 1 ? '' : 's') + '.', 'success');
                } catch (err) {
                    console.error('Headcount admin month reset failed', err);
                    setFeedback(err && err.message ? err.message : 'Failed to reset overrides for ' + month + '.', 'error');
                } finally {
                    refreshOverrideIndicators({ versionId, versionKey, teamId });
                }
            });
        }

        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', async () => {
                if (!canEdit) {
                    return;
                }
                const overrides = state.manualOverrides || {};
                const monthsWithOverrides = Object.keys(overrides);
                if (!monthsWithOverrides.length) {
                    setFeedback('No manual overrides to reset.', 'info');
                    return;
                }
                state.manualOverrides = {};
                saveState(versionId, versionKey, teamId, state);
                updatePanelSummary(context, state);
                setFeedback('Resetting manual overrides...', 'info');
                try {
                    const result = await runApplyNow({ limitMonths: monthsWithOverrides });
                    const updated = result.updatedCells || 0;
                    setFeedback('Cleared overrides for ' + monthsWithOverrides.length + ' month' + (monthsWithOverrides.length === 1 ? '' : 's') + '. Updated ' + updated + ' cell' + (updated === 1 ? '' : 's') + '.', 'success');
                } catch (err) {
                    console.error('Headcount admin reset overrides failed', err);
                    setFeedback(err && err.message ? err.message : 'Failed to reset overrides.', 'error');
                } finally {
                    refreshOverrideIndicators({ versionId, versionKey, teamId });
                }
            });
        }

        context.months = months;
        updatePanelSummary(context, state);
        if (!canEdit) {
            setStatus('Read-only for this forecast version', 'info');
            setFeedback('Switch to an editable forecast version to adjust headcount splits.', 'info');
        } else {
            setStatus('', 'info');
            setFeedback('');
        }

        return context;
    }

    async function applyModel({ versionId, versionKey, teamId, state, teamData, months, limitMonths }) {
        if (!window.API || !window.API.forecasts || typeof window.API.forecasts.bulkUpdate !== 'function') {
            throw new Error('Forecast API not available');
        }
        const PG_LEVELS = getPgLevels();
        const monthList = Array.isArray(months) && months.length ? months : getMonthsList();
        const forecastMonths = monthList.filter(month => teamData?.forecastStatus?.[month] === 'Forecast');
        const targetMonths = (Array.isArray(limitMonths) && limitMonths.length ? limitMonths : forecastMonths).filter(Boolean);
        if (!targetMonths.length) {
            return { updatedCells: 0, monthsAffected: 0, warnings: [] };
        }
        const ratio = Math.min(100, Math.max(1, Number(state.productiveRatio) || 100));
        const ratioMultiplier = ratio / 100;
        const overrides = state.manualOverrides || {};
        const updates = [];
        const changes = [];
        const warnings = [];
        const updatedMonths = new Set();

        targetMonths.forEach(month => {
            const ending = Number(teamData?.headcountFlows?.ending_headcount?.[month] ?? 0);
            if (!Number.isFinite(ending) || ending <= 0) {
                warnings.push(`Skipped ${month}: missing ending headcount`);
                return;
            }
            const targetTotal = Math.round(ending * ratioMultiplier);
            const monthOverrides = overrides[month] || {};
            const manualTotal = Object.values(monthOverrides).reduce((sum, val) => sum + (Number(val) || 0), 0);
            let remaining = targetTotal - manualTotal;
            if (remaining < 0) {
                warnings.push(`${month}: manual overrides exceed target by ${Math.abs(remaining)}`);
                remaining = 0;
            }

            const adjustable = [];
            let shareTotal = 0;
            PG_LEVELS.forEach(pg => {
                if (monthOverrides.hasOwnProperty(pg)) {
                    return;
                }
                let share = Number(state.pgSplits[pg] || 0);
                if (!Number.isFinite(share) || share < 0) {
                    share = 0;
                }
                adjustable.push({ pg, share });
                shareTotal += share;
            });
            if (adjustable.length === 0) {
                if (remaining > 0) {
                    warnings.push(`${month}: no PGs available for auto allocation`);
                }
            }
            if (shareTotal === 0 && adjustable.length > 0) {
                const evenShare = 100 / adjustable.length;
                adjustable.forEach(item => {
                    item.share = evenShare;
                });
                shareTotal = 100;
            }

            const allocations = {};
            let allocated = 0;
            const provisional = [];
            adjustable.forEach(item => {
                const raw = remaining * (item.share / shareTotal || 0);
                const base = Math.floor(raw);
                const remainder = raw - base;
                allocations[item.pg] = base;
                allocated += base;
                provisional.push({ pg: item.pg, remainder });
            });
            let remainderUnits = remaining - allocated;
            if (remainderUnits > 0) {
                provisional.sort((a, b) => b.remainder - a.remainder);
                for (let i = 0; i < provisional.length && remainderUnits > 0; i++) {
                    allocations[provisional[i].pg] += 1;
                    remainderUnits -= 1;
                }
            }

            PG_LEVELS.forEach(pg => {
                const targetValue = monthOverrides.hasOwnProperty(pg) ? Number(monthOverrides[pg]) || 0 : allocations[pg] || 0;
                const currentValue = Number(teamData?.pgLevels?.[pg]?.[month] ?? 0);
                if (targetValue === currentValue) {
                    return;
                }
                if (!teamData.pgLevels) {
                    teamData.pgLevels = {};
                }
                if (!teamData.pgLevels[pg]) {
                    teamData.pgLevels[pg] = {};
                }
                teamData.pgLevels[pg][month] = targetValue;
                updatedMonths.add(month);
                const input = document.querySelector(`#sales-headcount-subtab input[data-month="${month}"][data-pg="${pg}"][data-team="${teamId}"]`);
                if (input) {
                    input.value = targetValue;
                }
                updates.push({
                    teamId: Number(teamId),
                    periodDate: typeof window.getPeriodDate === 'function' ? window.getPeriodDate(month) : month,
                    field: `pg${pg.replace(/\D/g, '')}_headcount`,
                    newValue: targetValue
                });
                changes.push({
                    team: Number(teamId),
                    month,
                    metric: 'headcount',
                    pg,
                    previousValue: currentValue,
                    newValue: targetValue
                });
            });

            const finalTotal = PG_LEVELS.reduce((sum, pg) => sum + Number(teamData?.pgLevels?.[pg]?.[month] ?? 0), 0);
            if (Object.keys(monthOverrides).length === 0 && finalTotal !== targetTotal) {
                warnings.push(`${month}: total ${finalTotal} differs from target ${targetTotal}`);
            }
        });

        updatedMonths.forEach(month => {
            if (typeof window.updateHeadcountTotals === 'function') {
                window.updateHeadcountTotals(teamId, month);
            }
            if (typeof window.updateProductionCalculations === 'function') {
                window.updateProductionCalculations(teamId, month);
            }
        });

        if (!updates.length) {
            return { updatedCells: 0, monthsAffected: updatedMonths.size, warnings };
        }

        const payload = {
            updates,
            versionId: window.AppState?.currentVersion?.version_id ?? versionId,
            updatedBy: window.AppState?.currentUser || 'system'
        };
        await window.API.forecasts.bulkUpdate(payload);
        if (typeof window.showSaveIndicator === 'function') {
            window.showSaveIndicator();
        }

        if (Array.isArray(window.AppState?.undoStack)) {
            window.AppState.undoStack.push({
                type: 'bulkPaste',
                data: changes,
                context: { tab: 'headcount', subtab: 'sales' }
            });
            window.AppState.redoStack = [];
            if (typeof window.updateUndoRedoButtons === 'function') {
                window.updateUndoRedoButtons();
            }
        }

        return { updatedCells: updates.length, monthsAffected: updatedMonths.size, warnings };
    }
    function handleAfterHeadcountChange(input) {
        if (!input || typeof window.AppState === 'undefined') {
            return;
        }
        if (window.AppState.isProgrammaticChange || window.AppState.isBulkPasting) {
            return;
        }
        if (window.AppState.headcountSubtab !== 'sales') {
            return;
        }
        const month = input.dataset.month;
        const pg = input.dataset.pg;
        const team = input.dataset.team;
        if (!month || !pg || !team) {
            return;
        }
        const teamId = Number(team);
        const teamStore = getTeamStore(teamId);
        if (!teamStore || teamStore.forecastStatus?.[month] !== 'Forecast') {
            return;
        }
        const versionId = window.AppState.currentVersion?.version_id;
        const versionKey = window.AppState.currentForecast;
        const state = ensureState({ versionId, versionKey, teamId, teamData: teamStore, months: getMonthsList() });
        const hadOverrideBefore = Boolean(state.manualOverrides?.[month]?.hasOwnProperty(pg));
        if (!state.manualOverrides) {
            state.manualOverrides = {};
        }
        if (!state.manualOverrides[month]) {
            state.manualOverrides[month] = {};
        }
        const numeric = Number(input.value || teamStore.pgLevels?.[pg]?.[month] || 0);
        state.manualOverrides[month][pg] = Math.round(Number.isFinite(numeric) ? numeric : 0);
        saveState(versionId, versionKey, teamId, state);
        refreshOverrideIndicators({ versionId, versionKey, teamId });

        const lastAction = window.AppState.undoStack?.[window.AppState.undoStack.length - 1];
        if (lastAction && lastAction.type === 'headcountChange') {
            lastAction.data = {
                ...lastAction.data,
                hadOverrideBefore
            };
        }
    }

    function handleUndoAction(action) {
        if (!action || action.type !== 'headcountChange') {
            return;
        }
        const { team, pg, month, previousValue, hadOverrideBefore } = action.data || {};
        if (team == null || !pg || !month) {
            return;
        }
        const teamId = Number(team);
        const versionId = window.AppState.currentVersion?.version_id;
        const versionKey = window.AppState.currentForecast;
        const teamStore = getTeamStore(teamId);
        if (!teamStore) {
            return;
        }
        const state = ensureState({ versionId, versionKey, teamId, teamData: teamStore, months: getMonthsList() });
        if (!hadOverrideBefore) {
            if (state.manualOverrides?.[month]) {
                delete state.manualOverrides[month][pg];
                if (Object.keys(state.manualOverrides[month]).length === 0) {
                    delete state.manualOverrides[month];
                }
            }
        } else {
            if (!state.manualOverrides) state.manualOverrides = {};
            if (!state.manualOverrides[month]) state.manualOverrides[month] = {};
            state.manualOverrides[month][pg] = Math.round(Number(previousValue) || 0);
        }
        saveState(versionId, versionKey, teamId, state);
        refreshOverrideIndicators({ versionId, versionKey, teamId });
    }

    function handleRedoAction(action) {
        if (!action || action.type !== 'headcountChange') {
            return;
        }
        const { team, pg, month, newValue } = action.data || {};
        if (team == null || !pg || !month) {
            return;
        }
        const teamId = Number(team);
        const versionId = window.AppState.currentVersion?.version_id;
        const versionKey = window.AppState.currentForecast;
        const teamStore = getTeamStore(teamId);
        if (!teamStore) {
            return;
        }
        const state = ensureState({ versionId, versionKey, teamId, teamData: teamStore, months: getMonthsList() });
        if (!state.manualOverrides) state.manualOverrides = {};
        if (!state.manualOverrides[month]) state.manualOverrides[month] = {};
        state.manualOverrides[month][pg] = Math.round(Number(newValue) || 0);
        saveState(versionId, versionKey, teamId, state);
        refreshOverrideIndicators({ versionId, versionKey, teamId });
    }

    function openHeadcountAdminPanel() {
        const versionId = window.AppState?.currentVersion?.version_id;
        const versionKey = window.AppState?.currentForecast;
        const teamId = window.AppState?.currentTeam;
        if (teamId == null) {
            return;
        }
        const teamStore = getTeamStore(teamId);
        if (!teamStore) {
            console.warn('HeadcountAdmin: team data not loaded');
            return;
        }
        const months = getMonthsList();
        const state = ensureState({ versionId, versionKey, teamId, teamData: teamStore, months });
        const modal = document.getElementById('headcountAdminModal');
        const body = document.getElementById('headcountAdminModalBody');
        if (!modal || !body) {
            console.warn('HeadcountAdmin: modal container missing');
            return;
        }
        body.innerHTML = '';
        const panelContainer = document.createElement('div');
        body.appendChild(panelContainer);
        const canEdit = !window.AppState?.isGroupView && window.AppState?.currentVersion?.version_id === 2;
        openContext = renderPanel(panelContainer, {
            versionId,
            versionKey,
            teamId,
            teamData: teamStore,
            months,
            state,
            canEdit
        });
        openContext.months = months;
        modal.style.display = 'block';
        document.body.classList.add('modal-open');
        refreshOverrideIndicators({ versionId, versionKey, teamId });
    }

    function closeHeadcountAdminPanel() {
        const modal = document.getElementById('headcountAdminModal');
        if (modal) {
            modal.style.display = 'none';
        }
        document.body.classList.remove('modal-open');
        openContext = null;
    }

    function installModalHandlers() {
        const modal = document.getElementById('headcountAdminModal');
        if (modal && !modal.dataset.hcBound) {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    closeHeadcountAdminPanel();
                }
            });
            modal.dataset.hcBound = 'true';
        }
    }
    function attachHeadcountChangeHook() {
        if (typeof window.handleHeadcountChange !== 'function') {
            setTimeout(attachHeadcountChangeHook, 100);
            return;
        }
        const original = window.handleHeadcountChange;
        if (original.__hcAdminWrapped) {
            return;
        }
        const wrapped = async function (input) {
            const result = await original.call(this, input);
            try {
                handleAfterHeadcountChange(input);
            } catch (err) {
                console.warn('Headcount admin change hook failed', err);
            }
            return result;
        };
        wrapped.__hcAdminWrapped = true;
        window.handleHeadcountChange = wrapped;
    }

    function attachRenderHook() {
        if (typeof window.renderHeadcountTab !== 'function') {
            setTimeout(attachRenderHook, 100);
            return;
        }
        const original = window.renderHeadcountTab;
        if (original.__hcAdminWrapped) {
            return;
        }
        const wrapped = function (data, opts = {}) {
            const result = original.call(this, data, opts);
            try {
                const mode = opts.mode || (window.AppState?.headcountSubtab || 'sales');
                if (mode === 'sales' && !window.AppState?.isGroupView) {
                    const versionId = window.AppState?.currentVersion?.version_id;
                    const versionKey = window.AppState?.currentForecast;
                    const teamId = window.AppState?.currentTeam;
                    const months = opts.months || getMonthsList();
                    ensureState({ versionId, versionKey, teamId, teamData: data, months });
                    refreshOverrideIndicators({ versionId, versionKey, teamId });
                }
            } catch (err) {
                console.warn('Headcount admin render hook failed', err);
            }
            return result;
        };
        wrapped.__hcAdminWrapped = true;
        window.renderHeadcountTab = wrapped;
    }

    function attachUndoRedoHooks() {
        if (typeof window.undo !== 'function' || typeof window.redo !== 'function') {
            setTimeout(attachUndoRedoHooks, 100);
            return;
        }
        if (!window.undo.__hcAdminWrapped) {
            const originalUndo = window.undo;
            const wrappedUndo = function (...args) {
                const result = originalUndo.apply(this, args);
                try {
                    const action = window.AppState?.redoStack?.[window.AppState.redoStack.length - 1];
                    handleUndoAction(action);
                } catch (err) {
                    console.warn('Headcount admin undo hook failed', err);
                }
                return result;
            };
            wrappedUndo.__hcAdminWrapped = true;
            window.undo = wrappedUndo;
        }
        if (!window.redo.__hcAdminWrapped) {
            const originalRedo = window.redo;
            const wrappedRedo = function (...args) {
                const result = originalRedo.apply(this, args);
                try {
                    const action = window.AppState?.undoStack?.[window.AppState.undoStack.length - 1];
                    handleRedoAction(action);
                } catch (err) {
                    console.warn('Headcount admin redo hook failed', err);
                }
                return result;
            };
            wrappedRedo.__hcAdminWrapped = true;
            window.redo = wrappedRedo;
        }
    }

    function waitForCoreFunctions() {
        if (typeof window.renderHeadcountTab === 'function' && typeof window.handleHeadcountChange === 'function' && typeof window.undo === 'function' && typeof window.redo === 'function') {
            attachRenderHook();
            attachHeadcountChangeHook();
            attachUndoRedoHooks();
            return;
        }
        setTimeout(waitForCoreFunctions, 120);
    }

    function installHooks() {
        if (hooksInstalled) {
            return;
        }
        hooksInstalled = true;
        installModalHandlers();
        waitForCoreFunctions();
    }

    window.HeadcountAdmin = {
        open: openHeadcountAdminPanel,
        close: closeHeadcountAdminPanel,
        refreshOverrideIndicators,
        install: installHooks
    };

    window.openHeadcountAdminPanel = openHeadcountAdminPanel;
    window.closeHeadcountAdminPanel = closeHeadcountAdminPanel;

    installHooks();
})();












