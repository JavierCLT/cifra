// server.js - Main Express server with dual database architecture
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import configuration and utilities
const config = require('./config/database');
const logger = require('./utils/logger');
const { rejectIfVersionLocked } = require('./utils/forecast-guards');

// Import routes
const teamsRoutes = require('./routes/teams');
const forecastsRoutes = require('./routes/forecasts');
const actualsRoutes = require('./routes/actuals');
const incentivesRoutes = require('./routes/incentives');
const nonSalesRoutes = require('./routes/nonSales');
const productionConfigRoutes = require('./routes/productionConfig');
const referralConfigRoutes = require('./routes/referralConfig');

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"], // This line allows inline event handlers
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'"],
        },
    },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.app.rateLimitWindowMs,
    max: config.app.rateLimitMaxRequests,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Middleware
app.use(cors({
    origin: config.app.corsOrigin,
    credentials: true
}));
app.use(compression());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});

// Create database connection pools
let actualsPool, forecastPool;

const normalizeDateKey = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

async function initializeDatabases() {
    try {
        // Create connection pools
        actualsPool = mysql.createPool(config.actualsDb);
        forecastPool = mysql.createPool(config.forecastDb);
        
        // Test connections
        const actualsConn = await actualsPool.getConnection();
        logger.info('Mock actuals database connected successfully');
        actualsConn.release();
        
        const forecastConn = await forecastPool.getConnection();
        logger.info('Forecast database connected successfully');
        forecastConn.release();
        
        // Make pools available to routes
        app.locals.actualsPool = actualsPool;
        app.locals.forecastPool = forecastPool;
        
    } catch (error) {
        logger.error('Database connection failed:', error);
        process.exit(1);
    }
}

// Routes
app.use('/api/teams', teamsRoutes);
app.use('/api/forecasts', forecastsRoutes);
app.use('/api/actuals', actualsRoutes);
app.use('/api/incentives', incentivesRoutes);
app.use('/api/non-sales', nonSalesRoutes);
app.use('/api/production-config', productionConfigRoutes);
app.use('/api/referral-config', referralConfigRoutes);

// Combined data endpoint
app.get('/api/team-data/:teamId/:versionId', async (req, res) => {
    try {
        const { teamId, versionId } = req.params;
        const { startDate, endDate } = req.query;
        
        // Validate inputs
        if (!teamId || !versionId) {
            return res.status(400).json({ error: 'Team ID and Version ID are required' });
        }
        
        // Get forecast version details
        const [versionRows] = await forecastPool.query(
            'SELECT * FROM forecast_versions WHERE version_id = ?',
            [versionId]
        );
        
        if (versionRows.length === 0) {
            return res.status(404).json({ error: 'Forecast version not found' });
        }
        
        const forecastStartDate = versionRows[0].forecast_start_date;
        const dateRange = {
            start: startDate || '2023-01-01',
            end: endDate || '2025-12-31'
        };
        
        // Get actuals data (before forecast start date)
        const deepeningRatioExpr = `0.10 + (MOD(ABS(CONV(SUBSTRING(MD5(CONCAT(a.team_id, '-', DATE_FORMAT(a.period_date,'%Y-%m-%d'), '-deep')),1,8),16,10)),1501)/10000)`;
        const totalBalanceExpr = `
            (
                (
                    (a.pg1_headcount + a.pg2_headcount + a.pg3_headcount + a.pg4_headcount + a.pg5_headcount + a.pg6_headcount + a.pg7_headcount)
                    * a.productivity
                    * a.business_days
                ) / 5
            ) * (
                (a.product_a_mix * a.product_a_abpa) +
                (a.product_b_mix * a.product_b_abpa) +
                (a.product_c_mix * a.product_c_abpa) +
                (a.product_d_mix * a.product_d_abpa)
            )
        `;

        const [actualsData] = await actualsPool.query(
            `SELECT 
                a.*,
                ${totalBalanceExpr} AS total_balance_calc,
                ${deepeningRatioExpr} AS deepening_percent,
                (${totalBalanceExpr}) * ${deepeningRatioExpr} AS deepening_amount
             FROM v_actuals_for_api a
             WHERE a.team_id = ? 
             AND a.period_date >= ? 
             AND a.period_date < ?
             ORDER BY a.period_date`,
            [teamId, dateRange.start, forecastStartDate]
        );
        
        // Get forecast data
        const [forecastData] = await forecastPool.query(
            `SELECT 
                fd.*,
                DATE_FORMAT(fd.period_date, '%b-%y') as period_string,
                'forecast' as data_type,
                -- Get business days from actuals database
                21 as business_days -- Default, should join with actuals calendar
             FROM v_forecast_metrics fd
             WHERE fd.team_id = ? 
             AND fd.version_id = ? 
             AND fd.period_date >= ?
             AND fd.period_date <= ?
             ORDER BY fd.period_date`,
            [teamId, versionId, forecastStartDate, dateRange.end]
        );
        if (forecastData.length) {
            const periodDates = [...new Set(
                forecastData
                    .map(row => normalizeDateKey(row.period_date))
                    .filter(Boolean)
            )];

            if (periodDates.length) {
                const placeholders = periodDates.map(() => '?').join(', ');
                const [calendarRows] = await actualsPool.query(
                    `SELECT period_date, business_days FROM business_days_calendar WHERE period_date IN (${placeholders})`,
                    periodDates
                );
                const businessDayMap = new Map(
                    calendarRows.map(row => {
                        const key = normalizeDateKey(row.period_date);
                        return [key, row.business_days];
                    })
                );

                forecastData.forEach(row => {
                    const key = normalizeDateKey(row.period_date);
                    if (key && businessDayMap.has(key)) {
                        row.business_days = businessDayMap.get(key);
                    }
                });
            }
        }

        
        // Fetch headcount flow data
        const [actualFlowRows] = await forecastPool.query(
            `SELECT period_date, starting_headcount, flow_1, flow_2, flow_3, flow_4, flow_5, ending_headcount
             FROM headcount_flows
             WHERE team_id = ? AND data_type = 'actual'
             ORDER BY period_date`,
            [teamId]
        );
        const actualFlowMap = new Map(actualFlowRows.map(row => [normalizeDateKey(row.period_date), row]));

        const [forecastFlowRows] = await forecastPool.query(
            `SELECT period_date, starting_headcount, flow_1, flow_2, flow_3, flow_4, flow_5, ending_headcount
             FROM headcount_flows
             WHERE team_id = ? AND data_type = 'forecast' AND version_id = ?
             ORDER BY period_date`,
            [teamId, versionId]
        );
        const forecastFlowMap = new Map(forecastFlowRows.map(row => [normalizeDateKey(row.period_date), row]));

        // Combine and format data
        const combinedData = [
            ...actualsData.map(row => {
                const key = normalizeDateKey(row.period_date);
                const flowRow = actualFlowMap.get(key) || {};
                const starting = Number(flowRow.starting_headcount ?? 0);
                const flows = [
                    Number(flowRow.flow_1 ?? 0),
                    Number(flowRow.flow_2 ?? 0),
                    Number(flowRow.flow_3 ?? 0),
                    Number(flowRow.flow_4 ?? 0),
                    Number(flowRow.flow_5 ?? 0)
                ];
                const ending = flowRow.ending_headcount != null
                    ? Number(flowRow.ending_headcount)
                    : starting + flows.reduce((sum, val) => sum + val, 0);

                return {
                    ...row,
                    version_id: parseInt(versionId),
                    version_name: versionRows[0].version_name,
                    starting_headcount: starting,
                    flow_1: flows[0],
                    flow_2: flows[1],
                    flow_3: flows[2],
                    flow_4: flows[3],
                    flow_5: flows[4],
                    ending_headcount: ending
                };
            }),
            ...forecastData.map(row => {
                const key = normalizeDateKey(row.period_date);
                const flowRow = forecastFlowMap.get(key) || {};
                const starting = Number(flowRow.starting_headcount ?? 0);
                const flows = [
                    Number(flowRow.flow_1 ?? 0),
                    Number(flowRow.flow_2 ?? 0),
                    Number(flowRow.flow_3 ?? 0),
                    Number(flowRow.flow_4 ?? 0),
                    Number(flowRow.flow_5 ?? 0)
                ];
                const ending = flowRow.ending_headcount != null
                    ? Number(flowRow.ending_headcount)
                    : starting + flows.reduce((sum, val) => sum + val, 0);

                return {
                    ...row,
                    starting_headcount: starting,
                    flow_1: flows[0],
                    flow_2: flows[1],
                    flow_3: flows[2],
                    flow_4: flows[3],
                    flow_5: flows[4],
                    ending_headcount: ending
                };
            })
        ];
        
        res.json({
            success: true,
            data: combinedData,
            metadata: {
                teamId: parseInt(teamId),
                versionId: parseInt(versionId),
                versionName: versionRows[0].version_name,
                forecastStartDate: forecastStartDate,
                recordCount: combinedData.length
            }
        });
        
    } catch (error) {
        logger.error('Error fetching team data:', error);
        res.status(500).json({ error: 'Failed to fetch team data' });
    }
});

// Group data endpoint
app.get('/api/group-data/:groupName/:versionId', async (req, res) => {
    try {
        const { groupName, versionId } = req.params;
        const { startDate, endDate } = req.query;
        
        // Get group teams from database instead of hardcoded
        const [groupTeams] = await forecastPool.query(
            `SELECT team_id FROM v_active_teams WHERE team_group = ?`,
            [groupName]
        );
        
        if (groupTeams.length === 0) {
            return res.status(400).json({ error: 'Invalid group name or no teams in group' });
        }
        
        const teamIds = groupTeams.map(t => t.team_id);
        
        // Get forecast version details
        const [versionRows] = await forecastPool.query(
            'SELECT * FROM forecast_versions WHERE version_id = ?',
            [versionId]
        );
        
        if (versionRows.length === 0) {
            return res.status(404).json({ error: 'Forecast version not found' });
        }
        
        const forecastStartDate = versionRows[0].forecast_start_date;
        const dateRange = {
            start: startDate || '2023-01-01',
            end: endDate || '2025-12-31'
        };
        
        // Get aggregated actuals data
        const teamPlaceholders = teamIds.map(() => '?').join(', ');
        const actualParams = [...teamIds, dateRange.start, forecastStartDate];

        const [actualsData] = await actualsPool.query(
            `SELECT 
                period_date,
                period_string,
                business_days,
                'actual' as data_type,
                SUM(pg1_headcount) as pg1_headcount,
                SUM(pg2_headcount) as pg2_headcount,
                SUM(pg3_headcount) as pg3_headcount,
                SUM(pg4_headcount) as pg4_headcount,
                SUM(pg5_headcount) as pg5_headcount,
                SUM(pg6_headcount) as pg6_headcount,
                SUM(pg7_headcount) as pg7_headcount,
                AVG(productivity) as productivity,
                AVG(product_a_mix) as product_a_mix,
                AVG(product_b_mix) as product_b_mix,
                AVG(product_c_mix) as product_c_mix,
                AVG(product_d_mix) as product_d_mix,
                AVG(product_a_abpa) as product_a_abpa,
                AVG(product_b_abpa) as product_b_abpa,
                AVG(product_c_abpa) as product_c_abpa,
                AVG(product_d_abpa) as product_d_abpa,
                SUM(ref_out_fsa_mlwm_quality) as ref_out_fsa_mlwm_quality,
                SUM(ref_out_fsa_mlwm_total) as ref_out_fsa_mlwm_total,
                SUM(ref_out_fsa_mlwm_won) as ref_out_fsa_mlwm_won,
                SUM(ref_out_mfsa_hl_quality) as ref_out_mfsa_hl_quality,
                SUM(ref_out_mfsa_hl_total) as ref_out_mfsa_hl_total,
                SUM(ref_out_mfsa_hl_won) as ref_out_mfsa_hl_won,
                SUM(ref_out_mfsa_sb_quality) as ref_out_mfsa_sb_quality,
                SUM(ref_out_mfsa_sb_total) as ref_out_mfsa_sb_total,
                SUM(ref_out_mfsa_sb_won) as ref_out_mfsa_sb_won,
                SUM(ref_out_fsa_bsa_quality) as ref_out_fsa_bsa_quality,
                SUM(ref_out_fsa_bsa_total) as ref_out_fsa_bsa_total,
                SUM(ref_out_fsa_bsa_won) as ref_out_fsa_bsa_won,
                SUM(ref_out_fsa_cvl_quality) as ref_out_fsa_cvl_quality,
                SUM(ref_out_fsa_cvl_total) as ref_out_fsa_cvl_total,
                SUM(ref_out_fsa_cvl_won) as ref_out_fsa_cvl_won,
                SUM(ref_out_fsa_hl_quality) as ref_out_fsa_hl_quality,
                SUM(ref_out_fsa_hl_total) as ref_out_fsa_hl_total,
                SUM(ref_out_fsa_hl_won) as ref_out_fsa_hl_won,
                SUM(ref_out_fsa_sb_quality) as ref_out_fsa_sb_quality,
                SUM(ref_out_fsa_sb_total) as ref_out_fsa_sb_total,
                SUM(ref_out_fsa_sb_won) as ref_out_fsa_sb_won,
                SUM(ref_in_merrill_ci_quality) as ref_in_merrill_ci_quality,
                SUM(ref_in_privatebank_ci_quality) as ref_in_privatebank_ci_quality,
                SUM(ref_in_centralized_quality) as ref_in_centralized_quality,
                SUM(ref_in_hl_ci_quality) as ref_in_hl_ci_quality,
                SUM(ref_in_csa_ci_quality) as ref_in_csa_ci_quality,
                SUM(ref_in_preferred_ci_quality) as ref_in_preferred_ci_quality,
                SUM(ref_in_bsa_ci_quality) as ref_in_bsa_ci_quality
             FROM v_actuals_for_api
             WHERE team_id IN (${teamPlaceholders})
             AND period_date >= ?
             AND period_date < ?
             GROUP BY period_date, period_string, business_days
             ORDER BY period_date`,
            actualParams
        );

        const forecastParams = [...teamIds, versionId, forecastStartDate, dateRange.end];
        const [forecastData] = await forecastPool.query(
            `SELECT 
                period_date,
                DATE_FORMAT(period_date, '%b-%y') as period_string,
                21 as business_days,
                'forecast' as data_type,
                SUM(pg1_headcount) as pg1_headcount,
                SUM(pg2_headcount) as pg2_headcount,
                SUM(pg3_headcount) as pg3_headcount,
                SUM(pg4_headcount) as pg4_headcount,
                SUM(pg5_headcount) as pg5_headcount,
                SUM(pg6_headcount) as pg6_headcount,
                SUM(pg7_headcount) as pg7_headcount,
                AVG(productivity) as productivity,
                AVG(product_a_mix) as product_a_mix,
                AVG(product_b_mix) as product_b_mix,
                AVG(product_c_mix) as product_c_mix,
                AVG(product_d_mix) as product_d_mix,
                AVG(product_a_abpa) as product_a_abpa,
                AVG(product_b_abpa) as product_b_abpa,
                AVG(product_c_abpa) as product_c_abpa,
                AVG(product_d_abpa) as product_d_abpa
             FROM forecast_data
             WHERE team_id IN (${teamPlaceholders})
             AND version_id = ?
             AND period_date >= ?
             AND period_date <= ?
             GROUP BY period_date
             ORDER BY period_date`,
            forecastParams
        );
        if (forecastData.length) {
            const periodDates = [...new Set(
                forecastData
                    .map(row => normalizeDateKey(row.period_date))
                    .filter(Boolean)
            )];

            if (periodDates.length) {
                const placeholders = periodDates.map(() => '?').join(', ');
                const [calendarRows] = await actualsPool.query(
                    `SELECT period_date, business_days FROM business_days_calendar WHERE period_date IN (${placeholders})`,
                    periodDates
                );
                const businessDayMap = new Map(
                    calendarRows.map(row => {
                        const key = normalizeDateKey(row.period_date);
                        return [key, row.business_days];
                    })
                );

                forecastData.forEach(row => {
                    const key = normalizeDateKey(row.period_date);
                    if (key && businessDayMap.has(key)) {
                        row.business_days = businessDayMap.get(key);
                    }
                });
            }
        }

        const actualFlowParams = [...teamIds, dateRange.start, forecastStartDate];
        const [actualFlowRows] = await forecastPool.query(
            `SELECT
                period_date,
                SUM(starting_headcount) AS starting_headcount,
                SUM(flow_1) AS flow_1,
                SUM(flow_2) AS flow_2,
                SUM(flow_3) AS flow_3,
                SUM(flow_4) AS flow_4,
                SUM(flow_5) AS flow_5,
                SUM(ending_headcount) AS ending_headcount
             FROM headcount_flows
             WHERE data_type = 'actual'
               AND team_id IN (${teamPlaceholders})
               AND period_date >= ?
               AND period_date < ?
             GROUP BY period_date
             ORDER BY period_date`,
            actualFlowParams
        );
        const actualFlowMap = new Map(actualFlowRows.map(row => [normalizeDateKey(row.period_date), row]));

        const forecastFlowParams = [...teamIds, versionId, forecastStartDate, dateRange.end];
        const [forecastFlowRows] = await forecastPool.query(
            `SELECT
                period_date,
                SUM(starting_headcount) AS starting_headcount,
                SUM(flow_1) AS flow_1,
                SUM(flow_2) AS flow_2,
                SUM(flow_3) AS flow_3,
                SUM(flow_4) AS flow_4,
                SUM(flow_5) AS flow_5,
                SUM(ending_headcount) AS ending_headcount
             FROM headcount_flows
             WHERE data_type = 'forecast'
               AND team_id IN (${teamPlaceholders})
               AND version_id = ?
               AND period_date >= ?
               AND period_date <= ?
             GROUP BY period_date
             ORDER BY period_date`,
            forecastFlowParams
        );
        const forecastFlowMap = new Map(forecastFlowRows.map(row => [normalizeDateKey(row.period_date), row]));

        // Combine data
        const combinedData = [
            ...actualsData.map(row => {
                const key = normalizeDateKey(row.period_date);
                const flowRow = actualFlowMap.get(key) || {};
                const starting = Number(flowRow.starting_headcount ?? 0);
                const flows = [
                    Number(flowRow.flow_1 ?? 0),
                    Number(flowRow.flow_2 ?? 0),
                    Number(flowRow.flow_3 ?? 0),
                    Number(flowRow.flow_4 ?? 0),
                    Number(flowRow.flow_5 ?? 0)
                ];
                const ending = flowRow.ending_headcount != null
                    ? Number(flowRow.ending_headcount)
                    : starting + flows.reduce((sum, val) => sum + val, 0);

                return {
                    ...row,
                    starting_headcount: starting,
                    flow_1: flows[0],
                    flow_2: flows[1],
                    flow_3: flows[2],
                    flow_4: flows[3],
                    flow_5: flows[4],
                    ending_headcount: ending
                };
            }),
            ...forecastData.map(row => {
                const key = normalizeDateKey(row.period_date);
                const flowRow = forecastFlowMap.get(key) || {};
                const starting = Number(flowRow.starting_headcount ?? 0);
                const flows = [
                    Number(flowRow.flow_1 ?? 0),
                    Number(flowRow.flow_2 ?? 0),
                    Number(flowRow.flow_3 ?? 0),
                    Number(flowRow.flow_4 ?? 0),
                    Number(flowRow.flow_5 ?? 0)
                ];
                const ending = flowRow.ending_headcount != null
                    ? Number(flowRow.ending_headcount)
                    : starting + flows.reduce((sum, val) => sum + val, 0);

                return {
                    ...row,
                    starting_headcount: starting,
                    flow_1: flows[0],
                    flow_2: flows[1],
                    flow_3: flows[2],
                    flow_4: flows[3],
                    flow_5: flows[4],
                    ending_headcount: ending
                };
            })
        ];
        
        res.json({
            success: true,
            data: combinedData,
            metadata: {
                groupName: groupName,
                teamCount: teamIds.length,
                versionId: parseInt(versionId),
                versionName: versionRows[0].version_name,
                recordCount: combinedData.length
            }
        });
        
    } catch (error) {
        logger.error('Error fetching group data:', error);
        res.status(500).json({ error: 'Failed to fetch group data' });
    }
});

const HEADCOUNT_FLOW_FIELDS = [
    'starting_headcount',
    'flow_1',
    'flow_2',
    'flow_3',
    'flow_4',
    'flow_5'
];

function buildHeadcountFlowUpdate(update) {
    const { teamId, periodDate, dataType, versionId, field, value } = update || {};
    if (teamId == null || periodDate == null || field == null) {
        return { error: 'teamId, periodDate, and field are required' };
    }

    if (!HEADCOUNT_FLOW_FIELDS.includes(field)) {
        return { error: `Invalid field: ${field}` };
    }

    const numericTeam = Number(teamId);
    if (!Number.isFinite(numericTeam)) {
        return { error: 'teamId must be numeric' };
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
        return { error: 'value must be a number' };
    }

    const normalizedType = dataType === 'actual' ? 'actual' : 'forecast';
    const normalizedVersion = normalizedType === 'forecast' ? Number(versionId) : 0;

    if (normalizedType === 'forecast' && (!Number.isFinite(normalizedVersion) || normalizedVersion === 0)) {
        return { error: 'versionId is required for forecast rows' };
    }

    const versionForSql = normalizedType === 'forecast' ? normalizedVersion : 0;

    const updateSql = `
        UPDATE headcount_flows
        SET ${field} = ?
        WHERE team_id = ? AND period_date = ? AND data_type = ? AND version_id = ?
    `;

    const updateParams = [
        numericValue,
        numericTeam,
        periodDate,
        normalizedType,
        versionForSql
    ];

    const insertColumns = HEADCOUNT_FLOW_FIELDS.join(', ');
    const placeholders = HEADCOUNT_FLOW_FIELDS.map(() => '?').join(', ');
    const flowValues = HEADCOUNT_FLOW_FIELDS.map(key => (key === field ? numericValue : 0));

    const insertSql = `
        INSERT INTO headcount_flows
            (team_id, period_date, period_label, data_type, version_id, ${insertColumns})
        VALUES (?, ?, DATE_FORMAT(?, '%b-%y'), ?, ?, ${placeholders})
    `;

    const insertParams = [
        numericTeam,
        periodDate,
        periodDate,
        normalizedType,
        versionForSql,
        ...flowValues
    ];

    return { updateSql, updateParams, insertSql, insertParams };
}

app.put('/api/headcount-flows', async (req, res) => {
    try {
        const prepared = buildHeadcountFlowUpdate(req.body);
        if (!prepared || prepared.error) {
            const message = prepared?.error || 'Invalid payload';
            return res.status(400).json({ success: false, error: message });
        }

        if (req.body?.dataType === 'forecast' || req.body?.dataType == null) {
            if (await rejectIfVersionLocked({ poolOrConnection: forecastPool, res, versionId: req.body?.versionId })) {
                return;
            }
        }

        const [updateResult] = await forecastPool.execute(prepared.updateSql, prepared.updateParams);
        if (updateResult.affectedRows === 0) {
            await forecastPool.execute(prepared.insertSql, prepared.insertParams);
        }
        res.json({ success: true });
    } catch (error) {
        logger.error('Error updating headcount flow:', error);
        res.status(500).json({ success: false, error: 'Failed to update headcount flow' });
    }
});

app.put('/api/headcount-flows/bulk', async (req, res) => {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : null;
    if (!updates || updates.length === 0) {
        return res.status(400).json({ success: false, error: 'updates array is required' });
    }

    const connection = await forecastPool.getConnection();
    try {
        const versionIds = Array.from(new Set(
            updates
                .filter(update => (update?.dataType || 'forecast') === 'forecast')
                .map(update => Number(update?.versionId))
                .filter(v => Number.isFinite(v) && v > 0)
        ));
        for (const versionId of versionIds) {
            if (await rejectIfVersionLocked({ poolOrConnection: connection, res, versionId })) {
                return;
            }
        }

        await connection.beginTransaction();

        for (const update of updates) {
            const prepared = buildHeadcountFlowUpdate(update);
            if (!prepared || prepared.error) {
                await connection.rollback();
                const message = prepared?.error || 'Invalid payload';
                return res.status(400).json({ success: false, error: message });
            }

            const [result] = await connection.execute(prepared.updateSql, prepared.updateParams);
            if (result.affectedRows === 0) {
                await connection.execute(prepared.insertSql, prepared.insertParams);
            }
        }

        await connection.commit();
        res.json({ success: true, updated: updates.length });
    } catch (error) {
        await connection.rollback();
        logger.error('Error bulk updating headcount flows:', error);
        res.status(500).json({ success: false, error: 'Failed to update headcount flows' });
    } finally {
        connection.release();
    }
});


// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Check database connections
        const actualsConn = await actualsPool.getConnection();
        actualsConn.release();
        
        const forecastConn = await forecastPool.getConnection();
        forecastConn.release();
        
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            databases: {
                actuals: 'connected',
                forecast: 'connected'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: config.app.env === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
async function startServer() {
    try {
        await initializeDatabases();
        
        app.listen(config.app.port, () => {
            logger.info(`Server running on http://localhost:${config.app.port}`);
            logger.info(`Environment: ${config.app.env}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down server...');
    
    try {
        if (actualsPool) await actualsPool.end();
        if (forecastPool) await forecastPool.end();
        logger.info('Database connections closed');
    } catch (error) {
        logger.error('Error during shutdown:', error);
    }
    
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled rejection:', error);
    process.exit(1);
});

// Start the server
startServer();
