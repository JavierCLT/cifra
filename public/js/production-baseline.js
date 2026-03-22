function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
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
function getDefaultProductionConfig() {
    const defaults = { productivity: {}, abpa: {} };
    MONTH_ABBREVIATIONS.forEach(month => {
        defaults.productivity[month] = 1;
        defaults.abpa[month] = 1;
    });
    return {
        seasonality: defaults,
        growth: {
            productivity: 0,
            abpa: 0,
            mgiaMix: 0
        }
    };
}

function normalizeProductionConfig(config) {
    const base = getDefaultProductionConfig();
    if (!config || typeof config !== 'object') {
        return base;
    }

    const normalized = {
        seasonality: {
            productivity: { ...base.seasonality.productivity },
            abpa: { ...base.seasonality.abpa }
        },
        growth: {
            productivity: 0,
            abpa: 0,
            mgiaMix: 0
        }
    };

    const seasonalityProductivity = (config.seasonality && config.seasonality.productivity) ||
        config.seasonalityProductivity ||
        config.seasonality_productivity ||
        {};
    const seasonalityAbpa = (config.seasonality && config.seasonality.abpa) ||
        config.seasonalityAbpa ||
        config.seasonality_abpa ||
        {};

    MONTH_ABBREVIATIONS.forEach(month => {
        normalized.seasonality.productivity[month] = toNumber(seasonalityProductivity[month], 1);
        normalized.seasonality.abpa[month] = toNumber(seasonalityAbpa[month], 1);
    });

    const growthSource = config.growth || {};
    normalized.growth.productivity = toNumber(
        growthSource.productivity,
        toNumber(config.productivityGrowthRate ?? config.productivity_growth_rate, 0)
    );
    normalized.growth.abpa = toNumber(
        growthSource.abpa,
        toNumber(config.abpaGrowthRate ?? config.abpa_growth_rate, 0)
    );
    normalized.growth.mgiaMix = toNumber(
        growthSource.mgiaMix,
        toNumber(config.mgiaMixGrowthRate ?? config.mgia_mix_growth_rate, 0)
    );

    return normalized;
}

async function loadProductionConfig(versionId) {
    if (!versionId) {
        AppState.productionConfig = getDefaultProductionConfig();
        return AppState.productionConfig;
    }
    try {
        const rawConfig = await API.productionConfig.get(versionId);
        AppState.productionConfig = normalizeProductionConfig(rawConfig);
    } catch (error) {
        console.error('Failed to load production configuration', error);
        AppState.productionConfig = getDefaultProductionConfig();
    }
    return AppState.productionConfig;
}

function getProductionBaselineKey(mode = AppState.productionSubtab || 'investments') {
    if (!AppState.currentVersion) {
        return `unknown|${mode}`;
    }
    return `${AppState.currentVersion.version_id}|${AppState.currentTeam}|${mode}`;
}

function createDefaultBaselineState(mode = 'investments') {
    if (mode === 'banking') {
        return {
            period: 12,
            productivity: {},
            abpa: {}
        };
    }

    return {
        period: 12,
        productivity: null,
        mix: {},
        abpa: {},
        deepeningPercent: null
    };
}

function getProductionBaselineState(mode = AppState.productionSubtab || 'investments') {
    if (!AppState.productionBaselineState) {
        AppState.productionBaselineState = {};
    }
    const key = getProductionBaselineKey(mode);
    if (!AppState.productionBaselineState[key]) {
        AppState.productionBaselineState[key] = createDefaultBaselineState(mode);
    }
    return AppState.productionBaselineState[key];
}

function computeProductionBaselineAverages(data, months, period, mode = 'investments') {
    const actualMonths = months.filter(month => data.forecastStatus[month] !== 'Forecast');
    const trailing = actualMonths.slice(-period);

    if (mode === 'banking') {
        const result = {
            productivity: {},
            abpa: {}
        };

        ADDITIONAL_PRODUCTS.forEach(product => {
            result.productivity[product] = 0;
            result.abpa[product] = 0;
        });

        if (trailing.length === 0) {
            return result;
        }

        ADDITIONAL_PRODUCTS.forEach(product => {
            result.productivity[product] = trailing.reduce((sum, month) => (
                sum + toNumber(data.additionalProducts?.[product]?.productivity?.[month], 0)
            ), 0) / trailing.length;
            result.abpa[product] = trailing.reduce((sum, month) => (
                sum + toNumber(data.additionalProducts?.[product]?.abpa?.[month], 0)
            ), 0) / trailing.length;
        });

        return result;
    }

    const result = {
        productivity: 0,
        mix: {},
        abpa: {},
        deepeningPercent: 0
    };
    if (trailing.length === 0) {
        PRODUCTS.forEach(product => {
            result.mix[product] = 0;
            result.abpa[product] = 0;
        });
        return result;
    }
    result.productivity = trailing.reduce((sum, month) => sum + toNumber(data.productivity[month], 0), 0) / trailing.length;
    PRODUCTS.forEach(product => {
        result.mix[product] = trailing.reduce((sum, month) => sum + toNumber(data.productMix[product][month], 0), 0) / trailing.length;
        result.abpa[product] = trailing.reduce((sum, month) => sum + toNumber(data.abpa[product][month], 0), 0) / trailing.length;
    });
    if (data.deepening && data.deepening.percent) {
        result.deepeningPercent = trailing.reduce((sum, month) => sum + toNumber(data.deepening.percent[month], 0), 0) / trailing.length;
    }
    return result;
}

function updateBaselineAverageCells(column, averages, period, mode = 'investments') {
    if (!column) return;

    const periodLabel = column.querySelector('.baseline-avg-value');
    if (periodLabel) {
        periodLabel.textContent = `${period} mo`;
    }

    const resolveSlug = (value) => (typeof slugify === 'function' ? slugify(value) : String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const setAvg = (selector, text) => {
        const cell = column.querySelector(`${selector} .baseline-cell--avg`);
        if (cell) {
            cell.textContent = text;
        }
    };

    if (mode === 'banking') {
        ADDITIONAL_PRODUCTS.forEach(product => {
            const slug = resolveSlug(product);
            setAvg(
                `.baseline-row--metric[data-baseline-metric="productivity"][data-baseline-product="${slug}"]`,
                toNumber(averages.productivity?.[product], 0).toFixed(2)
            );
            setAvg(
                `.baseline-row--metric[data-baseline-metric="abpa"][data-baseline-product="${slug}"]`,
                `${formatThousands(toNumber(averages.abpa?.[product], 0), 0)}K`
            );
        });
    } else {
        setAvg('.baseline-row--metric[data-baseline-metric="productivity"]', toNumber(averages.productivity, 0).toFixed(2));
        setAvg('.baseline-row--metric[data-baseline-metric="deepening-percent"]', `${(toNumber(averages.deepeningPercent, 0) * 100).toFixed(1)}%`);

        PRODUCTS.forEach(product => {
            const slug = resolveSlug(product);
            setAvg(`.baseline-row--metric[data-baseline-metric="mix"][data-baseline-product="${slug}"]`, `${(toNumber(averages.mix[product], 0) * 100).toFixed(1)}%`);
            setAvg(`.baseline-row--metric[data-baseline-metric="abpa"][data-baseline-product="${slug}"]`, `${formatThousands(toNumber(averages.abpa[product], 0), 0)}K`);
        });
    }

    column.querySelectorAll('.baseline-section-avg-label').forEach(span => {
        span.textContent = `AVG ${period} MO`;
    });

    scheduleBaselineLayoutSync();
}

function applyProductionBaselines({ data, months, teamId = AppState.currentTeam, updateDom = false, mode = 'all' } = {}) {
    if (AppState.isGroupView) return;
    if (!data) return;

    const config = AppState.productionConfig || getDefaultProductionConfig();
    const monthList = Array.isArray(months) && months.length
        ? months
        : (typeof generateMonthList === 'function' ? generateMonthList() : []);
    if (!monthList.length) return;

    const forecastMonths = monthList.filter(month => data.forecastStatus[month] === 'Forecast');
    if (!forecastMonths.length) return;

    const baseYear = parseInt(`20${forecastMonths[0].split('-')[1]}`, 10);
    if (!Number.isFinite(baseYear)) return;

    const modes = mode === 'all' ? ['investments', 'banking'] : [mode];

    modes.forEach(activeMode => {
        const baselineState = getProductionBaselineState(activeMode);
        if (!baselineState) {
            return;
        }

        if (activeMode === 'banking') {
            const hasBankingBaseline = ADDITIONAL_PRODUCTS.some(product => (
                baselineState.productivity?.[product] != null || baselineState.abpa?.[product] != null
            ));
            if (!hasBankingBaseline) {
                return;
            }

            const targetRoot = updateDom ? document.getElementById('production-banking-subtab') : null;

            forecastMonths.forEach(month => {
                const [monthKey, yearSuffix] = month.split('-');
                const fullYear = parseInt(`20${yearSuffix}`, 10);
                const yearDiff = Number.isFinite(fullYear) ? Math.max(0, fullYear - baseYear) : 0;
                const seasonalProd = config.seasonality?.productivity?.[monthKey] ?? 1;
                const seasonalAbpa = config.seasonality?.abpa?.[monthKey] ?? 1;
                const productivityGrowth = Math.pow(1 + (config.growth?.productivity ?? 0), yearDiff);
                const abpaGrowth = Math.pow(1 + (config.growth?.abpa ?? 0), yearDiff);

                ADDITIONAL_PRODUCTS.forEach(product => {
                    const productData = data.additionalProducts?.[product];
                    if (!productData) {
                        return;
                    }

                    const baseProd = toNumber(baselineState.productivity?.[product], 0);
                    const monthlyProd = Number((baseProd * seasonalProd * productivityGrowth).toFixed(2));
                    productData.productivity[month] = monthlyProd.toFixed(2);

                    const baseAbpa = toNumber(baselineState.abpa?.[product], 0);
                    const adjustedAbpa = Math.round(baseAbpa * seasonalAbpa * abpaGrowth);
                    productData.abpa[month] = adjustedAbpa;

                    if (updateDom && targetRoot) {
                        const prodInput = targetRoot.querySelector(`input[data-metric="additional-productivity"][data-month="${month}"][data-product="${product}"]`);
                        if (prodInput) {
                            prodInput.value = monthlyProd.toFixed(2);
                        }

                        const abpaInput = targetRoot.querySelector(`input[data-metric="additional-abpa"][data-month="${month}"][data-product="${product}"]`);
                        if (abpaInput) {
                            abpaInput.value = String(Math.round(adjustedAbpa / 1000));
                        }
                    }
                });
            });

            if (typeof recalculateBankingTotals === 'function') {
                recalculateBankingTotals(teamId);
            }
            return;
        }

        if (baselineState.productivity == null) {
            return;
        }

        const targetRoot = updateDom ? document.getElementById('production-investments-subtab') : null;
        const mixBase = {};
        PRODUCTS.forEach(product => {
            mixBase[product] = toNumber(baselineState.mix[product], 0);
        });

        const otherProducts = PRODUCTS.filter(product => product !== MGIA_PRODUCT_NAME && product !== SELF_DIRECTED_PRODUCT_NAME);
        const otherBaseSum = otherProducts.reduce((sum, product) => sum + mixBase[product], 0);
        const mgiaBase = mixBase[MGIA_PRODUCT_NAME] ?? 0;

        forecastMonths.forEach(month => {
            const [monthKey, yearSuffix] = month.split('-');
            const fullYear = parseInt(`20${yearSuffix}`, 10);
            const yearDiff = Number.isFinite(fullYear) ? Math.max(0, fullYear - baseYear) : 0;

            const baseProd = toNumber(baselineState.productivity, 0);
            const seasonalProd = config.seasonality?.productivity?.[monthKey] ?? 1;
            const productivityGrowth = Math.pow(1 + (config.growth?.productivity ?? 0), yearDiff);
            const monthlyProd = Number((baseProd * seasonalProd * productivityGrowth).toFixed(2));
            data.productivity[month] = monthlyProd.toFixed(2);

            if (updateDom && targetRoot) {
                const prodInput = targetRoot.querySelector(`input[data-metric="productivity"][data-month="${month}"]`);
                if (prodInput) {
                    prodInput.value = monthlyProd.toFixed(2);
                }
            }

            if (!data.deepening) {
                data.deepening = { amount: {}, percent: {} };
            } else {
                data.deepening.percent = data.deepening.percent || {};
                data.deepening.amount = data.deepening.amount || {};
            }
            const deepBaseline = toNumber(baselineState.deepeningPercent, 0);
            data.deepening.percent[month] = deepBaseline;
            if (updateDom && targetRoot) {
                const deepInput = targetRoot.querySelector(`input[data-metric="deepening-percent"][data-month="${month}"]`);
                if (deepInput) {
                    deepInput.value = (deepBaseline * 100).toFixed(1);
                }
            }

            const mgiaGrowth = config.growth?.mgiaMix ?? 0;
            const mgiaCap = Math.max(0, 1 - otherBaseSum);
            const mgiaAdjusted = clamp(mgiaBase * Math.pow(1 + mgiaGrowth, yearDiff), 0, mgiaCap);
            const selfDirectedAdjusted = clamp(1 - otherBaseSum - mgiaAdjusted, 0, 1);

            PRODUCTS.forEach(product => {
                if (product === MGIA_PRODUCT_NAME) {
                    data.productMix[product][month] = Number(mgiaAdjusted.toFixed(4));
                } else if (product === SELF_DIRECTED_PRODUCT_NAME) {
                    data.productMix[product][month] = Number(selfDirectedAdjusted.toFixed(4));
                } else {
                    data.productMix[product][month] = Number((mixBase[product] ?? 0).toFixed(4));
                }
            });

            const totalMix = PRODUCTS.reduce((sum, product) => sum + data.productMix[product][month], 0);
            if (Math.abs(totalMix - 1) > 0.0001) {
                const delta = 1 - totalMix;
                data.productMix[SELF_DIRECTED_PRODUCT_NAME][month] = Number(
                    clamp(data.productMix[SELF_DIRECTED_PRODUCT_NAME][month] + delta, 0, 1).toFixed(4)
                );
            }

            if (updateDom && targetRoot) {
                PRODUCTS.forEach(product => {
                    const mixInput = targetRoot.querySelector(`input[data-metric="mix"][data-month="${month}"][data-product="${product}"]`);
                    if (mixInput) {
                        mixInput.value = Math.round(data.productMix[product][month] * 100);
                    }
                });
            }

            const seasonalAbpa = config.seasonality?.abpa?.[monthKey] ?? 1;
            const abpaGrowth = Math.pow(1 + (config.growth?.abpa ?? 0), yearDiff);
            PRODUCTS.forEach(product => {
                const baseAbpa = toNumber(baselineState.abpa[product], 0);
                const adjustedAbpa = Math.round(baseAbpa * seasonalAbpa * abpaGrowth);
                data.abpa[product][month] = adjustedAbpa;

                if (updateDom && targetRoot) {
                    const abpaInput = targetRoot.querySelector(`input[data-metric="abpa"][data-month="${month}"][data-product="${product}"]`);
                    if (abpaInput) {
                        abpaInput.value = String(Math.round(adjustedAbpa / 1000));
                    }
                }
            });

            updateProductionCalculations(teamId, month);
        });

        if (updateDom) {
            validateAllProductMix();
        }
    });
}


function valuesApproximatelyEqual(a, b, tolerance = 0.0001) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tolerance;
}

function createBaselineChangeSnapshot({ data, months, teamId = AppState.currentTeam, mode = 'investments' } = {}) {
    if (!data) return null;
    const monthList = Array.isArray(months) && months.length
        ? months
        : (typeof generateMonthList === 'function' ? generateMonthList() : []);
    const forecastMonths = monthList.filter(month => data.forecastStatus[month] === 'Forecast');
    if (!forecastMonths.length) return null;

    const team = String(teamId);
    const records = [];

    if (mode === 'banking') {
        forecastMonths.forEach(month => {
            ADDITIONAL_PRODUCTS.forEach(product => {
                const prodValue = Number(toNumber(data.additionalProducts?.[product]?.productivity?.[month], 0).toFixed(2));
                const abpaValue = Math.round(toNumber(data.additionalProducts?.[product]?.abpa?.[month], 0));
                records.push({ team, month, metric: 'additional-productivity', product, previousValue: prodValue });
                records.push({ team, month, metric: 'additional-abpa', product, previousValue: abpaValue });
            });
        });

        return {
            team,
            finalize() {
                const changes = [];
                records.forEach(entry => {
                    let newValue;
                    if (entry.metric === 'additional-productivity') {
                        newValue = Number(toNumber(data.additionalProducts?.[entry.product]?.productivity?.[entry.month], 0).toFixed(2));
                        if (!valuesApproximatelyEqual(entry.previousValue, newValue, 0.01)) {
                            changes.push({ ...entry, newValue });
                        }
                    } else if (entry.metric === 'additional-abpa') {
                        newValue = Math.round(toNumber(data.additionalProducts?.[entry.product]?.abpa?.[entry.month], 0));
                        if (!valuesApproximatelyEqual(entry.previousValue, newValue, 0.5)) {
                            changes.push({ ...entry, newValue });
                        }
                    }
                });
                return changes;
            }
        };
    }

    forecastMonths.forEach(month => {
        const baseProd = Number(toNumber(data.productivity[month], 0).toFixed(2));
        records.push({ team, month, metric: 'productivity', previousValue: baseProd });
        const deepValue = Number((toNumber(data.deepening?.percent?.[month], 0) * 100).toFixed(1));
        records.push({ team, month, metric: 'deepening_percent', previousValue: deepValue });

        PRODUCTS.forEach(product => {
            const mixValue = Number((toNumber(data.productMix[product][month], 0) * 100).toFixed(1));
            const abpaValue = Math.round(toNumber(data.abpa[product][month], 0));
            records.push({ team, month, metric: 'mix', product, previousValue: mixValue });
            records.push({ team, month, metric: 'abpa', product, previousValue: abpaValue });
        });
    });

    return {
        team,
        finalize() {
            const changes = [];
            records.forEach(entry => {
                let newValue;
                if (entry.metric === 'productivity') {
                    newValue = Number(toNumber(data.productivity[entry.month], 0).toFixed(2));
                    if (!valuesApproximatelyEqual(entry.previousValue, newValue, 0.01)) {
                        changes.push({ ...entry, newValue });
                    }
                } else if (entry.metric === 'mix') {
                    newValue = Number((toNumber(data.productMix[entry.product][entry.month], 0) * 100).toFixed(1));
                    if (!valuesApproximatelyEqual(entry.previousValue, newValue, 0.05)) {
                        changes.push({ ...entry, newValue });
                    }
                } else if (entry.metric === 'abpa') {
                    newValue = Math.round(toNumber(data.abpa[entry.product][entry.month], 0));
                    if (!valuesApproximatelyEqual(entry.previousValue, newValue, 0.5)) {
                        changes.push({ ...entry, newValue });
                    }
                } else if (entry.metric === 'deepening_percent') {
                    newValue = Number((toNumber(data.deepening?.percent?.[entry.month], 0) * 100).toFixed(1));
                    if (!valuesApproximatelyEqual(entry.previousValue, newValue, 0.05)) {
                        changes.push({ ...entry, newValue });
                    }
                }
            });
            return changes;
        }
    };
}

function pushBaselineUndoAction(changes, mode = 'investments') {
    if (!Array.isArray(changes) || !changes.length || typeof AppState === 'undefined') {
        return;
    }
    AppState.undoStack.push({
        type: 'baselineApply',
        data: changes,
        context: { tab: 'production', subtab: mode }
    });
    AppState.redoStack = [];
    if (typeof updateUndoRedoButtons === 'function') {
        updateUndoRedoButtons();
    }
}

function persistBaselineChanges(changes) {
    if (!Array.isArray(changes) || !changes.length) return;
    if (typeof getFieldAndDbValueFromState !== 'function' || typeof getPeriodDate !== 'function') return;
    if (!AppState.currentVersion) return;

    const updates = changes.map(change => {
        const mapping = getFieldAndDbValueFromState(change.metric, change.product, null, change.newValue);
        if (!mapping || !mapping.fieldName) {
            return null;
        }
        return {
            teamId: parseInt(change.team, 10),
            periodDate: getPeriodDate(change.month),
            field: mapping.fieldName,
            newValue: mapping.dbValue
        };
    }).filter(Boolean);

    if (!updates.length) return;

    API.forecasts.bulkUpdate({
        updates,
        versionId: AppState.currentVersion.version_id,
        updatedBy: AppState.currentUser
    }).then(() => {
        if (typeof showSaveIndicator === 'function') {
            showSaveIndicator();
        }
    }).catch(error => {
        console.error('Failed to save baseline changes', error);
        if (typeof showError === 'function') {
            showError('Failed to save baseline changes');
        }
    });
}


function handleProductionBaselinePeriodChange(event) {
    const select = event.target;
    const period = parseInt(select.value, 10);
    if (!Number.isFinite(period)) return;

    const column = select.closest('.production-baseline-column');
    const mode = column?.dataset.baselineMode || AppState.productionSubtab || 'investments';
    const baselineState = getProductionBaselineState(mode);
    baselineState.period = period;

    const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
    const teamKey = `Team ${AppState.currentTeam}`;
    const data = AppState.teamData[AppState.currentForecast]?.[teamKey];
    if (data && months.length) {
        const snapshot = createBaselineChangeSnapshot({ data, months, teamId: AppState.currentTeam, mode });
        const averages = computeProductionBaselineAverages(data, months, period, mode);
        updateBaselineAverageCells(column, averages, period, mode);
        applyProductionBaselines({
            data,
            months,
            teamId: AppState.currentTeam,
            updateDom: AppState.currentTab === 'production' && AppState.productionSubtab === mode,
            mode
        });
        if (snapshot) {
            const changes = snapshot.finalize();
            if (changes.length) {
                pushBaselineUndoAction(changes, mode);
                persistBaselineChanges(changes);
            }
        }
    }
}

function handleProductionBaselineInputChange(event) {
    const input = event.target;
    const metric = input.dataset.baselineMetric;
    const product = input.dataset.baselineProduct;
    const column = input.closest('.production-baseline-column');
    const mode = column?.dataset.baselineMode || AppState.productionSubtab || 'investments';
    const baselineState = getProductionBaselineState(mode);

    const normalizeProductName = (name) => {
        if (!name) return name;
        const sourceList = mode === 'banking' ? ADDITIONAL_PRODUCTS : PRODUCTS;
        const matches = sourceList.filter(productName => productName === name);
        return matches.length ? matches[0] : name;
    };

    if (mode === 'banking' && metric === 'productivity') {
        const productName = normalizeProductName(product);
        let value = Number(input.value);
        if (!Number.isFinite(value)) {
            value = toNumber(baselineState.productivity?.[productName], 0);
        }
        value = Number(value.toFixed(2));
        baselineState.productivity[productName] = value;
        input.value = value.toFixed(2);
    } else if (mode === 'banking' && metric === 'abpa') {
        const productName = normalizeProductName(product);
        let value = Number(input.value);
        if (!Number.isFinite(value)) {
            value = toNumber(baselineState.abpa?.[productName], 0) / 1000;
        }
        value = Math.max(0, Math.round(value));
        baselineState.abpa[productName] = value * 1000;
        input.value = String(value);
    } else if (metric === 'productivity') {
        let value = Number(input.value);
        if (!Number.isFinite(value)) {
            value = baselineState.productivity ?? 0;
        }
        value = Number(value.toFixed(2));
        baselineState.productivity = value;
        input.value = value.toFixed(2);
    } else if (metric === 'mix') {
        const productName = normalizeProductName(product);
        let value = Number(input.value);
        if (!Number.isFinite(value)) {
            value = (baselineState.mix[productName] ?? 0) * 100;
        }
        value = clamp(value, 0, 100);
        baselineState.mix[productName] = value / 100;
        input.value = value.toFixed(1);
    } else if (metric === 'abpa') {
        const productName = normalizeProductName(product);
        let value = Number(input.value);
        if (!Number.isFinite(value)) {
            value = toNumber(baselineState.abpa[productName], 0) / 1000;
        }
        value = Math.max(0, Math.round(value));
        baselineState.abpa[productName] = value * 1000;
        input.value = String(value);
    } else if (metric === 'deepening-percent') {
        let value = Number(input.value);
        if (!Number.isFinite(value)) {
            value = toNumber(baselineState.deepeningPercent, 0) * 100;
        }
        value = clamp(value, 0, 100);
        baselineState.deepeningPercent = value / 100;
        input.value = value.toFixed(1);
    } else {
        return;
    }

    const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
    const teamKey = `Team ${AppState.currentTeam}`;
    const data = AppState.teamData[AppState.currentForecast]?.[teamKey];
    if (data && months.length) {
        const snapshot = createBaselineChangeSnapshot({ data, months, teamId: AppState.currentTeam, mode });
        const period = baselineState.period || 12;
        const averages = computeProductionBaselineAverages(data, months, period, mode);
        updateBaselineAverageCells(column, averages, period, mode);
        applyProductionBaselines({
            data,
            months,
            teamId: AppState.currentTeam,
            updateDom: AppState.currentTab === 'production' && AppState.productionSubtab === mode,
            mode
        });
        if (snapshot) {
            const changes = snapshot.finalize();
            if (changes.length) {
                pushBaselineUndoAction(changes, mode);
                persistBaselineChanges(changes);
            }
        }
    }
}

function bindProductionBaselineEvents(container) {
    if (!container) return;
    const periodSelect = container.querySelector('.production-baseline-period');
    if (periodSelect) {
        periodSelect.addEventListener('change', handleProductionBaselinePeriodChange);
    }
    container.querySelectorAll('.baseline-input').forEach(input => {
        input.addEventListener('change', handleProductionBaselineInputChange);
    });
}

let baselineLayoutRaf = null;

function syncProductionBaselineLayout(container) {
    if (!container) return;

    const MIX_DIVIDER_REDUCTION = 17;
    const ABPA_DIVIDER_REDUCTION = 20;

    const baselineColumn = container.querySelector('.production-baseline-column');
    const table = container.querySelector('.production-table');
    if (!baselineColumn || !table) return;
    const mode = baselineColumn.dataset.baselineMode || 'investments';

    baselineColumn.querySelectorAll('.baseline-row--metric, .baseline-row--spacer, .baseline-row--divider').forEach(row => {
        row.style.height = '';
        row.style.minHeight = '';
        row.style.maxHeight = '';
    });

    baselineColumn.querySelectorAll('.baseline-cell--avg, .baseline-cell--input').forEach(cell => {
        cell.style.height = '';
    });

    const getAnchorRow = (anchor, productSlug) => {
        const selector = productSlug ? `tr[data-baseline-anchor="${anchor}"][data-product="${productSlug}"]` : `tr[data-baseline-anchor="${anchor}"]`;
        return table.querySelector(selector);
    };

    const setSpacerHeight = (element, anchorRow, adjustment = 0) => {
        if (!element || !anchorRow) return;
        const { height } = anchorRow.getBoundingClientRect();
        const finalHeight = Math.max(0, height + adjustment);
        element.style.height = `${finalHeight}px`;
        element.style.minHeight = `${finalHeight}px`;
        element.style.maxHeight = `${finalHeight}px`;
    };

    const setRowHeight = (row, anchorRow) => {
        if (!row || !anchorRow) return;
        const { height } = anchorRow.getBoundingClientRect();
        row.style.height = `${height}px`;
        row.style.minHeight = `${height}px`;
        row.style.maxHeight = `${height}px`;
        row.querySelectorAll('.baseline-cell--avg, .baseline-cell--input').forEach(cell => {
            cell.style.height = `${height}px`;
        });
    };

    const setSectionHeight = (element, headerRow, rows = []) => {
        if (!element || !headerRow || !rows.length) return;
        const headerRect = headerRow.getBoundingClientRect();
        const lastRect = rows[rows.length - 1].getBoundingClientRect();
        const finalHeight = Math.max(0, lastRect.bottom - headerRect.top);
        element.style.height = `${finalHeight}px`;
        element.style.minHeight = `${finalHeight}px`;
        element.style.maxHeight = `${finalHeight}px`;
    };

    if (mode === 'banking') {
        const topSpacer = baselineColumn.querySelector('.baseline-spacer--banking-top');
        const totalAccountsRow = getAnchorRow('banking-total-accounts');
        const productivityHeaderRow = getAnchorRow('banking-productivity-header');
        if (topSpacer && totalAccountsRow && productivityHeaderRow) {
            const totalAccountsRect = totalAccountsRow.getBoundingClientRect();
            const productivityHeaderRect = productivityHeaderRow.getBoundingClientRect();
            const finalHeight = Math.max(0, productivityHeaderRect.bottom - totalAccountsRect.top);
            topSpacer.style.height = `${finalHeight}px`;
            topSpacer.style.minHeight = `${finalHeight}px`;
            topSpacer.style.maxHeight = `${finalHeight}px`;
        }

        baselineColumn.querySelectorAll('.baseline-row--metric[data-baseline-metric="productivity"]').forEach(row => {
            const slug = row.getAttribute('data-baseline-product');
            setRowHeight(row, getAnchorRow('banking-productivity', slug));
        });

        baselineColumn.querySelectorAll('.baseline-row--metric[data-baseline-metric="abpa"]').forEach(row => {
            const slug = row.getAttribute('data-baseline-product');
            setRowHeight(row, getAnchorRow('banking-abpa', slug));
        });

        const accountHeader = getAnchorRow('banking-accounts-header');
        const accountRows = Array.from(table.querySelectorAll('tr[data-baseline-anchor="banking-accounts"]'));
        setSectionHeight(
            baselineColumn.querySelector('.baseline-spacer--banking-accounts'),
            accountHeader,
            accountRows
        );

        const balanceHeader = getAnchorRow('banking-balances-header');
        const balanceRows = Array.from(table.querySelectorAll('tr[data-baseline-anchor="banking-balances"]'));
        setSectionHeight(
            baselineColumn.querySelector('.baseline-spacer--banking-balances'),
            balanceHeader,
            balanceRows
        );

        const tailSpacer = baselineColumn.querySelector('.baseline-spacer--tail');
        if (tailSpacer) {
            tailSpacer.style.height = '10px';
            tailSpacer.style.minHeight = '';
            tailSpacer.style.maxHeight = '';
        }
        return;
    }

    setSpacerHeight(baselineColumn.querySelector('.baseline-spacer--headcount'), getAnchorRow('headcount'));
    setRowHeight(baselineColumn.querySelector('.baseline-row--metric[data-baseline-metric="productivity"]'), getAnchorRow('productivity'));
    setSpacerHeight(baselineColumn.querySelector('.baseline-spacer--totals'), getAnchorRow('total-accounts'));
    setSpacerHeight(baselineColumn.querySelector('.baseline-spacer--balances'), getAnchorRow('total-balances'));

    const mixDivider = baselineColumn.querySelector('.baseline-divider--mix');
    setSpacerHeight(mixDivider, getAnchorRow('mix-header'), -MIX_DIVIDER_REDUCTION);

    baselineColumn.querySelectorAll('.baseline-row--metric[data-baseline-metric="mix"]').forEach(row => {
        const slug = row.getAttribute('data-baseline-product');
        setRowHeight(row, getAnchorRow('mix', slug));
    });

    const mixAnchors = Array.from(table.querySelectorAll('tr[data-baseline-anchor="mix"]'));
    const abpaAnchors = Array.from(table.querySelectorAll('tr[data-baseline-anchor="abpa"]'));
    const abpaDivider = baselineColumn.querySelector('.baseline-divider--abpa');
    if (abpaDivider && mixAnchors.length && abpaAnchors.length) {
        const lastMixRect = mixAnchors[mixAnchors.length - 1].getBoundingClientRect();
        const firstAbpaRect = abpaAnchors[0].getBoundingClientRect();
        const rawGap = Math.max(0, firstAbpaRect.top - lastMixRect.bottom);
        const adjustedGap = Math.max(0, rawGap - ABPA_DIVIDER_REDUCTION);
        abpaDivider.style.height = `${adjustedGap}px`;
        abpaDivider.style.minHeight = `${adjustedGap}px`;
        abpaDivider.style.maxHeight = `${adjustedGap}px`;
    }

    baselineColumn.querySelectorAll('.baseline-row--metric[data-baseline-metric="abpa"]').forEach(row => {
        const slug = row.getAttribute('data-baseline-product');
        setRowHeight(row, getAnchorRow('abpa', slug));
    });

    const tailSpacer = baselineColumn.querySelector('.baseline-spacer--tail');
    if (tailSpacer) {
        tailSpacer.style.height = '10px';
        tailSpacer.style.minHeight = '';
        tailSpacer.style.maxHeight = '';
    }
}

function scheduleBaselineLayoutSync() {
    if (typeof AppState === "undefined") {
        return;
    }
    if (baselineLayoutRaf !== null) {
        return;
    }
    baselineLayoutRaf = requestAnimationFrame(() => {
        baselineLayoutRaf = null;
        if (AppState.currentTab === 'production' && (AppState.productionSubtab === 'investments' || AppState.productionSubtab === 'banking')) {
            const containerId = AppState.productionSubtab === 'banking'
                ? 'production-banking-subtab'
                : 'production-investments-subtab';
            const container = document.getElementById(containerId);
            if (container) {
                syncProductionBaselineLayout(container);
            }
        }
    });
}

window.addEventListener('resize', scheduleBaselineLayoutSync);

function ensureBaselineStateInitialized(data) {
    if (!data) return;
    ['investments', 'banking'].forEach(mode => {
        const baselineState = getProductionBaselineState(mode);
        if (!baselineState) return;
        const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
        const period = baselineState.period || 12;
        const averages = computeProductionBaselineAverages(data, months, period, mode);

        if (mode === 'banking') {
            ADDITIONAL_PRODUCTS.forEach(product => {
                if (baselineState.productivity[product] == null) {
                    baselineState.productivity[product] = Number(toNumber(averages.productivity?.[product], 0).toFixed(2));
                }
                if (baselineState.abpa[product] == null) {
                    baselineState.abpa[product] = Math.round(toNumber(averages.abpa?.[product], 0));
                }
            });
            return;
        }

        if (baselineState.productivity == null) {
            baselineState.productivity = Number(toNumber(averages.productivity, 0).toFixed(2));
        }
        PRODUCTS.forEach(product => {
            if (baselineState.mix[product] == null) {
                baselineState.mix[product] = toNumber(averages.mix[product], 0);
            }
            if (baselineState.abpa[product] == null) {
                baselineState.abpa[product] = Math.round(toNumber(averages.abpa[product], 0));
            }
        });
        if (baselineState.deepeningPercent == null) {
            baselineState.deepeningPercent = toNumber(averages.deepeningPercent, 0);
        }
    });
}

window.ensureBaselineStateInitialized = ensureBaselineStateInitialized;

function initializeProductionToolbar() {
    const toolbar = document.getElementById('production-toolbar');
    if (!toolbar) return;

    toolbar.querySelectorAll('.baseline-subtab').forEach(button => {
        button.addEventListener('click', () => {
            const target = button.dataset.subtab;
            if (target) {
                switchProductionSubtab(target);
            }
        });
    });

    const adminBtn = document.getElementById('production-admin-btn');
    if (adminBtn) {
        adminBtn.addEventListener('click', () => {
            const versionId = AppState.currentVersion ? AppState.currentVersion.version_id : null;
            openProductionAdminModal(versionId);
        });
    }

    toolbar.querySelectorAll('.baseline-subtab').forEach(button => {
        button.classList.toggle('active', button.dataset.subtab === AppState.productionSubtab);
    });
}
function initializeProductionConfigSync() {
    if (window.__productionConfigSyncInitialized) {
        return;
    }
    window.__productionConfigSyncInitialized = true;
    try {
        const bc = new BroadcastChannel('productionConfig');
        bc.onmessage = (event) => {
            const payload = event.data || {};
            const versionId = Number(payload.versionId);
            if (!Number.isFinite(versionId)) return;
            if (!AppState.currentVersion || AppState.currentVersion.version_id !== versionId) return;
            loadProductionConfig(versionId)
                .then(() => {
                    if (AppState.currentTab === 'production') {
                        const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
                        const teamKey = `Team ${AppState.currentTeam}`;
                        const data = AppState.teamData[AppState.currentForecast]?.[teamKey];
                        if (data && months.length) {
                            applyProductionBaselines({
                                data,
                                months,
                                teamId: AppState.currentTeam,
                                updateDom: AppState.productionSubtab === 'investments'
                            });
                        }
                    }
                })
                .catch(err => console.error('Failed to refresh production config', err));
        };
        window.__productionConfigBC = bc;

    } catch (error) {
        window.addEventListener('storage', (event) => {
            if (event.key !== 'production_config_updated') return;
            try {
                const payload = JSON.parse(event.newValue || '{}');
                const versionId = Number(payload?.versionId);
                if (!Number.isFinite(versionId)) return;
                if (!AppState.currentVersion || AppState.currentVersion.version_id !== versionId) return;
                loadProductionConfig(versionId)
                    .then(() => {
                        if (AppState.currentTab === 'production') {
                            const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
                            const teamKey = `Team ${AppState.currentTeam}`;
                            const data = AppState.teamData[AppState.currentForecast]?.[teamKey];
                            if (data && months.length) {
                                applyProductionBaselines({
                                    data,
                                    months,
                                    teamId: AppState.currentTeam,
                                    updateDom: AppState.productionSubtab === 'investments'
                                });
                            }
                        }
                    })
                    .catch(err => console.error('Failed to refresh production config via storage event', err));
            } catch (err) {
                console.error('Failed to parse production config storage event', err);
            }
        });
    }
}
