// routes/nonSales.js - Non-Sales headcount routes
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Ensure table exists helper
async function ensureNonSalesTable(pool) {
  const ddl = `CREATE TABLE IF NOT EXISTS forecast_non_sales_headcount (
    id int NOT NULL AUTO_INCREMENT,
    team_id int NOT NULL,
    period_date date NOT NULL,
    version_id int NOT NULL,
    ns_pg1_headcount int DEFAULT '0',
    ns_pg2_headcount int DEFAULT '0',
    ns_pg3_headcount int DEFAULT '0',
    ns_pg4_headcount int DEFAULT '0',
    ns_pg5_headcount int DEFAULT '0',
    ns_pg6_headcount int DEFAULT '0',
    ns_pg7_headcount int DEFAULT '0',
    created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by varchar(100) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY unique_team_period_version (team_id,period_date,version_id),
    KEY idx_period_date (period_date),
    CONSTRAINT forecast_non_sales_headcount_ibfk_1 FOREIGN KEY (version_id) REFERENCES forecast_versions (version_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;
  try {
    await pool.query(ddl);
  } catch (e) {
    logger.error('Failed to ensure forecast_non_sales_headcount table:', e);
    throw e;
  }
}

// GET non-sales ACTUALS for a team (from actuals DB)
// Returns rows with period_date and ns_pg1..ns_pg7 derived from actuals data/view
router.get('/actuals/team/:teamId', async (req, res) => {
  try {
    const pool = req.app.locals.actualsPool;
    if (!pool) return res.status(500).json({ success: false, error: 'Actuals database not available' });

    const { teamId } = req.params;

    // Compute non-sales actuals on the fly from actuals_data (no view required)
    const [rows] = await pool.query(
      `SELECT 
         team_id,
         period_date,
         CAST(ROUND(headcount_pg1 * 0.15) AS SIGNED) AS ns_pg1_headcount,
         CAST(ROUND(headcount_pg2 * 0.15) AS SIGNED) AS ns_pg2_headcount,
         CAST(ROUND(headcount_pg3 * 0.15) AS SIGNED) AS ns_pg3_headcount,
         CAST(ROUND(headcount_pg4 * 0.15) AS SIGNED) AS ns_pg4_headcount,
         CAST(ROUND(headcount_pg5 * 0.15) AS SIGNED) AS ns_pg5_headcount,
         CAST(ROUND(headcount_pg6 * 0.15) AS SIGNED) AS ns_pg6_headcount,
         CAST(ROUND(headcount_pg7 * 0.15) AS SIGNED) AS ns_pg7_headcount
       FROM actuals_data
       WHERE team_id = ?
       ORDER BY period_date`,
      [parseInt(teamId)]
    );

    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('Non-Sales actuals fetch failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch non-sales actuals' });
  }
});

// Upsert non-sales headcount for a single field
router.put('/data', async (req, res) => {
  const pool = req.app.locals.forecastPool;
  if (!pool) return res.status(500).json({ success: false, error: 'Database connection not available' });

  const { teamId, periodDate, versionId, field, value, updatedBy } = req.body || {};
  const allowed = [
    'ns_pg1_headcount','ns_pg2_headcount','ns_pg3_headcount','ns_pg4_headcount',
    'ns_pg5_headcount','ns_pg6_headcount','ns_pg7_headcount'
  ];
  if (!teamId || !periodDate || !versionId || !field || value == null) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  if (!allowed.includes(field)) {
    return res.status(400).json({ success: false, error: `Invalid field: ${field}` });
  }

  const conn = await pool.getConnection();
  try {
    // Check if exists
    const [existing] = await conn.execute(
      `SELECT id FROM forecast_non_sales_headcount WHERE team_id = ? AND period_date = ? AND version_id = ?`,
      [teamId, periodDate, versionId]
    );
    const numericValue = parseInt(value, 10) || 0;
    if (existing.length === 0) {
      await conn.execute(
        `INSERT INTO forecast_non_sales_headcount (team_id, period_date, version_id, ${field}, updated_by)
         VALUES (?, ?, ?, ?, ?)`,
        [teamId, periodDate, versionId, numericValue, updatedBy || 'system']
      );
    } else {
      await conn.execute(
        `UPDATE forecast_non_sales_headcount
           SET ${field} = ?, updated_at = NOW(), updated_by = ?
         WHERE team_id = ? AND period_date = ? AND version_id = ?`,
        [numericValue, updatedBy || 'system', teamId, periodDate, versionId]
      );
    }
    return res.json({ success: true });
  } catch (err) {
    if (err && err.code === 'ER_NO_SUCH_TABLE') {
      try {
        await ensureNonSalesTable(pool);
        // retry once after creating table
        const [existing] = await conn.execute(
          `SELECT id FROM forecast_non_sales_headcount WHERE team_id = ? AND period_date = ? AND version_id = ?`,
          [teamId, periodDate, versionId]
        );
        const numericValue = parseInt(value, 10) || 0;
        if (existing.length === 0) {
          await conn.execute(
            `INSERT INTO forecast_non_sales_headcount (team_id, period_date, version_id, ${field}, updated_by)
             VALUES (?, ?, ?, ?, ?)`,
            [teamId, periodDate, versionId, numericValue, updatedBy || 'system']
          );
        } else {
          await conn.execute(
            `UPDATE forecast_non_sales_headcount
               SET ${field} = ?, updated_at = NOW(), updated_by = ?
             WHERE team_id = ? AND period_date = ? AND version_id = ?`,
            [numericValue, updatedBy || 'system', teamId, periodDate, versionId]
          );
        }
        return res.json({ success: true });
      } catch (e2) {
        logger.error('Non-Sales update failed after ensuring table:', e2);
        return res.status(500).json({ success: false, error: 'Failed to update non-sales headcount' });
      }
    }
    logger.error('Non-Sales update failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to update non-sales headcount' });
  } finally {
    conn.release();
  }
});

// Fetch non-sales headcount for a team/version
router.get('/team/:teamId', async (req, res) => {
  const pool = req.app.locals.forecastPool;
  if (!pool) return res.status(500).json({ success: false, error: 'Database connection not available' });

  const { teamId } = req.params;
  const { versionId } = req.query;
  if (!versionId) return res.status(400).json({ success: false, error: 'versionId is required' });
  try {
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT * FROM forecast_non_sales_headcount
           WHERE team_id = ? AND version_id = ?
           ORDER BY period_date`,
        [parseInt(teamId), parseInt(versionId)]
      );
    } catch (err) {
      if (err && err.code === 'ER_NO_SUCH_TABLE') {
        await ensureNonSalesTable(pool);
        [rows] = await pool.query(
          `SELECT * FROM forecast_non_sales_headcount
             WHERE team_id = ? AND version_id = ?
             ORDER BY period_date`,
          [parseInt(teamId), parseInt(versionId)]
        );
      } else {
        throw err;
      }
    }
    return res.json({ success: true, data: rows, count: rows.length });
  } catch (err) {
    logger.error('Non-Sales fetch failed:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch non-sales headcount' });
  }
});

module.exports = router;
