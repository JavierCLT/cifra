// utils/validators.js - Input validation using Joi
const Joi = require('joi');

// Valid field names for updates
const VALID_FIELDS = [
    'pg1_headcount', 'pg2_headcount', 'pg3_headcount', 'pg4_headcount',
    'pg5_headcount', 'pg6_headcount', 'pg7_headcount',
    'productivity',
    'product_a_mix', 'product_b_mix', 'product_c_mix', 'product_d_mix',
    'product_a_abpa', 'product_b_abpa', 'product_c_abpa', 'product_d_abpa'
];

// Validation schemas
const schemas = {
    // Team ID validation
    teamId: Joi.number().integer().min(1).max(22).required(),
    
    // Version ID validation
    versionId: Joi.number().integer().min(1).required(),
    
    // Date validation
    date: Joi.date().iso().required(),
    dateRange: Joi.object({
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().min(Joi.ref('startDate')).required()
    }),
    
    // Field update validation
    fieldUpdate: Joi.object({
        teamId: Joi.number().integer().min(1).max(22).required(),
        periodDate: Joi.date().iso().required(),
        versionId: Joi.number().integer().min(1).required(),
        field: Joi.string().valid(...VALID_FIELDS).required(),
        value: Joi.alternatives().try(
            Joi.number().min(0),
            Joi.string().pattern(/^[0-9.]+$/)
        ).required(),
        updatedBy: Joi.string().email().required()
    }),
    
    // Bulk update validation
    bulkUpdate: Joi.object({
        updates: Joi.array().items(
            Joi.object({
                teamId: Joi.number().integer().min(1).max(22).required(),
                periodDate: Joi.date().iso().required(),
                field: Joi.string().valid(...VALID_FIELDS).required(),
                newValue: Joi.number().min(0).required()
            })
        ).min(1).max(100).required(),
        versionId: Joi.number().integer().min(1).required(),
        updatedBy: Joi.string().email().required()
    }),
    
    // Create forecast version validation
    createForecastVersion: Joi.object({
        versionName: Joi.string().min(3).max(50).required(),
        forecastStartDate: Joi.date().iso().required(),
        description: Joi.string().max(500).optional(),
        createdBy: Joi.string().email().required()
    }),
    
    // Initialize forecast validation
    initializeForecast: Joi.object({
        newVersionId: Joi.number().integer().min(1).required(),
        sourceVersionId: Joi.number().integer().min(1).optional(),
        sourceIsActuals: Joi.boolean().required(),
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
        createdBy: Joi.string().email().required()
    })
};

// Validation middleware factory
const validate = (schemaName) => {
    return (req, res, next) => {
        const schema = schemas[schemaName];
        if (!schema) {
            return res.status(500).json({ error: 'Invalid validation schema' });
        }
        
        const { error } = schema.validate(req.body);
        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({ error: errorMessage });
        }
        
        next();
    };
};

// Export validation functions
module.exports = {
    validate,
    schemas,
    
    // Helper functions for specific validations
    isValidTeamId: (teamId) => {
        const { error } = schemas.teamId.validate(teamId);
        return !error;
    },
    
    isValidField: (field) => {
        return VALID_FIELDS.includes(field);
    },
    
    validateProductMix: (mixA, mixB, mixC, mixD) => {
        const total = parseFloat(mixA) + parseFloat(mixB) + parseFloat(mixC) + parseFloat(mixD);
        return Math.abs(total - 1.0) < 0.001; // Allow for floating point precision
    }
};