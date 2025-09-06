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

// Import routes
const teamsRoutes = require('./routes/teams');
const forecastsRoutes = require('./routes/forecasts');
const actualsRoutes = require('./routes/actuals');
const incentivesRoutes = require('./routes/incentives');
const nonSalesRoutes = require('./routes/nonSales');

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
            frameSrc: ["'none'"],
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
        const [actualsData] = await actualsPool.query(
            `SELECT * FROM v_actuals_for_api 
             WHERE team_id = ? 
             AND period_date >= ? 
             AND period_date < ?
             ORDER BY period_date`,
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
        
        // Combine and format data
        const combinedData = [
            ...actualsData.map(row => ({
                ...row,
                version_id: parseInt(versionId),
                version_name: versionRows[0].version_name
            })),
            ...forecastData
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
                AVG(product_d_abpa) as product_d_abpa
             FROM v_actuals_for_api
             WHERE team_id IN (${teamIds.join(',')})
             AND period_date >= ?
             AND period_date < ?
             GROUP BY period_date, period_string, business_days
             ORDER BY period_date`,
            [dateRange.start, forecastStartDate]
        );
        
        // Get aggregated forecast data
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
             WHERE team_id IN (${teamIds.join(',')})
             AND version_id = ?
             AND period_date >= ?
             AND period_date <= ?
             GROUP BY period_date
             ORDER BY period_date`,
            [versionId, forecastStartDate, dateRange.end]
        );
        
        // Combine data
        const combinedData = [...actualsData, ...forecastData];
        
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
