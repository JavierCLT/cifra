// routes/incentives.js - Incentive-related routes
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Get compensable metrics for a team
router.get('/compensable-metrics/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const forecastPool = req.app.locals.forecastPool;
        
        const [metrics] = await forecastPool.query(
            `SELECT 
                metric_category,
                is_compensable
             FROM incentive_compensable_metrics
             WHERE team_id = ?
             AND (end_date IS NULL OR end_date > CURRENT_DATE)
             ORDER BY metric_category`,
            [teamId]
        );
        
        // Transform to object format
        const result = {};
        metrics.forEach(row => {
            result[row.metric_category] = row.is_compensable === 1;
        });
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (error) {
        logger.error('Error fetching compensable metrics:', error);
        res.status(500).json({ error: 'Failed to fetch compensable metrics' });
    }
});

// Get quality ratios for a team and period
router.get('/quality-ratios/:teamId/:period', async (req, res) => {
    try {
        const { teamId, period } = req.params;
        const versionId = req.query.versionId || 2; // Default to version 2
        const forecastPool = req.app.locals.forecastPool;
        
        // Convert period from "Jan-24" to "2024-01-01"
        const [monthName, year] = period.split('-');
        const monthMap = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
            'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
            'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        const periodDate = `20${year}-${monthMap[monthName]}-01`;
        
        const [ratios] = await forecastPool.query(
            `SELECT 
                ratio_type,
                ratio_value
             FROM incentive_quality_ratios
             WHERE team_id = ?
             AND period_date = ?
             AND version_id = ?`,
            [teamId, periodDate, versionId]
        );
        
        // Transform to object format
        const result = {};
        ratios.forEach(row => {
            result[row.ratio_type] = parseFloat(row.ratio_value);
        });
        
        res.json({
            success: true,
            data: result
        });
        
    } catch (error) {
        logger.error('Error fetching quality ratios:', error);
        res.status(500).json({ error: 'Failed to fetch quality ratios' });
    }
});

// Get all compensable metrics (for admin panel)
router.get('/compensable-metrics', async (req, res) => {
    try {
        const forecastPool = req.app.locals.forecastPool;
        
        const [metrics] = await forecastPool.query(
            `SELECT 
                team_id,
                metric_category,
                is_compensable
             FROM incentive_compensable_metrics
             WHERE end_date IS NULL OR end_date > CURRENT_DATE
             ORDER BY team_id, metric_category`
        );
        
        res.json({
            success: true,
            data: metrics
        });
        
    } catch (error) {
        logger.error('Error fetching all compensable metrics:', error);
        res.status(500).json({ error: 'Failed to fetch compensable metrics' });
    }
});

// Update compensable metrics
router.post('/compensable-metrics', async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;
    const connection = await forecastPool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { updates } = req.body;
        
        for (const update of updates) {
            // End date existing record
            await connection.query(
                `UPDATE incentive_compensable_metrics
                 SET end_date = CURRENT_DATE
                 WHERE team_id = ?
                 AND metric_category = ?
                 AND end_date IS NULL`,
                [update.team_id, update.metric]
            );
            
            // Insert new record
            await connection.query(
                `INSERT INTO incentive_compensable_metrics 
                 (team_id, metric_category, is_compensable, updated_by)
                 VALUES (?, ?, ?, ?)`,
                [update.team_id, update.metric, update.is_compensable, req.body.updatedBy || 'admin']
            );
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Compensable metrics updated successfully'
        });
        
    } catch (error) {
        await connection.rollback();
        logger.error('Error updating compensable metrics:', error);
        res.status(500).json({ error: 'Failed to update compensable metrics' });
    } finally {
        connection.release();
    }
});

// Update quality ratios
router.post('/quality-ratios', async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;
    const connection = await forecastPool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { ratios, versionId = 2 } = req.body;
        
        for (const ratio of ratios) {
            // Insert or update ratio
            await connection.query(
                `INSERT INTO incentive_quality_ratios 
                 (team_id, ratio_type, ratio_value, period_date, version_id, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 ratio_value = VALUES(ratio_value),
                 updated_at = CURRENT_TIMESTAMP,
                 updated_by = VALUES(updated_by)`,
                [ratio.team_id, ratio.ratio_type, ratio.ratio_value, 
                 ratio.period_date, versionId, req.body.updatedBy || 'admin']
            );
        }
        
        await connection.commit();
        
        res.json({
            success: true,
            message: 'Quality ratios updated successfully'
        });
        
    } catch (error) {
        await connection.rollback();
        logger.error('Error updating quality ratios:', error);
        res.status(500).json({ error: 'Failed to update quality ratios' });
    } finally {
        connection.release();
    }
});

// Get calculated incentive metrics
router.get('/calculations/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const { versionId = 2, startDate, endDate } = req.query;
        const forecastPool = req.app.locals.forecastPool;
        
        let query = `
            SELECT 
                ic.*,
                DATE_FORMAT(ic.period_date, '%b-%y') as period_string
            FROM incentive_calculations ic
            WHERE ic.team_id = ?
            AND ic.version_id = ?
        `;
        const params = [teamId, versionId];
        
        if (startDate) {
            query += ' AND ic.period_date >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND ic.period_date <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY ic.period_date';
        
        const [calculations] = await forecastPool.query(query, params);
        
        res.json({
            success: true,
            data: calculations
        });
        
    } catch (error) {
        logger.error('Error fetching incentive calculations:', error);
        res.status(500).json({ error: 'Failed to fetch incentive calculations' });
    }
});

// Calculate and store incentive metrics
router.post('/calculate/:teamId', async (req, res) => {
    const forecastPool = req.app.locals.forecastPool;
    
    try {
        const { teamId } = req.params;
        const { periodDate, versionId = 2 } = req.body;
        
        // Call stored procedure to calculate incentives
        await forecastPool.query(
            'CALL calculate_team_incentives(?, ?, ?)',
            [teamId, periodDate, versionId]
        );
        
        res.json({
            success: true,
            message: 'Incentive calculations completed'
        });
        
    } catch (error) {
        logger.error('Error calculating incentives:', error);
        res.status(500).json({ error: 'Failed to calculate incentives' });
    }
});

module.exports = router;