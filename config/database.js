// config/database.js - Database configuration
require('dotenv').config();

// Debug logging
console.log('Current directory:', __dirname);
console.log('Looking for .env in:', process.cwd());

const config = {
    // Mock Actuals Database Configuration
    actualsDb: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.ACTUALS_DB_USER,
        password: process.env.ACTUALS_DB_PASSWORD,
        database: process.env.ACTUALS_DB_NAME,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    },
    
    // Forecast Database Configuration
    forecastDb: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.FORECAST_DB_USER,
        password: process.env.FORECAST_DB_PASSWORD,
        database: process.env.FORECAST_DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
    },
    
    // Application Configuration
    app: {
        port: process.env.PORT || 3000,
        env: process.env.NODE_ENV || 'development',
        sessionSecret: process.env.SESSION_SECRET,
        corsOrigin: process.env.CORS_ORIGIN,
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS),
        rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
    },
    
    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL,
        file: process.env.LOG_FILE
    }
};

// Updated validation
const requiredEnvVars = [
    'DB_HOST',
    'DB_PORT',
    'ACTUALS_DB_USER',
    'ACTUALS_DB_PASSWORD',
    'ACTUALS_DB_NAME',
    'FORECAST_DB_USER',
    'FORECAST_DB_PASSWORD',
    'FORECAST_DB_NAME'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('ERROR: Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please ensure your .env file contains all required variables.');
    process.exit(1);
}

module.exports = config;