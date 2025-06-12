// utils/logger.js - Winston logger configuration
const winston = require('winston');
const path = require('path');
const config = require('../config/database');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    defaultMeta: { service: 'investment-forecasting' },
    transports: [
        // Write all logs to file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(logsDir, config.logging.file)
        })
    ]
});

// If not in production, also log to console
if (config.app.env !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Create a stream object for Morgan HTTP logging
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

module.exports = logger;