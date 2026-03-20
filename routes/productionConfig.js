// routes/productionConfig.js - Production seasonality and growth settings
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { rejectIfVersionLocked } = require('../utils/forecast-guards');

async function ensureProductionSettingsTable(pool) {
    const createSqlJson = `CREATE TABLE IF NOT EXISTS production_settings (
        config_id INT NOT NULL AUTO_INCREMENT,
        version_id INT NOT NULL,
        seasonality_productivity JSON DEFAULT NULL,
        seasonality_abpa JSON DEFAULT NULL,
        productivity_growth_rate DECIMAL(7,4) DEFAULT '0.0000',
        abpa_growth_rate DECIMAL(7,4) DEFAULT '0.0000',
        mgia_mix_growth_rate DECIMAL(7,4) DEFAULT '0.0000',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        PRIMARY KEY (config_id),
        UNIQUE KEY uniq_production_settings_version (version_id),
        CONSTRAINT production_settings_version_fk FOREIGN KEY (version_id) REFERENCES forecast_versions (version_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;
    const createSqlText = `CREATE TABLE IF NOT EXISTS production_settings (
        config_id INT NOT NULL AUTO_INCREMENT,
        version_id INT NOT NULL,
        seasonality_productivity LONGTEXT DEFAULT NULL,
        seasonality_abpa LONGTEXT DEFAULT NULL,
        productivity_growth_rate DECIMAL(7,4) DEFAULT '0.0000',
        abpa_growth_rate DECIMAL(7,4) DEFAULT '0.0000',
        mgia_mix_growth_rate DECIMAL(7,4) DEFAULT '0.0000',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        PRIMARY KEY (config_id),
        UNIQUE KEY uniq_production_settings_version (version_id),
        CONSTRAINT production_settings_version_fk FOREIGN KEY (version_id) REFERENCES forecast_versions (version_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;

    try {
        await pool.execute(createSqlJson);
    } catch (error) {
        const message = error && error.sqlMessage ? error.sqlMessage.toLowerCase() : '';
        if (error.code === 'ER_PARSE_ERROR' || message.includes('json')) {
            await pool.execute(createSqlText);
        } else if (error.code !== 'ER_TABLE_EXISTS_ERROR') {
            throw error;
        }
    }
}

const MONTH_KEYS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildDefaultSeasonality() {
    const defaults = {};
    MONTH_KEYS.forEach(month => { defaults[month] = 1; });
    return defaults;
}

function normalizeSeasonality(payload) {
    const defaults = buildDefaultSeasonality();
    const normalized = {};
    MONTH_KEYS.forEach(month => {
        const hasValue = payload && Object.prototype.hasOwnProperty.call(payload, month);
        const raw = hasValue ? payload[month] : defaults[month];
        const value = Number.parseFloat(raw);
        normalized[month] = Number.isFinite(value) && value > 0 ? value : defaults[month];
    });
    return normalized;
}

function normalizeGrowth(value) {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) {
        return 0;
    }
    return num;
}

router.get('/', async (req, res) => {
    const versionId = Number.parseInt(req.query.versionId, 10);
    if (!versionId) {
        return res.status(400).json({ error: 'versionId query parameter is required' });
    }

    const forecastPool = req.app.locals.forecastPool;
    if (!forecastPool) {
        logger.error('Forecast pool not configured when fetching production settings');
        return res.status(500).json({ error: 'Database connection not available' });
    }

    await ensureProductionSettingsTable(forecastPool);

    try {
        const [rows] = await forecastPool.execute(
            'SELECT * FROM production_settings WHERE version_id = ? LIMIT 1',
            [versionId]
        );

        if (!rows || rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    versionId,
                    seasonality: {
                        productivity: buildDefaultSeasonality(),
                        abpa: buildDefaultSeasonality()
                    },
                    growth: {
                        productivity: 0,
                        abpa: 0,
                        mgiaMix: 0
                    },
                    updatedAt: null,
                    updatedBy: null
                }
            });
        }

        const record = rows[0];
        let productivitySeasonality;
        let abpaSeasonality;
        try {
            const rawProductivitySeasonality = record.seasonality_productivity;
            const parsedProductivitySeasonality = typeof rawProductivitySeasonality === 'string'
                ? (rawProductivitySeasonality ? JSON.parse(rawProductivitySeasonality) : null)
                : rawProductivitySeasonality;
            productivitySeasonality = normalizeSeasonality(parsedProductivitySeasonality);
        } catch (err) {
            logger.warn('Invalid productivity seasonality JSON detected, reverting to defaults', err);
            productivitySeasonality = buildDefaultSeasonality();
        }
        try {
            const rawAbpaSeasonality = record.seasonality_abpa;
            const parsedAbpaSeasonality = typeof rawAbpaSeasonality === 'string'
                ? (rawAbpaSeasonality ? JSON.parse(rawAbpaSeasonality) : null)
                : rawAbpaSeasonality;
            abpaSeasonality = normalizeSeasonality(parsedAbpaSeasonality);
        } catch (err) {
            logger.warn('Invalid ABPA seasonality JSON detected, reverting to defaults', err);
            abpaSeasonality = buildDefaultSeasonality();
        }

        return res.json({
            success: true,
            data: {
                versionId,
                seasonality: {
                    productivity: productivitySeasonality,
                    abpa: abpaSeasonality
                },
                growth: {
                    productivity: Number(record.productivity_growth_rate) || 0,
                    abpa: Number(record.abpa_growth_rate) || 0,
                    mgiaMix: Number(record.mgia_mix_growth_rate) || 0
                },
                updatedAt: record.updated_at,
                updatedBy: record.updated_by || null
            }
        });
    } catch (error) {
        logger.error('Failed to fetch production settings', error);
        return res.status(500).json({ error: 'Failed to fetch production settings' });
    }
});

router.put('/', async (req, res) => {
    const { versionId, seasonalityProductivity, seasonalityAbpa, productivityGrowthRate, abpaGrowthRate, mgiaMixGrowthRate, updatedBy } = req.body || {};

    const parsedVersionId = Number.parseInt(versionId, 10);
    if (!parsedVersionId) {
        return res.status(400).json({ error: 'versionId is required' });
    }

    const forecastPool = req.app.locals.forecastPool;
    if (!forecastPool) {
        logger.error('Forecast pool not configured when saving production settings');
        return res.status(500).json({ error: 'Database connection not available' });
    }

    await ensureProductionSettingsTable(forecastPool);
    if (await rejectIfVersionLocked({ poolOrConnection: forecastPool, res, versionId: parsedVersionId })) {
        return;
    }

    const normalizedProductivitySeasonality = normalizeSeasonality(seasonalityProductivity);
    const normalizedAbpaSeasonality = normalizeSeasonality(seasonalityAbpa);
    const normalizedProductivityGrowth = normalizeGrowth(productivityGrowthRate);
    const normalizedAbpaGrowth = normalizeGrowth(abpaGrowthRate);
    const normalizedMgIaGrowth = normalizeGrowth(mgiaMixGrowthRate);

    try {
        await forecastPool.execute(
            `INSERT INTO production_settings (
                version_id, seasonality_productivity, seasonality_abpa,
                productivity_growth_rate, abpa_growth_rate, mgia_mix_growth_rate, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                seasonality_productivity = VALUES(seasonality_productivity),
                seasonality_abpa = VALUES(seasonality_abpa),
                productivity_growth_rate = VALUES(productivity_growth_rate),
                abpa_growth_rate = VALUES(abpa_growth_rate),
                mgia_mix_growth_rate = VALUES(mgia_mix_growth_rate),
                updated_by = VALUES(updated_by)` ,
            [
                parsedVersionId,
                JSON.stringify(normalizedProductivitySeasonality),
                JSON.stringify(normalizedAbpaSeasonality),
                normalizedProductivityGrowth,
                normalizedAbpaGrowth,
                normalizedMgIaGrowth,
                updatedBy || null
            ]
        );

        return res.json({
            success: true,
            data: {
                versionId: parsedVersionId,
                seasonality: {
                    productivity: normalizedProductivitySeasonality,
                    abpa: normalizedAbpaSeasonality
                },
                growth: {
                    productivity: normalizedProductivityGrowth,
                    abpa: normalizedAbpaGrowth,
                    mgiaMix: normalizedMgIaGrowth
                },
                updatedBy: updatedBy || null,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Failed to save production settings', error);
        return res.status(500).json({ error: 'Failed to save production settings' });
    }
});

module.exports = router;




