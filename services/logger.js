const winston = require('winston');
const path = require('path');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/error.log'), 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: path.join(__dirname, '../logs/combined.log') 
        })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// Özel log metodları
const originalInfo = logger.info.bind(logger);
const originalError = logger.error.bind(logger);
const originalWarn = logger.warn.bind(logger);
const originalDebug = logger.debug.bind(logger);

logger.success = function(message, meta = {}) {
    originalInfo(message, { ...meta, level: 'success' });
};

logger.error = function(message, meta = {}) {
    originalError(message, { ...meta, level: 'error' });
};

logger.info = function(message, meta = {}) {
    originalInfo(message, { ...meta, level: 'info' });
};

logger.warn = function(message, meta = {}) {
    originalWarn(message, { ...meta, level: 'warn' });
};

logger.debug = function(message, meta = {}) {
    originalDebug(message, { ...meta, level: 'debug' });
};

module.exports = logger; 