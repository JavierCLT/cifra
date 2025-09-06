// routes/forecasts.js - Forecast-related routes
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { validate } = require('../utils/validators');

// Get all forecast versions
router.get('/versions', async (req, res) => {
    try {
        const forecastPool = req.app.locals.forecastPool;
        const [versions] = await forecastPool.query(
            'SELECT * FROM forecast_versions WHERE is_active = TRUE ORDER BY version_id DESC'
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
        
        const [version] = await forecastPool.query(
            'SELECT * FROM forecast_versions WHERE version_id = ?',
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
            'product_hh_productivity','product_hh_abpa'
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
            'product_hh_productivity','product_hh_abpa'
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
