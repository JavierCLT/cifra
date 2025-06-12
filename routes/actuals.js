// routes/actuals.js - Actuals data routes (read-only)
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Get actuals data for a team
router.get('/team/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const { startDate, endDate } = req.query;
        const actualsPool = req.app.locals.actualsPool;
        
        let query = `
            SELECT * FROM v_actuals_for_api 
            WHERE team_id = ?
        `;
        const params = [teamId];
        
        if (startDate) {
            query += ' AND period_date >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND period_date <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY period_date';
        
        const [actuals] = await actualsPool.query(query, params);
        
        res.json({
            success: true,
            data: actuals,
            count: actuals.length
        });
        
    } catch (error) {
        logger.error('Error fetching actuals:', error);
        res.status(500).json({ error: 'Failed to fetch actuals data' });
    }
});

// Get actuals summary by period
router.get('/summary/:period', async (req, res) => {
    try {
        const { period } = req.params;
        const actualsPool = req.app.locals.actualsPool;
        
        const [summary] = await actualsPool.query(
            `SELECT 
                COUNT(DISTINCT team_id) as team_count,
                SUM(pg1_headcount + pg2_headcount + pg3_headcount + 
                    pg4_headcount + pg5_headcount + pg6_headcount + 
                    pg7_headcount) as total_headcount,
                AVG(productivity) as avg_productivity,
                MIN(period_date) as first_date,
                MAX(period_date) as last_date
             FROM v_actuals_for_api
             WHERE period_string = ?`,
            [period]
        );
        
        res.json({
            success: true,
            data: summary[0]
        });
        
    } catch (error) {
        logger.error('Error fetching actuals summary:', error);
        res.status(500).json({ error: 'Failed to fetch actuals summary' });
    }
});

// Get available periods
router.get('/periods', async (req, res) => {
    try {
        const actualsPool = req.app.locals.actualsPool;
        
        const [periods] = await actualsPool.query(
            `SELECT DISTINCT 
                period_date,
                period_string,
                business_days
             FROM v_actuals_for_api
             ORDER BY period_date`
        );
        
        res.json({
            success: true,
            data: periods,
            count: periods.length
        });
        
    } catch (error) {
        logger.error('Error fetching periods:', error);
        res.status(500).json({ error: 'Failed to fetch periods' });
    }
});

// Get business days calendar
router.get('/calendar', async (req, res) => {
    try {
        const { year } = req.query;
        const actualsPool = req.app.locals.actualsPool;
        
        let query = 'SELECT * FROM business_days_calendar';
        const params = [];
        
        if (year) {
            query += ' WHERE YEAR(period_date) = ?';
            params.push(year);
        }
        
        query += ' ORDER BY period_date';
        
        const [calendar] = await actualsPool.query(query, params);
        
        res.json({
            success: true,
            data: calendar,
            count: calendar.length
        });
        
    } catch (error) {
        logger.error('Error fetching calendar:', error);
        res.status(500).json({ error: 'Failed to fetch calendar' });
    }
});

module.exports = router;