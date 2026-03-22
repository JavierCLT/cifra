const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { rejectIfVersionLocked } = require('../utils/forecast-guards');

const PRODUCT_KEYS = ['product1', 'product2', 'product3', 'product4'];
const ASSET_KEYS = ['cash', 'margin', 'equity', 'fixedIncome', 'options'];
const MONTH_KEY_PATTERN = /^[A-Z][a-z]{2}-\d{2}$/;

async function ensureKmpcSettingsTable(pool) {
    const createSqlJson = `CREATE TABLE IF NOT EXISTS kmpc_settings (
        config_id INT NOT NULL AUTO_INCREMENT,
        version_id INT NOT NULL,
        scalar_inputs JSON DEFAULT NULL,
        monthly_series JSON DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        PRIMARY KEY (config_id),
        UNIQUE KEY uniq_kmpc_settings_version (version_id),
        CONSTRAINT kmpc_settings_version_fk FOREIGN KEY (version_id) REFERENCES forecast_versions (version_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;
    const createSqlText = `CREATE TABLE IF NOT EXISTS kmpc_settings (
        config_id INT NOT NULL AUTO_INCREMENT,
        version_id INT NOT NULL,
        scalar_inputs LONGTEXT DEFAULT NULL,
        monthly_series LONGTEXT DEFAULT NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by VARCHAR(100) DEFAULT NULL,
        PRIMARY KEY (config_id),
        UNIQUE KEY uniq_kmpc_settings_version (version_id),
        CONSTRAINT kmpc_settings_version_fk FOREIGN KEY (version_id) REFERENCES forecast_versions (version_id) ON DELETE CASCADE
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

function normalizeNumber(value) {
    if (value === '' || value == null) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNegativeInteger(value) {
    if (value === '' || value == null) {
        return null;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed >= 0) {
        return null;
    }
    return Math.trunc(parsed);
}

function normalizeObjectValues(payload, keys) {
    const normalized = {};
    keys.forEach(key => {
        normalized[key] = normalizeNumber(payload?.[key]);
    });
    return normalized;
}

function buildDefaultData() {
    return {
        scalarInputs: {
            investmentsRevenueVelocity: normalizeObjectValues({}, PRODUCT_KEYS),
            investmentsExpenseVelocity: normalizeObjectValues({}, PRODUCT_KEYS),
            accountAttrition: normalizeObjectValues({}, PRODUCT_KEYS),
            accountsPayingOtherFeesPct: normalizeObjectValues({}, PRODUCT_KEYS),
            otherFeesPerAccount: normalizeObjectValues({}, PRODUCT_KEYS),
            outflowsRunRatePct: null,
            inflowsRunRatePct: null,
            revenueVelocityByAssetType: normalizeObjectValues({}, ASSET_KEYS),
            assetMix: normalizeObjectValues({}, ASSET_KEYS)
        },
        monthlySeries: {
            depositAvgBalances: {},
            sp500: {},
            depositsInterestIncomeRate: {},
            depositsRatePaid: {},
            marginInterestIncomeRate: {},
            marginRatePaid: {},
            cashOffers: {}
        }
    };
}

function normalizeScalarInputs(payload) {
    return {
        investmentsRevenueVelocity: normalizeObjectValues(payload?.investmentsRevenueVelocity, PRODUCT_KEYS),
        investmentsExpenseVelocity: normalizeObjectValues(payload?.investmentsExpenseVelocity, PRODUCT_KEYS),
        accountAttrition: normalizeObjectValues(payload?.accountAttrition, PRODUCT_KEYS),
        accountsPayingOtherFeesPct: normalizeObjectValues(payload?.accountsPayingOtherFeesPct, PRODUCT_KEYS),
        otherFeesPerAccount: normalizeObjectValues(payload?.otherFeesPerAccount, PRODUCT_KEYS),
        outflowsRunRatePct: normalizeNumber(payload?.outflowsRunRatePct),
        inflowsRunRatePct: normalizeNumber(payload?.inflowsRunRatePct),
        revenueVelocityByAssetType: normalizeObjectValues(payload?.revenueVelocityByAssetType, ASSET_KEYS),
        assetMix: normalizeObjectValues(payload?.assetMix, ASSET_KEYS)
    };
}

function normalizeSeriesValues(payload, normalizer = normalizeNumber) {
    const normalized = {};
    if (!payload || typeof payload !== 'object') {
        return normalized;
    }

    Object.entries(payload).forEach(([monthKey, value]) => {
        if (!MONTH_KEY_PATTERN.test(String(monthKey || ''))) {
            return;
        }
        normalized[monthKey] = normalizer(value);
    });

    return normalized;
}

function normalizeMonthlySeries(payload) {
    return {
        depositAvgBalances: normalizeSeriesValues(payload?.depositAvgBalances),
        sp500: normalizeSeriesValues(payload?.sp500),
        depositsInterestIncomeRate: normalizeSeriesValues(payload?.depositsInterestIncomeRate ?? payload?.rateCurve),
        depositsRatePaid: normalizeSeriesValues(payload?.depositsRatePaid),
        marginInterestIncomeRate: normalizeSeriesValues(payload?.marginInterestIncomeRate),
        marginRatePaid: normalizeSeriesValues(payload?.marginRatePaid),
        cashOffers: normalizeSeriesValues(payload?.cashOffers, normalizeNegativeInteger)
    };
}

function parseStoredJson(rawValue, fallback) {
    if (rawValue == null) {
        return fallback;
    }

    if (typeof rawValue === 'string') {
        if (!rawValue.trim()) {
            return fallback;
        }
        return JSON.parse(rawValue);
    }

    return rawValue;
}

router.get('/', async (req, res) => {
    const versionId = Number.parseInt(req.query.versionId, 10);
    if (!versionId) {
        return res.status(400).json({ error: 'versionId query parameter is required' });
    }

    const forecastPool = req.app.locals.forecastPool;
    if (!forecastPool) {
        logger.error('Forecast pool not configured when fetching KMPC settings');
        return res.status(500).json({ error: 'Database connection not available' });
    }

    await ensureKmpcSettingsTable(forecastPool);

    try {
        const [rows] = await forecastPool.execute(
            'SELECT * FROM kmpc_settings WHERE version_id = ? LIMIT 1',
            [versionId]
        );

        if (!rows || rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    versionId,
                    ...buildDefaultData(),
                    updatedAt: null,
                    updatedBy: null
                }
            });
        }

        const record = rows[0];
        const scalarInputs = normalizeScalarInputs(parseStoredJson(record.scalar_inputs, {}));
        const monthlySeries = normalizeMonthlySeries(parseStoredJson(record.monthly_series, {}));

        return res.json({
            success: true,
            data: {
                versionId,
                scalarInputs,
                monthlySeries,
                updatedAt: record.updated_at || null,
                updatedBy: record.updated_by || null
            }
        });
    } catch (error) {
        logger.error('Failed to fetch KMPC settings', error);
        return res.status(500).json({ error: 'Failed to fetch KMPC settings' });
    }
});

router.put('/', async (req, res) => {
    const { versionId, scalarInputs, monthlySeries, updatedBy } = req.body || {};
    const parsedVersionId = Number.parseInt(versionId, 10);

    if (!parsedVersionId) {
        return res.status(400).json({ error: 'versionId is required' });
    }

    const forecastPool = req.app.locals.forecastPool;
    if (!forecastPool) {
        logger.error('Forecast pool not configured when saving KMPC settings');
        return res.status(500).json({ error: 'Database connection not available' });
    }

    await ensureKmpcSettingsTable(forecastPool);
    if (await rejectIfVersionLocked({ poolOrConnection: forecastPool, res, versionId: parsedVersionId })) {
        return;
    }

    const normalizedScalarInputs = normalizeScalarInputs(scalarInputs);
    const normalizedMonthlySeries = normalizeMonthlySeries(monthlySeries);

    try {
        await forecastPool.execute(
            `INSERT INTO kmpc_settings (
                version_id, scalar_inputs, monthly_series, updated_by
            ) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                scalar_inputs = VALUES(scalar_inputs),
                monthly_series = VALUES(monthly_series),
                updated_by = VALUES(updated_by)`,
            [
                parsedVersionId,
                JSON.stringify(normalizedScalarInputs),
                JSON.stringify(normalizedMonthlySeries),
                updatedBy || null
            ]
        );

        return res.json({
            success: true,
            data: {
                versionId: parsedVersionId,
                scalarInputs: normalizedScalarInputs,
                monthlySeries: normalizedMonthlySeries,
                updatedBy: updatedBy || null
            }
        });
    } catch (error) {
        logger.error('Failed to save KMPC settings', error);
        return res.status(500).json({ error: 'Failed to save KMPC settings' });
    }
});

module.exports = router;
