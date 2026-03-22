// routes/forecasts.js - Forecast-related routes
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validate } = require('../utils/validators');
const {
    normalizeEmail,
    userHasAdminAccess,
    rejectIfVersionLocked
} = require('../utils/forecast-guards');

const SAVE_AND_LOCK_CONFIRMATION = 'SAVE AND LOCK FORECAST';

function buildCycleName(baseName) {
    const text = String(baseName || '').trim();
    const cycleMatch = text.match(/^(\d{1,2})\+(\d{1,2})$/);
    if (cycleMatch) {
        return '0+12';
    }
    return `0+12`;
}

async function resolveUniqueVersionName(connection, desiredName) {
    const base = String(desiredName || '').trim();
    let attempt = base;
    let suffix = 2;

    while (true) {
        const [rows] = await connection.query(
            'SELECT version_id FROM forecast_versions WHERE version_name = ? LIMIT 1',
            [attempt]
        );
        if (!rows.length) {
            return attempt;
        }
        attempt = `${base} (${suffix})`;
        suffix += 1;
    }
}

async function getTableColumns(connection, tableName) {
    const [rows] = await connection.query(
        `SELECT
            column_name AS column_name_alias,
            extra AS extra_alias,
            generation_expression AS generation_expression_alias
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = ?
         ORDER BY ordinal_position`,
        [tableName]
    );
    return rows || [];
}

async function ensureForecastScenariosTable(poolOrConnection) {
    await poolOrConnection.query(
        `CREATE TABLE IF NOT EXISTS forecast_scenarios (
            scenario_id INT NOT NULL AUTO_INCREMENT,
            version_id INT NOT NULL,
            source_version_id INT NOT NULL,
            scenario_name VARCHAR(100) NOT NULL,
            created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            created_by VARCHAR(100) DEFAULT NULL,
            is_active TINYINT(1) DEFAULT 1,
            PRIMARY KEY (scenario_id),
            UNIQUE KEY uniq_forecast_scenarios_version (version_id),
            KEY idx_forecast_scenarios_source (source_version_id),
            CONSTRAINT forecast_scenarios_version_fk FOREIGN KEY (version_id) REFERENCES forecast_versions (version_id) ON DELETE CASCADE,
            CONSTRAINT forecast_scenarios_source_fk FOREIGN KEY (source_version_id) REFERENCES forecast_versions (version_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
    );
}

async function cloneVersionedTable(connection, tableName, sourceVersionId, newVersionId, whereClause = 'version_id = ?') {
    const columns = await getTableColumns(connection, tableName);
    if (!columns.length) {
        return 0;
    }

    const insertColumns = columns
        .filter(col => {
            const extra = String(col.extra_alias || '').toLowerCase();
            const generationExpression = String(col.generation_expression_alias || '').trim();
            return !extra.includes('auto_increment') && !generationExpression;
        })
        .map(col => col.column_name_alias);

    if (!insertColumns.includes('version_id')) {
        return 0;
    }

    const quotedInsertColumns = insertColumns.map(column => `\`${column}\``);
    const selectColumns = insertColumns.map(column => (column === 'version_id' ? '? AS version_id' : `\`${column}\``));

    const sql = `
        INSERT INTO \`${tableName}\` (${quotedInsertColumns.join(', ')})
        SELECT ${selectColumns.join(', ')}
        FROM \`${tableName}\`
        WHERE ${whereClause}
    `;

    const [result] = await connection.query(sql, [newVersionId, sourceVersionId]);
    return result.affectedRows || 0;
}

async function cloneForecastVersionData(connection, sourceVersionId, newVersionId) {
    const cloneCounts = {};

    cloneCounts.forecast_data = await cloneVersionedTable(
        connection,
        'forecast_data',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.forecast_non_sales_headcount = await cloneVersionedTable(
        connection,
        'forecast_non_sales_headcount',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.production_settings = await cloneVersionedTable(
        connection,
        'production_settings',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.referral_settings = await cloneVersionedTable(
        connection,
        'referral_settings',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.kmpc_settings = await cloneVersionedTable(
        connection,
        'kmpc_settings',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.incentive_compensable_metrics = await cloneVersionedTable(
        connection,
        'incentive_compensable_metrics',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.incentive_quality_ratios = await cloneVersionedTable(
        connection,
        'incentive_quality_ratios',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.incentive_percent_targets = await cloneVersionedTable(
        connection,
        'incentive_percent_targets',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.incentive_expense_grids = await cloneVersionedTable(
        connection,
        'incentive_expense_grids',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.incentive_calculations = await cloneVersionedTable(
        connection,
        'incentive_calculations',
        sourceVersionId,
        newVersionId
    );

    cloneCounts.headcount_flows = await cloneVersionedTable(
        connection,
        'headcount_flows',
        sourceVersionId,
        newVersionId,
        `version_id = ? AND data_type = 'forecast'`
    );

    return cloneCounts;
}

// Get all forecast versions
router.get('/versions', async (req, res) => {
    try {
        const forecastPool = req.app.locals.forecastPool;
        await ensureForecastScenariosTable(forecastPool);
        const [versions] = await forecastPool.query(
            `SELECT
                fv.*,
                CASE WHEN fs.version_id IS NULL THEN 0 ELSE 1 END AS is_scenario,
                fs.source_version_id,
                fs.scenario_name,
                fs.created_at AS scenario_created_at,
                fs.created_by AS scenario_created_by,
                src.version_name AS source_version_name
             FROM forecast_versions fv
             LEFT JOIN forecast_scenarios fs
               ON fs.version_id = fv.version_id
              AND fs.is_active = TRUE
             LEFT JOIN forecast_versions src
               ON src.version_id = fs.source_version_id
             WHERE fv.is_active = TRUE
             ORDER BY
               CASE WHEN fs.version_id IS NULL THEN 0 ELSE 1 END ASC,
               fv.version_id DESC`
        );
        
        res.json({
            success: true,
            data: versions,
            count: versions.length
        });
    } catch (error) {
        logger.error('Error fetching forecast versions:', error);
        res.status(500).json({ error: 'Failed to fetch forecast versions' });
    }
});

// Get specific forecast version
router.get('/versions/:versionId', async (req, res) => {
    try {
        const { versionId } = req.params;
        const forecastPool = req.app.locals.forecastPool;
        await ensureForecastScenariosTable(forecastPool);
        
        const [version] = await forecastPool.query(
            `SELECT
                fv.*,
                CASE WHEN fs.version_id IS NULL THEN 0 ELSE 1 END AS is_scenario,
                fs.source_version_id,
                fs.scenario_name,
                fs.created_at AS scenario_created_at,
                fs.created_by AS scenario_created_by,
                src.version_name AS source_version_name
             FROM forecast_versions fv
             LEFT JOIN forecast_scenarios fs
               ON fs.version_id = fv.version_id
              AND fs.is_active = TRUE
             LEFT JOIN forecast_versions src
               ON src.version_id = fs.source_version_id
             WHERE fv.version_id = ?`,
            [versionId]
        );
        
        if (version.length === 0) {
            return res.status(404).json({ error: 'Forecast version not found' });
        }
        
        res.json({
            success: true,
            data: version[0]
        });
    } catch (error) {
        logger.error('Error fetching forecast version:', error);
        res.status(500).json({ error: 'Failed to fetch forecast version' });
    }
});

router.get('/admin-access/:userEmail', async (req, res) => {
    try {
        const forecastPool = req.app.locals.forecastPool;
        const { userEmail } = req.params;
        const isAdmin = await userHasAdminAccess(forecastPool, userEmail);
        res.json({ success: true, data: { isAdmin } });
    } catch (error) {
        logger.error('Error checking forecast admin access:', error);
        res.status(500).json({ error: 'Failed to check admin access' });
    }
});

router.post('/cycle/save-lock-and-clone', async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;
    const connection = await forecastPool.getConnection();

    try {
        const {
            sourceVersionId,
            nextVersionName,
            confirmationText,
            userEmail
        } = req.body || {};

        const normalizedUser = normalizeEmail(userEmail);
        const numericSourceVersionId = Number(sourceVersionId);
        const requestedNextName = String(nextVersionName || '').trim();

        if (!Number.isFinite(numericSourceVersionId) || numericSourceVersionId <= 0) {
            return res.status(400).json({ error: 'sourceVersionId is required' });
        }
        if (confirmationText !== SAVE_AND_LOCK_CONFIRMATION) {
            return res.status(400).json({ error: `confirmationText must be exactly "${SAVE_AND_LOCK_CONFIRMATION}"` });
        }
        if (!normalizedUser) {
            return res.status(400).json({ error: 'userEmail is required' });
        }

        const isAdmin = await userHasAdminAccess(forecastPool, normalizedUser);
        if (!isAdmin) {
            return res.status(403).json({ error: 'Only admins can save, lock, and clone forecast cycles' });
        }

        await connection.beginTransaction();

        const [sourceRows] = await connection.query(
            `SELECT version_id, version_name, forecast_start_date, description, is_locked
             FROM forecast_versions
             WHERE version_id = ?
             FOR UPDATE`,
            [numericSourceVersionId]
        );

        if (!sourceRows.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Source forecast version not found' });
        }

        const source = sourceRows[0];
        if (source.is_locked) {
            await connection.rollback();
            return res.status(409).json({ error: 'Source forecast is already locked' });
        }

        const previousNameBase = source.version_name.startsWith('Previous ')
            ? source.version_name
            : `Previous ${source.version_name}`;
        const lockedVersionName = await resolveUniqueVersionName(connection, previousNameBase);
        const candidateNextName = requestedNextName || buildCycleName(source.version_name);
        const [nextNameExists] = await connection.query(
            'SELECT version_id FROM forecast_versions WHERE version_name = ? LIMIT 1',
            [candidateNextName]
        );

        if (nextNameExists.length > 0) {
            await connection.rollback();
            return res.status(409).json({ error: `Version name "${candidateNextName}" already exists` });
        }

        await connection.query(
            `UPDATE forecast_versions
             SET version_name = ?, is_locked = 1, created_by = COALESCE(created_by, ?)
             WHERE version_id = ?`,
            [lockedVersionName, normalizedUser, numericSourceVersionId]
        );

        await connection.query(
            `INSERT INTO forecast_locks (version_id, locked_by, lock_reason)
             VALUES (?, ?, ?)`,
            [
                numericSourceVersionId,
                normalizedUser,
                'Cycle finalized using SAVE AND LOCK FORECAST'
            ]
        );

        const [insertVersionResult] = await connection.query(
            `INSERT INTO forecast_versions
             (version_name, forecast_start_date, description, is_active, is_locked, created_by)
             VALUES (?, ?, ?, 1, 0, ?)`,
            [
                candidateNextName,
                source.forecast_start_date,
                `Baseline cloned from ${source.version_name}`,
                normalizedUser
            ]
        );

        const newVersionId = insertVersionResult.insertId;
        const cloneCounts = await cloneForecastVersionData(connection, numericSourceVersionId, newVersionId);

        await connection.commit();

        res.status(201).json({
            success: true,
            data: {
                lockedVersionId: numericSourceVersionId,
                lockedVersionName,
                newVersionId,
                newVersionName: candidateNextName,
                cloneCounts
            }
        });
    } catch (error) {
        await connection.rollback();
        logger.error('Error while saving/locking/cloning forecast cycle:', error);
        res.status(500).json({ error: 'Failed to save, lock, and clone forecast cycle' });
    } finally {
        connection.release();
    }
});

router.post('/scenarios', async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;
    const connection = await forecastPool.getConnection();

    try {
        const {
            sourceVersionId,
            scenarioName,
            userEmail
        } = req.body || {};

        const normalizedUser = normalizeEmail(userEmail) || null;
        const numericSourceVersionId = Number(sourceVersionId);
        const requestedScenarioName = String(scenarioName || '').trim();

        if (!Number.isFinite(numericSourceVersionId) || numericSourceVersionId <= 0) {
            return res.status(400).json({ error: 'sourceVersionId is required' });
        }
        if (!requestedScenarioName) {
            return res.status(400).json({ error: 'scenarioName is required' });
        }

        await ensureForecastScenariosTable(connection);
        await connection.beginTransaction();

        const [sourceRows] = await connection.query(
            `SELECT
                fv.version_id,
                fv.version_name,
                fv.forecast_start_date,
                fv.description,
                fv.is_locked,
                CASE WHEN fs.version_id IS NULL THEN 0 ELSE 1 END AS is_scenario
             FROM forecast_versions fv
             LEFT JOIN forecast_scenarios fs
               ON fs.version_id = fv.version_id
              AND fs.is_active = TRUE
             WHERE fv.version_id = ?
             FOR UPDATE`,
            [numericSourceVersionId]
        );

        if (!sourceRows.length) {
            await connection.rollback();
            return res.status(404).json({ error: 'Source forecast version not found' });
        }

        const source = sourceRows[0];
        if (source.is_scenario) {
            await connection.rollback();
            return res.status(409).json({ error: 'Scenarios can only be created from the live forecast' });
        }

        const uniqueScenarioName = await resolveUniqueVersionName(connection, requestedScenarioName);
        const [insertVersionResult] = await connection.query(
            `INSERT INTO forecast_versions
             (version_name, forecast_start_date, description, is_active, is_locked, created_by)
             VALUES (?, ?, ?, 1, 0, ?)`,
            [
                uniqueScenarioName,
                source.forecast_start_date,
                `Scenario sandbox cloned from ${source.version_name}`,
                normalizedUser
            ]
        );

        const newVersionId = insertVersionResult.insertId;
        await connection.query(
            `INSERT INTO forecast_scenarios
             (version_id, source_version_id, scenario_name, created_by, is_active)
             VALUES (?, ?, ?, ?, 1)`,
            [newVersionId, numericSourceVersionId, uniqueScenarioName, normalizedUser]
        );

        const cloneCounts = await cloneForecastVersionData(connection, numericSourceVersionId, newVersionId);

        await connection.commit();

        res.status(201).json({
            success: true,
            data: {
                sourceVersionId: numericSourceVersionId,
                sourceVersionName: source.version_name,
                newVersionId,
                newVersionName: uniqueScenarioName,
                cloneCounts
            }
        });
    } catch (error) {
        await connection.rollback();
        logger.error('Error while creating forecast scenario:', error);
        res.status(500).json({ error: 'Failed to create scenario sandbox' });
    } finally {
        connection.release();
    }
});

// Create new forecast version
router.post('/versions', validate('createForecastVersion'), async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;
    const connection = await forecastPool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { versionName, forecastStartDate, description, createdBy } = req.body;
        
        // Check if version name already exists
        const [existing] = await connection.query(
            'SELECT version_id FROM forecast_versions WHERE version_name = ?',
            [versionName]
        );
        
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Version name already exists' });
        }
        
        // Create new version
        const [result] = await connection.query(
            `INSERT INTO forecast_versions 
             (version_name, forecast_start_date, description, created_by) 
             VALUES (?, ?, ?, ?)`,
            [versionName, forecastStartDate, description, createdBy]
        );
        
        await connection.commit();
        
        res.status(201).json({
            success: true,
            data: {
                version_id: result.insertId,
                version_name: versionName,
                forecast_start_date: forecastStartDate
            }
        });
        
    } catch (error) {
        await connection.rollback();
        logger.error('Error creating forecast version:', error);
        res.status(500).json({ error: 'Failed to create forecast version' });
    } finally {
        connection.release();
    }
});

// Update forecast data - MAIN UPDATE ROUTE
router.put('/data', async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;
    
    if (!forecastPool) {
        logger.error('Forecast pool not found in app.locals');
        return res.status(500).json({ 
            success: false, 
            error: 'Database connection not available' 
        });
    }
    
    const connection = await forecastPool.getConnection();
    
    try {
        const { teamId, periodDate, versionId, field, value, updatedBy } = req.body;

        if (await rejectIfVersionLocked({ poolOrConnection: connection, res, versionId })) {
            return;
        }
        
        // SKIP ALL PERMISSION CHECKS FOR LOCAL DEVELOPMENT
        logger.info(`Updating ${field} for team ${teamId}, period ${periodDate} by ${updatedBy}`);
        
        // Validate the field name
        const allowedFields = [
            'pg1_headcount', 'pg2_headcount', 'pg3_headcount', 'pg4_headcount',
            'pg5_headcount', 'pg6_headcount', 'pg7_headcount',
            'productivity',
            'product_a_mix', 'product_b_mix', 'product_c_mix', 'product_d_mix',
            'product_a_abpa', 'product_b_abpa', 'product_c_abpa', 'product_d_abpa',
            // Additional products (AA..HH)
            'product_aa_productivity','product_aa_abpa',
            'product_bb_productivity','product_bb_abpa',
            'product_cc_productivity','product_cc_abpa',
            'product_dd_productivity','product_dd_abpa',
            'product_ee_productivity','product_ee_abpa',
            'product_ff_productivity','product_ff_abpa',
            'product_gg_productivity','product_gg_abpa',
            'product_hh_productivity','product_hh_abpa',
            'ref_out_fsa_mlwm_prod','ref_out_mfsa_hl_prod','ref_out_mfsa_sb_prod',
            'ref_out_fsa_bsa_prod','ref_out_fsa_cvl_prod','ref_out_fsa_hl_prod',
            'ref_out_fsa_sb_prod',
            'ref_in_merrill_ci_prod','ref_in_privatebank_ci_prod','ref_in_centralized_prod',
            'ref_in_hl_ci_prod','ref_in_csa_ci_prod','ref_in_preferred_ci_prod',
            'ref_in_bsa_ci_prod',
            'deepening_percent'
        ];
        
        if (!allowedFields.includes(field)) {
            return res.status(400).json({ 
                success: false, 
                error: `Invalid field name: ${field}` 
            });
        }
        
        // Check if record exists
        const [existing] = await connection.execute(
            `SELECT forecast_id FROM forecast_data 
             WHERE team_id = ? AND period_date = ? AND version_id = ?`,
            [teamId, periodDate, versionId]
        );
        
        if (existing.length === 0) {
            // Create a new record with the specific field
            let insertQuery = `
                INSERT INTO forecast_data (
                    team_id, period_date, version_id, ${field}, updated_by
                ) VALUES (?, ?, ?, ?, ?)
            `;
            
            await connection.execute(insertQuery, [teamId, periodDate, versionId, value, updatedBy || 'system']);
            logger.info(`Inserted new forecast record for team ${teamId}, period ${periodDate}`);
        } else {
            // Update existing record
            await connection.execute(
                `UPDATE forecast_data 
                 SET ${field} = ?, updated_at = NOW(), updated_by = ?
                 WHERE team_id = ? AND period_date = ? AND version_id = ?`,
                [value, updatedBy || 'system', teamId, periodDate, versionId]
            );
            logger.info(`Updated existing forecast record for team ${teamId}, period ${periodDate}`);
        }
        
        res.json({ success: true });
        
    } catch (error) {
        logger.error('Error updating forecast data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update forecast data',
            details: error.message 
        });
    } finally {
        connection.release();
    }
});

// Get current (active) forecast version the app uses by default
router.get('/current', async (req, res) => {
    try {
        const forecastPool = req.app.locals.forecastPool;
        const [versions] = await forecastPool.query(
            'SELECT * FROM forecast_versions WHERE is_active = TRUE ORDER BY version_id DESC LIMIT 1'
        );
        if (!versions.length) {
            return res.status(404).json({ error: 'No active forecast versions found' });
        }
        res.json({ success: true, data: versions[0] });
    } catch (error) {
        logger.error('Error fetching current forecast version:', error);
        res.status(500).json({ error: 'Failed to fetch current forecast version' });
    }
});

// Bulk update forecast data
router.put('/data/bulk', async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;

    if (!forecastPool) {
        logger.error('Forecast pool not found in app.locals');
        return res.status(500).json({ success: false, error: 'Database connection not available' });
    }

    const connection = await forecastPool.getConnection();

    try {
        const { updates, versionId, updatedBy } = req.body || {};
        if (!Array.isArray(updates) || updates.length === 0 || !versionId) {
            return res.status(400).json({ success: false, error: 'Invalid bulk payload' });
        }

        if (await rejectIfVersionLocked({ poolOrConnection: connection, res, versionId })) {
            return;
        }

        const allowedFields = [
            'pg1_headcount', 'pg2_headcount', 'pg3_headcount', 'pg4_headcount',
            'pg5_headcount', 'pg6_headcount', 'pg7_headcount',
            'productivity',
            'product_a_mix', 'product_b_mix', 'product_c_mix', 'product_d_mix',
            'product_a_abpa', 'product_b_abpa', 'product_c_abpa', 'product_d_abpa',
            // Additional products (AA..HH)
            'product_aa_productivity','product_aa_abpa',
            'product_bb_productivity','product_bb_abpa',
            'product_cc_productivity','product_cc_abpa',
            'product_dd_productivity','product_dd_abpa',
            'product_ee_productivity','product_ee_abpa',
            'product_ff_productivity','product_ff_abpa',
            'product_gg_productivity','product_gg_abpa',
            'product_hh_productivity','product_hh_abpa',
            'ref_out_fsa_mlwm_prod','ref_out_mfsa_hl_prod','ref_out_mfsa_sb_prod',
            'ref_out_fsa_bsa_prod','ref_out_fsa_cvl_prod','ref_out_fsa_hl_prod',
            'ref_out_fsa_sb_prod',
            'ref_in_merrill_ci_prod','ref_in_privatebank_ci_prod','ref_in_centralized_prod',
            'ref_in_hl_ci_prod','ref_in_csa_ci_prod','ref_in_preferred_ci_prod',
            'ref_in_bsa_ci_prod',
            'deepening_percent'
        ];

        await connection.beginTransaction();

        for (const u of updates) {
            const { teamId, periodDate, field, newValue } = u;
            if (!teamId || !periodDate || !field) continue;

            if (!allowedFields.includes(field)) {
                // Silently skip unsupported fields instead of failing the whole batch
                logger.warn(`Skipping unsupported field in bulk update: ${field}`);
                continue;
            }

            // Check if record exists
            const [existing] = await connection.execute(
                `SELECT forecast_id FROM forecast_data 
                 WHERE team_id = ? AND period_date = ? AND version_id = ?`,
                [teamId, periodDate, versionId]
            );

            if (existing.length === 0) {
                // Insert new record with this field
                await connection.execute(
                    `INSERT INTO forecast_data (
                        team_id, period_date, version_id, ${field}, updated_by
                    ) VALUES (?, ?, ?, ?, ?)`,
                    [teamId, periodDate, versionId, newValue, updatedBy || 'system']
                );
            } else {
                // Update existing
                await connection.execute(
                    `UPDATE forecast_data 
                     SET ${field} = ?, updated_at = NOW(), updated_by = ?
                     WHERE team_id = ? AND period_date = ? AND version_id = ?`,
                    [newValue, updatedBy || 'system', teamId, periodDate, versionId]
                );
            }
        }

        await connection.commit();
        res.json({ success: true, count: updates.length });
    } catch (error) {
        await connection.rollback();
        logger.error('Error in bulk forecast update:', error);
        res.status(500).json({ success: false, error: 'Failed to process bulk update', details: error.message });
    } finally {
        connection.release();
    }
});

// Initialize forecast from actuals or another version
router.post('/initialize', validate('initializeForecast'), async (req, res) => {
    const actualsPool = req.app.locals.actualsPool;
    const forecastPool = req.app.locals.forecastPool;
    const connection = await forecastPool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { 
            newVersionId, 
            sourceVersionId, 
            sourceIsActuals, 
            startDate, 
            endDate, 
            createdBy 
        } = req.body;
        
        let recordCount = 0;
        
        if (sourceIsActuals) {
            // Copy from actuals
            const [actuals] = await actualsPool.query(
                `SELECT * FROM v_actuals_for_api 
                 WHERE period_date >= ? AND period_date <= ?
                 ORDER BY team_id, period_date`,
                [startDate, endDate]
            );
            
            for (const row of actuals) {
                await connection.query(
                    `INSERT INTO forecast_data (
                        team_id, period_date, version_id,
                        pg1_headcount, pg2_headcount, pg3_headcount, pg4_headcount,
                        pg5_headcount, pg6_headcount, pg7_headcount,
                        productivity,
                        product_a_mix, product_b_mix, product_c_mix, product_d_mix,
                        product_a_abpa, product_b_abpa, product_c_abpa, product_d_abpa,
                        product_aa_productivity, product_aa_abpa,
                        product_bb_productivity, product_bb_abpa,
                        product_cc_productivity, product_cc_abpa,
                        product_dd_productivity, product_dd_abpa,
                        product_ee_productivity, product_ee_abpa,
                        product_ff_productivity, product_ff_abpa,
                        product_gg_productivity, product_gg_abpa,
                        product_hh_productivity, product_hh_abpa,
                        updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        row.team_id, row.period_date, newVersionId,
                        row.pg1_headcount, row.pg2_headcount, row.pg3_headcount,
                        row.pg4_headcount, row.pg5_headcount, row.pg6_headcount,
                        row.pg7_headcount, row.productivity,
                        row.product_a_mix, row.product_b_mix,
                        row.product_c_mix, row.product_d_mix,
                        row.product_a_abpa, row.product_b_abpa,
                        row.product_c_abpa, row.product_d_abpa,
                        row.product_aa_productivity, row.product_aa_abpa,
                        row.product_bb_productivity, row.product_bb_abpa,
                        row.product_cc_productivity, row.product_cc_abpa,
                        row.product_dd_productivity, row.product_dd_abpa,
                        row.product_ee_productivity, row.product_ee_abpa,
                        row.product_ff_productivity, row.product_ff_abpa,
                        row.product_gg_productivity, row.product_gg_abpa,
                        row.product_hh_productivity, row.product_hh_abpa,
                        createdBy
                    ]
                );
                recordCount++;
            }
        } else {
            // Copy from another forecast version
            const [forecasts] = await connection.query(
                `SELECT * FROM forecast_data 
                 WHERE version_id = ? 
                 AND period_date >= ? 
                 AND period_date <= ?`,
                [sourceVersionId, startDate, endDate]
            );
            
            for (const row of forecasts) {
                await connection.query(
                    `INSERT INTO forecast_data (
                        team_id, period_date, version_id,
                        pg1_headcount, pg2_headcount, pg3_headcount, pg4_headcount,
                        pg5_headcount, pg6_headcount, pg7_headcount,
                        productivity,
                        product_a_mix, product_b_mix, product_c_mix, product_d_mix,
                        product_a_abpa, product_b_abpa, product_c_abpa, product_d_abpa,
                        product_aa_productivity, product_aa_abpa,
                        product_bb_productivity, product_bb_abpa,
                        product_cc_productivity, product_cc_abpa,
                        product_dd_productivity, product_dd_abpa,
                        product_ee_productivity, product_ee_abpa,
                        product_ff_productivity, product_ff_abpa,
                        product_gg_productivity, product_gg_abpa,
                        product_hh_productivity, product_hh_abpa,
                        updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        row.team_id, row.period_date, newVersionId,
                        row.pg1_headcount, row.pg2_headcount, row.pg3_headcount,
                        row.pg4_headcount, row.pg5_headcount, row.pg6_headcount,
                        row.pg7_headcount, row.productivity,
                        row.product_a_mix, row.product_b_mix,
                        row.product_c_mix, row.product_d_mix,
                        row.product_a_abpa, row.product_b_abpa,
                        row.product_c_abpa, row.product_d_abpa,
                        row.product_aa_productivity, row.product_aa_abpa,
                        row.product_bb_productivity, row.product_bb_abpa,
                        row.product_cc_productivity, row.product_cc_abpa,
                        row.product_dd_productivity, row.product_dd_abpa,
                        row.product_ee_productivity, row.product_ee_abpa,
                        row.product_ff_productivity, row.product_ff_abpa,
                        row.product_gg_productivity, row.product_gg_abpa,
                        row.product_hh_productivity, row.product_hh_abpa,
                        createdBy
                    ]
                );
                recordCount++;
            }
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Forecast initialized successfully',
            recordCount
        });
        
    } catch (error) {
        await connection.rollback();
        logger.error('Error initializing forecast:', error);
        res.status(500).json({ error: 'Failed to initialize forecast' });
    } finally {
        connection.release();
    }
});

// Get forecast data for a team (no permission check)
router.get('/team/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const { versionId } = req.query;
        const forecastPool = req.app.locals.forecastPool;
        
        // Just get the data without permission checks
        const [rows] = await forecastPool.execute(
            `SELECT * FROM v_forecast_metrics 
             WHERE team_id = ? AND version_id = ?
             ORDER BY period_date`,
            [teamId, versionId]
        );
        
        res.json(rows);
    } catch (error) {
        logger.error('Error fetching forecast data:', error);
        res.status(500).json({ error: 'Failed to fetch forecast data' });
    }
});

// Get audit log for a team
router.get('/audit/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const { limit = 100 } = req.query;
        const forecastPool = req.app.locals.forecastPool;
        
        const [rows] = await forecastPool.execute(
            `SELECT 
                fal.*,
                fd.period_date,
                fv.version_name
             FROM forecast_audit_log fal
             JOIN forecast_data fd ON fal.forecast_id = fd.forecast_id
             JOIN forecast_versions fv ON fd.version_id = fv.version_id
             WHERE fd.team_id = ?
             ORDER BY fal.changed_at DESC
             LIMIT ?`,
            [teamId, parseInt(limit)]
        );
        
        res.json({
            success: true,
            data: rows,
            count: rows.length
        });
    } catch (error) {
        logger.error('Error fetching audit log:', error);
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});

module.exports = router;
