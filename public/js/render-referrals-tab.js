// public/js/render-referrals-tab.js
(function () {
    if (typeof window === 'undefined') {
        return;
    }

    const DEFAULT_TOTAL_RATIO = typeof window.REFERRAL_DEFAULT_TOTAL_RATIO === 'number'
        ? window.REFERRAL_DEFAULT_TOTAL_RATIO
        : 1.2;
    const DEFAULT_WINS_RATIO = typeof window.REFERRAL_DEFAULT_WINS_RATIO === 'number'
        ? window.REFERRAL_DEFAULT_WINS_RATIO
        : 0.3;
    const DEFAULT_PRODUCTIVITY_GROWTH = typeof window.REFERRAL_DEFAULT_PRODUCTIVITY_GROWTH === 'number'
        ? window.REFERRAL_DEFAULT_PRODUCTIVITY_GROWTH
        : 0.01;

    function getOutboundFlows() {
        return Array.isArray(window.REFERRAL_OUTBOUND_FLOWS)
            ? window.REFERRAL_OUTBOUND_FLOWS
            : [];
    }

    function getInboundFlows() {
        return Array.isArray(window.REFERRAL_INBOUND_FLOWS)
            ? window.REFERRAL_INBOUND_FLOWS
            : [];
    }

    function getDefaultReferralConfig() {
        const totals = {};
        const wins = {};
        getOutboundFlows().forEach(flow => {
            const key = flow.key || flow;
            totals[key] = DEFAULT_TOTAL_RATIO;
            wins[key] = DEFAULT_WINS_RATIO;
        });
        return {
            totalToQuality: totals,
            winsToQuality: wins,
            productivityGrowth: DEFAULT_PRODUCTIVITY_GROWTH,
            versionId: null
        };
    }

    async function loadReferralConfig(versionId) {
        if (!versionId) {
            AppState.referralConfig = { ...getDefaultReferralConfig(), versionId: null };
            return AppState.referralConfig;
        }
        if (AppState.referralConfig && AppState.referralConfig.versionId === versionId) {
            return AppState.referralConfig;
        }
        try {
            const response = await API.referralConfig.get(versionId);
            const totals = {};
            const wins = {};
            getOutboundFlows().forEach(flow => {
                const key = flow.key || flow;
                const totalValue = Number(response.totalToQuality?.[key]);
                const winsValue = Number(response.winsToQuality?.[key]);
                totals[key] = Number.isFinite(totalValue) ? totalValue : DEFAULT_TOTAL_RATIO;
                wins[key] = Number.isFinite(winsValue) ? winsValue : DEFAULT_WINS_RATIO;
            });
            AppState.referralConfig = {
                totalToQuality: totals,
                winsToQuality: wins,
                productivityGrowth: Number.isFinite(Number(response.productivityGrowth))
                    ? Number(response.productivityGrowth)
                    : DEFAULT_PRODUCTIVITY_GROWTH,
                versionId
            };
        } catch (error) {
            console.error('Failed to load referral configuration', error);
            AppState.referralConfig = { ...getDefaultReferralConfig(), versionId };
        }
        return AppState.referralConfig;
    }

    function getReferralBaselineKey() {
        const versionId = AppState.currentVersion ? AppState.currentVersion.version_id : 'na';
        const teamId = AppState.currentTeam || 'na';
        return `${versionId}|team:${teamId}`;
    }

    function getReferralBaselineState() {
        AppState.referralBaselineState = AppState.referralBaselineState || {};
        const key = getReferralBaselineKey();
        if (!AppState.referralBaselineState[key]) {
            AppState.referralBaselineState[key] = { flows: {} };
        }
        return AppState.referralBaselineState[key];
    }

    function computeReferralBaselineAverage(data, flowKey, months, period = 12) {
        if (!data || !months || !months.length) return DEFAULT_TOTAL_RATIO;
        const actualMonths = months.filter(month => data.forecastStatus[month] !== 'Forecast');
        const slice = actualMonths.slice(-period);
        if (!slice.length) {
            return DEFAULT_TOTAL_RATIO;
        }
        let sum = 0;
        let count = 0;
        slice.forEach(month => {
            const value = Number.parseFloat(
                data.referrals?.outbound?.[flowKey]?.productivity?.[month] || 0
            );
            if (Number.isFinite(value)) {
                sum += value;
                count += 1;
            }
        });
        return count ? Number((sum / count).toFixed(2)) : DEFAULT_TOTAL_RATIO;
    }

    function ensureReferralBaselineState(data, months) {
        const baselineState = getReferralBaselineState();
        getOutboundFlows().forEach(flow => {
            const key = flow.key || flow;
            if (!baselineState.flows[key]) {
                baselineState.flows[key] = {};
            }
            if (!Number.isFinite(Number(baselineState.flows[key].value))) {
                baselineState.flows[key].value = computeReferralBaselineAverage(data, key, months);
            }
        });
    }

    function computeHeadcountByMonth(data, months) {
        const map = {};
        months.forEach(month => {
            const total = PG_LEVELS.reduce((sum, pg) => {
                const cell = Number(data.pgLevels?.[pg]?.[month] || 0);
                return sum + (Number.isFinite(cell) ? cell : 0);
            }, 0);
            map[month] = total;
        });
        return map;
    }

    function formatSigned(value) {
        if (!Number.isFinite(value)) return '0.00';
        return value.toFixed(2);
    }

    function getYearFromMonthKey(monthKey) {
        if (!monthKey) {
            return null;
        }
        const parts = monthKey.split('-');
        if (parts.length < 2) {
            return null;
        }
        const yearSegment = parts[1];
        const numericYear = yearSegment.length === 2 ? `20${yearSegment}` : yearSegment;
        const parsed = parseInt(numericYear, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getFirstForecastYear(data, months) {
        if (!data || !Array.isArray(months)) {
            return null;
        }
        const firstForecastMonth = months.find(month => data.forecastStatus?.[month] === 'Forecast');
        return getYearFromMonthKey(firstForecastMonth);
    }

    function renderSectionDivider(totalColumns, title, options = {}) {
        const { variant = 'light', sublabel = '' } = options;
        const classes = ['referrals-section-divider'];
        if (variant === 'dark') {
            classes.push('referrals-section-divider--dark');
        }
        return `
            <tr class="${classes.join(' ')}"
                data-divider-label="${title}"
                data-divider-sublabel="${sublabel}">
                <td colspan="${totalColumns}" aria-hidden="true">&nbsp;</td>
            </tr>
        `;
    }



    function renderReferralBaselineColumn() {
        return '';
    }

    function initializeReferralDividerOverlay(root) {
        const container = root.querySelector('.referrals-table-container');
        if (!container) {
            return;
        }
        const overlay = container.querySelector('.referrals-table-overlay');
        const wrapper = container.querySelector('.data-table-wrapper');
        const table = wrapper?.querySelector('table');
        if (!overlay || !wrapper || !table) {
            return;
        }
        overlay.innerHTML = '';

        const wrapperOffset = wrapper.offsetTop;
        const rows = table.querySelectorAll('tr.referrals-section-divider');
        rows.forEach(row => {
            const label = row.dataset.dividerLabel || '';
            const sublabel = row.dataset.dividerSublabel || '';
            const offsetTop = wrapperOffset + row.offsetTop;
            const band = document.createElement('div');
            band.className = 'referrals-divider-band';
            if (row.classList.contains('referrals-section-divider--dark')) {
                band.classList.add('referrals-divider-band--dark');
            }
            band.style.top = `${offsetTop}px`;
            band.innerHTML = `
                <span class="referrals-divider-band__title">${label}</span>
                ${sublabel ? `<span class="referrals-divider-band__subtitle">${sublabel}</span>` : ''}
            `;
            overlay.appendChild(band);
        });
    }

    function attachReferralBaselineEvents(root) {
        const baselineState = getReferralBaselineState();
        root.querySelectorAll('.referral-baseline-input').forEach(input => {
            if (input.dataset.baselineBound === 'true') {
                return;
            }
            input.dataset.baselineBound = 'true';
            if (input.disabled) {
                return;
            }
            input.addEventListener('change', async event => {
                const key = event.target.dataset.flowKey;
                if (!key) return;
                const raw = Number.parseFloat(event.target.value);
                const value = Number.isFinite(raw)
                    ? raw
                    : Number(baselineState.flows[key]?.value) || DEFAULT_TOTAL_RATIO;

                if (!baselineState.flows[key]) {
                    baselineState.flows[key] = {};
                }
                baselineState.flows[key].value = value;
                event.target.value = formatSigned(value);

                event.target.classList.add('is-applying');
                try {
                    await applyReferralBaselineFlow(key);
                } catch (error) {
                    console.error('Failed to apply referral baseline', error);
                    showError('Failed to apply baseline productivity');
                } finally {
                    event.target.classList.remove('is-applying');
                }
            });
        });
    }

    async function applyReferralBaselineFlow(flowKey) {
        if (!flowKey || !AppState.currentVersion) {
            return;
        }
        const teamId = AppState.currentTeam;
        const teamKey = `Team ${teamId}`;
        const data = AppState.teamData?.[AppState.currentForecast]?.[teamKey];
        if (!data || AppState.isGroupView) {
            return;
        }

        const baselineState = getReferralBaselineState();
        const baselineValue = Number.parseFloat(baselineState.flows?.[flowKey]?.value);
        if (!Number.isFinite(baselineValue)) {
            return;
        }

        const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
        const forecastMonths = months.filter(month => data.forecastStatus[month] === 'Forecast');
        if (!forecastMonths.length) {
            return;
        }

        const config = AppState.referralConfig || getDefaultReferralConfig();
        const firstForecastYear = forecastMonths.length
            ? parseInt(`20${forecastMonths[0].split('-')[1]}`, 10)
            : null;

        const updates = [];
        forecastMonths.forEach(month => {
            const [, yearSuffix] = month.split('-');
            const fullYear = parseInt(`20${yearSuffix}`, 10);
            const yearDiff = Number.isFinite(fullYear) && Number.isFinite(firstForecastYear)
                ? Math.max(0, fullYear - firstForecastYear)
                : 0;
            const growthMultiplier = Math.pow(1 + (config.productivityGrowth || 0), yearDiff);
            const newValue = Number((baselineValue * growthMultiplier).toFixed(2));
            data.referrals.outbound[flowKey].productivity[month] = newValue.toFixed(2);
            updateReferralCalculations(teamId, month, flowKey);
            updates.push({
                teamId: Number(teamId),
                periodDate: getPeriodDate(month),
                field: `ref_out_${flowKey}_prod`,
                newValue
            });
        });

        if (updates.length) {
            await API.forecasts.bulkUpdate({
                updates,
                versionId: AppState.currentVersion.version_id,
                updatedBy: AppState.currentUser
            });
            showSaveIndicator();
        }
    }

    function renderReferralsTableHeader(data, months) {
        let html = '<thead><tr><th rowspan="2">Metric</th>';
        months.forEach((month, idx) => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const className = isForecast ? 'forecast-col' : 'actual-col';
            const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
            html += `<th class="${className}">${businessDays}</th>`;
        });
        if (Array.isArray(QUARTERS)) {
            QUARTERS.forEach(() => {
                html += '<th class="quarter-col">Total</th>';
            });
        }
        if (Array.isArray(YEARS)) {
            YEARS.forEach(year => {
                html += `<th class="year-total-col">FY${year.slice(-2)}</th>`;
            });
        }
        html += '</tr><tr>';
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const className = isForecast ? 'forecast-col' : 'actual-col';
            html += `<th class="${className}">${month}</th>`;
        });
        if (Array.isArray(QUARTERS)) {
            QUARTERS.forEach(quarter => {
                html += `<th class="quarter-col">${quarter}</th>`;
            });
        }
        if (Array.isArray(YEARS)) {
            YEARS.forEach(() => {
                html += '<th class="year-total-col">Total</th>';
            });
        }
        html += '</tr></thead>';
        return html;
    }

    function renderHeadcountRow(data, months, headcountByMonth) {
        let html = '<tr class="referrals-row referrals-row--headcount"><td>Total Productive HC</td>';
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const className = isForecast ? 'forecast-col' : 'actual-col';
            html += `<td class="${className}">${formatNumber(headcountByMonth[month] || 0)}</td>`;
        });
        if (Array.isArray(QUARTERS)) {
            QUARTERS.forEach(quarter => {
                const avg = calculateQuarterAverage(headcountByMonth, quarter);
                html += `<td class="quarter-col">${formatNumber(avg)}</td>`;
            });
        }
        if (Array.isArray(YEARS)) {
            YEARS.forEach(year => {
                const avg = calculateYearAverage(headcountByMonth, months, year);
                html += `<td class="year-total-col">${formatNumber(avg)}</td>`;
            });
        }
        html += '</tr>';
        return html;
    }

    function renderQualityRow(label, flowKey, data, months, headcountByMonth, storage, opts = {}) {
        const isInbound = opts.isInbound;
        const baseline = opts.baseline || null;
        const showBaselineHeader = Boolean(opts.showBaselineHeader);
        let trimmedLabel = label;
        if (trimmedLabel.endsWith('Quality Referrals')) {
            trimmedLabel = trimmedLabel.replace(/ Quality Referrals$/, '');
        }
        let metricLabel = `<span class="metric-label-text">${trimmedLabel}</span>`;
        if (baseline) {
            const avg = formatSigned(baseline.avg);
            const value = formatSigned(baseline.value);
            const disabledAttr = baseline.canEdit ? '' : 'disabled';
            metricLabel = `
                <div class="referral-metric-label">
                    <div class="referral-baseline-inline" data-flow="${baseline.flowKey}">
                        <div class="referral-baseline-inline__avg" title="12-month run rate">${avg}</div>
                        <div class="referral-baseline-inline__input">
                            <input type="number"
                                   step="0.01"
                                   value="${value}"
                                   data-flow-key="${baseline.flowKey}"
                                   class="referral-baseline-input selectable-input"
                                   ${disabledAttr}>
                        </div>
                        <span class="metric-label-text">${trimmedLabel}</span>
                    </div>
                    </div>
                </div>`;
        }
        const config = AppState.referralConfig || getDefaultReferralConfig();
        const productivityGrowth = Number(config.productivityGrowth) || 0;
        const firstForecastYear = getFirstForecastYear(data, months);

        let html = `<tr class="referrals-row referrals-row--quality"><td>${metricLabel}</td>`;
        months.forEach((month, idx) => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const classNameBase = isForecast ? 'forecast-col' : 'actual-col';
            const className = isInbound && isForecast
                ? `${classNameBase} disabled-forecast`
                : `${classNameBase} calculated-value`;
            const businessDays = window.BUSINESS_DAYS?.[idx] || 21;
            const headcount = headcountByMonth[month] || 0;
            const productivitySource = isInbound
                ? data.referrals.inbound[flowKey]?.productivity
                : data.referrals.outbound[flowKey]?.productivity;
            let productivity = Number.parseFloat(productivitySource?.[month] || 0) || 0;
            if (!isInbound && isForecast && (!Number.isFinite(productivity) || productivity === 0) && baseline) {
                const baselineValue = Number(baseline.value);
                const targetYear = getYearFromMonthKey(month);
                if (Number.isFinite(baselineValue) && Number.isFinite(targetYear) && Number.isFinite(firstForecastYear)) {
                    const yearDiff = Math.max(0, targetYear - firstForecastYear);
                    const growthMultiplier = Math.pow(1 + productivityGrowth, yearDiff);
                    const derivedProductivity = Number((baselineValue * growthMultiplier).toFixed(2));
                    if (Number.isFinite(derivedProductivity)) {
                        productivity = derivedProductivity;
                        if (data.referrals.outbound[flowKey]) {
                            data.referrals.outbound[flowKey].productivity[month] = derivedProductivity.toFixed(2);
                        }
                    }
                }
            }
            let referrals = null;
            const storedQuality = isInbound
                ? Number(data.referrals.inbound[flowKey]?.qualityReferrals?.[month])
                : Number(data.referrals.outbound[flowKey]?.qualityReferrals?.[month]);

            if (isInbound) {
                if (!isForecast && Number.isFinite(storedQuality)) {
                    referrals = Math.round(storedQuality);
                } else if (!isForecast) {
                    referrals = Math.round((headcount * productivity * businessDays) / 5);
                } else {
                    referrals = 0;
                }
            } else {
                if (!isForecast && Number.isFinite(storedQuality)) {
                    referrals = Math.round(storedQuality);
                } else if (!isForecast) {
                    referrals = Math.round((headcount * productivity * businessDays) / 5);
                } else {
                    referrals = Math.round((headcount * productivity * businessDays) / 5);
                    if (!data.referrals.outbound[flowKey].qualityReferrals) {
                        data.referrals.outbound[flowKey].qualityReferrals = {};
                    }
                    data.referrals.outbound[flowKey].qualityReferrals[month] = referrals;
                }
            }

            if (!isInbound) {
                storage[month] = Number.isFinite(referrals) ? referrals : 0;
            } else {
                storage[month] = Number.isFinite(referrals) ? referrals : 0;
            }
            const cellId = isInbound
                ? `referral-inbound-${flowKey}-${month}`
                : `referral-quality-${flowKey}-${month}`;
            const displayValue = referrals == null ? '--' : formatNumber(referrals);
            html += `<td class="${className}" id="${cellId}">${displayValue}</td>`;
        });

        const extraCols = (Array.isArray(QUARTERS) ? QUARTERS.length : 0) + (Array.isArray(YEARS) ? YEARS.length : 0);
        if (!isInbound) {
            if (Array.isArray(QUARTERS)) {
                QUARTERS.forEach(quarter => {
                    const total = calculateQuarterSum(storage, quarter);
                    html += `<td class="quarter-col">${formatNumber(total)}</td>`;
                });
            }
            if (Array.isArray(YEARS)) {
                YEARS.forEach(year => {
                    const total = calculateYearSum(storage, months, year);
                    html += `<td class="year-total-col">${formatNumber(total)}</td>`;
                });
            }
        } else {
            for (let i = 0; i < extraCols; i++) {
                const isYear = Array.isArray(QUARTERS) && i >= QUARTERS.length;
                html += `<td class="${isYear ? 'year-total-col' : 'quarter-col'}">-</td>`;
            }
        }
        html += '</tr>';
        return html;
    }

    function renderDerivedRow(label, flowKey, months, sourceMap, data, type) {
        const config = AppState.referralConfig || getDefaultReferralConfig();
        const ratioMap = type === 'wins' ? config.winsToQuality : config.totalToQuality;
        const defaultRatio = type === 'wins' ? DEFAULT_WINS_RATIO : DEFAULT_TOTAL_RATIO;
        const dataStore = type === 'wins'
            ? data.referrals.outbound[flowKey].wonActuals
            : data.referrals.outbound[flowKey].totalActuals;
        let html = `<tr class="referrals-row referrals-row--derived"><td>${label}</td>`;
        const monthValues = {};
        months.forEach(month => {
            const isForecast = data.forecastStatus[month] === 'Forecast';
            const className = isForecast ? 'forecast-col calculated-value' : 'actual-col calculated-value';
            let value = Number(dataStore[month]) || 0;
            if (isForecast) {
                const ratio = ratioMap?.[flowKey] ?? defaultRatio;
                const quality = sourceMap[month] || 0;
                value = Math.round(quality * ratio);
                dataStore[month] = value;
            }
            monthValues[month] = value;
            const cellId = type === 'wins'
                ? `referral-won-${flowKey}-${month}`
                : `referral-total-${flowKey}-${month}`;
            html += `<td class="${className}" id="${cellId}">${formatNumber(value)}</td>`;
        });

        if (Array.isArray(QUARTERS)) {
            QUARTERS.forEach(quarter => {
                const total = calculateQuarterSum(monthValues, quarter);
                html += `<td class="quarter-col">${formatNumber(total)}</td>`;
            });
        }
        if (Array.isArray(YEARS)) {
            YEARS.forEach(year => {
                const total = calculateYearSum(monthValues, months, year);
                html += `<td class="year-total-col">${formatNumber(total)}</td>`;
            });
        }
        html += '</tr>';
        return html;
    }

    function renderReferralsTable(data, months, headcountByMonth) {
        const outboundFlows = getOutboundFlows();
        const inboundFlows = getInboundFlows();
        const baselineState = getReferralBaselineState();
        const canEditBaseline = !AppState.isGroupView &&
            AppState.currentVersion &&
            AppState.currentVersion.version_id === 2;
        const totalColumns = 1 + months.length +
            (Array.isArray(QUARTERS) ? QUARTERS.length : 0) +
            (Array.isArray(YEARS) ? YEARS.length : 0);
        let body = '';
        body += renderHeadcountRow(data, months, headcountByMonth);
        body += renderSectionDivider(totalColumns, 'Outbound Quality Referrals', {
            variant: 'dark',
            sublabel: 'Baseline Productivity (12-mo avg)'
        });

        const qualityMaps = {};
        outboundFlows.forEach(flow => {
            const key = flow.key || flow;
            qualityMaps[key] = {};
            if (!baselineState.flows[key]) {
                baselineState.flows[key] = {};
            }
            const avg = computeReferralBaselineAverage(data, key, months);
            const storedValue = Number.isFinite(Number(baselineState.flows[key].value))
                ? Number(baselineState.flows[key].value)
                : avg;
            baselineState.flows[key].value = storedValue;
            const baselineInfo = {
                avg,
                value: storedValue,
                canEdit: canEditBaseline,
                flowKey: key
            };
            body += renderQualityRow(
                `${flow.label} Quality Referrals`,
                key,
                data,
                months,
                headcountByMonth,
                qualityMaps[key],
                {
                    baseline: baselineInfo,
                    showBaselineHeader: flow === outboundFlows[0]
                }
            );
        });

        body += renderSectionDivider(totalColumns, 'Inbound Quality (actuals only)', { variant: 'dark' });

        inboundFlows.forEach(flow => {
            const key = flow.key || flow;
            const inboundStore = {};
            body += renderQualityRow(`${flow.label} Referrals`, key, data, months, headcountByMonth, inboundStore, { isInbound: true });
        });

        body += renderSectionDivider(totalColumns, 'Outbound Totals (ratios applied)', { variant: 'dark' });
        outboundFlows.forEach(flow => {
            const key = flow.key || flow;
            const qualityStore = qualityMaps[key] || {};
            body += renderDerivedRow(`${flow.label} Total Referrals`, key, months, qualityStore, data, 'total');
        });

        body += renderSectionDivider(totalColumns, 'Outbound Won (ratios applied)', { variant: 'dark' });
        outboundFlows.forEach(flow => {
            const key = flow.key || flow;
            const qualityStore = qualityMaps[key] || {};
            body += renderDerivedRow(`${flow.label} Won Referrals`, key, months, qualityStore, data, 'wins');
        });

        const tableHeader = renderReferralsTableHeader(data, months);
        return `
            <div class="referrals-table-container">
                <div class="referrals-table-overlay" aria-hidden="true"></div>
                <div class="data-table-wrapper">
                    <table class="data-table referrals-table">
                        ${tableHeader}
                        <tbody>${body}</tbody>
                    </table>
                </div>
            </div>`;
    }

    async function renderReferralsTab(data) {
        const container = document.getElementById('referrals-tab');
        if (!container) {
            return;
        }
        const months = typeof generateMonthList === 'function' ? generateMonthList() : [];
        if (!months.length) {
            container.innerHTML = '<div class="error">Unable to build referrals view. No months configured.</div>';
            return;
        }

        container.innerHTML = '<div class="loading">Loading referrals data...</div>';
        const versionId = AppState.currentVersion ? AppState.currentVersion.version_id : null;
        await loadReferralConfig(versionId);
        ensureReferralBaselineState(data, months);
        const headcountByMonth = computeHeadcountByMonth(data, months);
        const layoutClass = 'production-layout production-layout--single-column';
        const tableHtml = renderReferralsTable(data, months, headcountByMonth);
        container.innerHTML = `<div class="${layoutClass}">${tableHtml}</div>`;
        attachReferralBaselineEvents(container);
        initializeReferralDividerOverlay(container);
    }

    function initializeReferralConfigSync() {
        if (window.__referralConfigSyncInitialized) {
            return;
        }
        window.__referralConfigSyncInitialized = true;

        const handleRefresh = (versionId) => {
            if (!AppState.currentVersion || AppState.currentVersion.version_id !== versionId) {
                return;
            }
            const teamKey = `Team ${AppState.currentTeam}`;
            const data = AppState.teamData?.[AppState.currentForecast]?.[teamKey];
            if (!data) {
                return;
            }
            loadReferralConfig(versionId)
                .then(() => {
                    if (AppState.currentTab === 'referrals') {
                        renderReferralsTab(data);
                    }
                })
                .catch(err => console.error('Failed to refresh referral config', err));
        };

        try {
            const channel = new BroadcastChannel('referralConfig');
            channel.onmessage = event => {
                const versionId = Number(event.data?.versionId);
                if (Number.isFinite(versionId)) {
                    handleRefresh(versionId);
                }
            };
            window.__referralConfigBC = channel;
        } catch (error) {
            window.addEventListener('storage', event => {
                if (event.key !== 'referral_config_updated') return;
                try {
                    const payload = JSON.parse(event.newValue || '{}');
                    const versionId = Number(payload.versionId);
                    if (Number.isFinite(versionId)) {
                        handleRefresh(versionId);
                    }
                } catch (err) {
                    console.error('Failed to parse referral config storage event', err);
                }
            });
        }
    }

    window.renderReferralsTab = renderReferralsTab;
    window.getDefaultReferralConfig = getDefaultReferralConfig;
    window.initializeReferralConfigSync = initializeReferralConfigSync;
})();
