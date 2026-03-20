const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { rejectIfVersionLocked } = require('../utils/forecast-guards');

const OUTBOUND_REFERRAL_FLOWS = [
    'fsa_mlwm',
    'mfsa_hl',
    'mfsa_sb',
    'fsa_bsa',
    'fsa_cvl',
    'fsa_hl',
    'fsa_sb'
];

const DEFAULT_TOTAL_RATIO = 1.2;
const DEFAULT_WINS_RATIO = 0.3;
const DEFAULT_PRODUCTIVITY_GROWTH = 0.01;

function buildDefaultRatioMap(defaultValue) {
    return OUTBOUND_REFERRAL_FLOWS.reduce((acc, key) => {
        acc[key] = defaultValue;
        return acc;
    }, {});
}

function normalizeRatioPayload(payload, fallback) {
    const defaults = buildDefaultRatioMap(fallback);
    const normalized = {};
    OUTBOUND_REFERRAL_FLOWS.forEach(flowKey => {
        const raw = payload && Object.prototype.hasOwnProperty.call(payload, flowKey)
            ? Number.parseFloat(payload[flowKey])
            : defaults[flowKey];
        normalized[flowKey] = Number.isFinite(raw) ? raw : defaults[flowKey];
    });
    return normalized;
}

function normalizeGrowth(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : DEFAULT_PRODUCTIVITY_GROWTH;
}

async function ensureReferralSettingsTable(pool) {
    const createSql = `CREATE TABLE IF NOT EXISTS referral_settings (
        config_id INT NOT NULL AUTO_INCREMENT,
        version_id INT NOT NULL,
        total_to_quality_ratios LONGTEXT DEFAULT NULL,
        wins_to_quality_ratios LONGTEXT DEFAULT NULL,
        productivity_growth_rate DECIMAL(7,4) DEFAULT '0.0100',
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        PRIMARY KEY (config_id),
        UNIQUE KEY uniq_referral_settings_version (version_id),
        CONSTRAINT referral_settings_version_fk FOREIGN KEY (version_id)
            REFERENCES forecast_versions (version_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;

    await pool.execute(createSql);
}

router.get('/', async (req, res) => {
    const versionId = Number.parseInt(req.query.versionId, 10);
    if (!versionId) {
        return res.status(400).json({ error: 'versionId query parameter is required' });
    }

    const forecastPool = req.app.locals.forecastPool;
    if (!forecastPool) {
        logger.error('Forecast pool not configured when fetching referral settings');
        return res.status(500).json({ error: 'Database connection not available' });
    }

    await ensureReferralSettingsTable(forecastPool);

    try {
        const [rows] = await forecastPool.execute(
            'SELECT * FROM referral_settings WHERE version_id = ? LIMIT 1',
            [versionId]
        );

        if (!rows || rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    versionId,
                    totalToQuality: buildDefaultRatioMap(DEFAULT_TOTAL_RATIO),
                    winsToQuality: buildDefaultRatioMap(DEFAULT_WINS_RATIO),
                    productivityGrowth: DEFAULT_PRODUCTIVITY_GROWTH,
                    updatedAt: null,
                    updatedBy: null
                }
            });
        }

        const record = rows[0];
        let totalRatios = buildDefaultRatioMap(DEFAULT_TOTAL_RATIO);
        let winsRatios = buildDefaultRatioMap(DEFAULT_WINS_RATIO);

        try {
            const parsedTotals = record.total_to_quality_ratios
                ? JSON.parse(record.total_to_quality_ratios)
                : {};
            totalRatios = normalizeRatioPayload(parsedTotals, DEFAULT_TOTAL_RATIO);
        } catch (err) {
            logger.warn('Failed to parse total_to_quality_ratios JSON. Using defaults.', err);
        }

        try {
            const parsedWins = record.wins_to_quality_ratios
                ? JSON.parse(record.wins_to_quality_ratios)
                : {};
            winsRatios = normalizeRatioPayload(parsedWins, DEFAULT_WINS_RATIO);
        } catch (err) {
            logger.warn('Failed to parse wins_to_quality_ratios JSON. Using defaults.', err);
        }

        return res.json({
            success: true,
            data: {
                versionId,
                totalToQuality: totalRatios,
                winsToQuality: winsRatios,
                productivityGrowth: Number(record.productivity_growth_rate) || DEFAULT_PRODUCTIVITY_GROWTH,
                updatedAt: record.updated_at,
                updatedBy: record.updated_by || null
            }
        });
    } catch (error) {
        logger.error('Failed to fetch referral settings', error);
        return res.status(500).json({ error: 'Failed to fetch referral settings' });
    }
});

router.put('/', async (req, res) => {
    const { versionId, totalToQuality, winsToQuality, productivityGrowthRate, updatedBy } = req.body || {};
    const parsedVersionId = Number.parseInt(versionId, 10);
    if (!parsedVersionId) {
        return res.status(400).json({ error: 'versionId is required' });
    }

    const forecastPool = req.app.locals.forecastPool;
    if (!forecastPool) {
        logger.error('Forecast pool not configured when saving referral settings');
        return res.status(500).json({ error: 'Database connection not available' });
    }

    await ensureReferralSettingsTable(forecastPool);
    if (await rejectIfVersionLocked({ poolOrConnection: forecastPool, res, versionId: parsedVersionId })) {
        return;
    }

    const normalizedTotals = normalizeRatioPayload(totalToQuality, DEFAULT_TOTAL_RATIO);
    const normalizedWins = normalizeRatioPayload(winsToQuality, DEFAULT_WINS_RATIO);
    const normalizedGrowth = normalizeGrowth(productivityGrowthRate);

    try {
        await forecastPool.execute(
            `INSERT INTO referral_settings (
                version_id, total_to_quality_ratios, wins_to_quality_ratios,
                productivity_growth_rate, updated_by
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                total_to_quality_ratios = VALUES(total_to_quality_ratios),
                wins_to_quality_ratios = VALUES(wins_to_quality_ratios),
                productivity_growth_rate = VALUES(productivity_growth_rate),
                updated_by = VALUES(updated_by)`,
            [
                parsedVersionId,
                JSON.stringify(normalizedTotals),
                JSON.stringify(normalizedWins),
                normalizedGrowth,
                updatedBy || null
            ]
        );

        return res.json({
            success: true,
            data: {
                versionId: parsedVersionId,
                totalToQuality: normalizedTotals,
                winsToQuality: normalizedWins,
                productivityGrowth: normalizedGrowth,
                updatedBy: updatedBy || null,
                updatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Failed to save referral settings', error);
        return res.status(500).json({ error: 'Failed to save referral settings' });
    }
});

module.exports = router;
