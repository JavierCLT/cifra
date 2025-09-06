// routes/incentives.js
// ----------------------------------------------------------------------------
// Incentive-configuration API: compensable metrics + quality ratios
// Works with the revamped admin panel (simpler paths) and the legacy ones.
// ----------------------------------------------------------------------------
const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');

/* ── helpers ── */
const monthMap = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
};

function toDate (periodStr) {
  // Accepts "Jan-24"  or "2024-01"
  let y, m;
  const a = periodStr.match(/^([A-Za-z]{3})-(\d{2,4})$/);      // Jan-24
  const b = periodStr.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);   // 2024-01 or 2024-01-01
  if (a) {
    m = monthMap[a[1]];
    y = a[2].length === 2 ? '20' + a[2] : a[2];
  } else if (b) {
    y = b[1];
    m = b[2];
  } else {
    throw new Error('Bad period format');
  }
  return `${y}-${m}-01`;
}

/* ========================================================================== */
/* 1. COMPENSABLE METRICS ENDPOINTS (new admin panel)                         */
/* ========================================================================== */

/**
 * GET /api/incentives/compensable-metrics
 * Returns: [{ team_id, metric_category, is_compensable }, … ]
 */
router.get('/compensable-metrics', async (req, res) => {
  const versionId = Number(req.query.versionId) || null;
  try {
    const pool = req.app.locals.forecastPool;
    if (versionId) {
      // Prefer sentinel effective_date for the selected version
      const [sentinel] = await pool.query(
        `SELECT team_id, metric_category, is_compensable
           FROM incentive_compensable_metrics
          WHERE version_id = ? AND effective_date = '2099-12-01'`,
        [versionId]
      );
      if (sentinel.length) return res.json({ success: true, data: sentinel });
      // Fallback to latest effective_date per team/metric for that version
      const [rows] = await pool.query(
        `SELECT icm.team_id, icm.metric_category, icm.is_compensable
           FROM incentive_compensable_metrics icm
           JOIN (
                 SELECT team_id, metric_category, version_id, MAX(effective_date) AS eff
                   FROM incentive_compensable_metrics
                  WHERE version_id = ?
                  GROUP BY team_id, metric_category, version_id
                ) latest
             ON icm.team_id = latest.team_id
            AND icm.metric_category = latest.metric_category
            AND icm.version_id = latest.version_id
            AND (icm.effective_date <=> latest.eff)`,
        [versionId]
      );
      return res.json({ success: true, data: rows });
    }
    // No version filter: return all rows (legacy)
    const [allRows] = await pool.query(
      `SELECT team_id, metric_category, is_compensable, version_id, effective_date
         FROM incentive_compensable_metrics`
    );
    return res.json({ success: true, data: allRows });
  } catch (err) {
    logger.error(err);
    return res.status(500).json({ error: 'Failed to fetch compensable metrics' });
  }
});

/**
 * POST /api/incentives/compensable-metrics
 * Body: { updates:[{team_id, metric, is_compensable}], updatedBy }
 */
router.post('/compensable-metrics', async (req, res) => {
  const { updates = [], updatedBy = 'system' } = req.body;
  if (!Array.isArray(updates) || !updates.length) {
    return res.status(400).json({ error: 'No updates supplied' });
  }

  const conn = await req.app.locals.forecastPool.getConnection();
  try {
    await conn.beginTransaction();
    for (const u of updates) {
      const teamId = parseInt(u.team_id);
      const metric = u.metric;
      const isComp = !!u.is_compensable;
      const versionId = u.version_id != null ? parseInt(u.version_id) : 0;
      // Use sentinel effective_date so we upsert the same row per version
      await conn.query(
        `INSERT INTO incentive_compensable_metrics
           (team_id, metric_category, version_id, effective_date, is_compensable, updated_by)
         VALUES (?, ?, ?, '2099-12-01', ?, ?)
         ON DUPLICATE KEY UPDATE
           is_compensable = VALUES(is_compensable),
           updated_by     = VALUES(updated_by),
           updated_at     = NOW()`,
        [teamId, metric, versionId, isComp, updatedBy]
      );
    }
    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    logger.error(err);
    return res.status(500).json({ error: 'Failed to save compensable metrics' });
  } finally {
    conn.release();
  }
});

/* ========================================================================== */
/* 2. QUALITY-RATIO ENDPOINTS                                                 */
/*    - Legacy (period + versionId)               -> unchanged                */
/*    - New   (/quality-ratios/:teamId)           -> added                    */
/*    - POST accepts BOTH the old and the new body shape                      */
/* ========================================================================== */

/* ── 2a. NEW: fetch "current" ratios (no period / version) ─────────────────‐ */
router.get('/quality-ratios/:teamId', async (req, res) => {
  const { teamId }   = req.params;
  const versionId    = Number(req.query.versionId) || null; // optional override
  const pool         = req.app.locals.forecastPool;

  try {
    const sql = `
      SELECT ratio_type,
             ratio_value
        FROM incentive_quality_ratios
       WHERE team_id = ?
         ${versionId ? 'AND version_id = ?' : ''}
       ORDER BY period_date DESC, version_id DESC`;

    const params = versionId ? [teamId, versionId] : [teamId];
    const [rows] = await pool.query(sql, params);

    if (!rows.length) {
      return res.json({ success: true, data: {} }); // empty but 200 OK
    }

    // First row per ratio_type wins (we sorted DESC)
    const map = {};
    for (const r of rows) {
      if (!(r.ratio_type in map)) map[r.ratio_type] = +r.ratio_value;
    }
    return res.json({ success: true, data: map });
  } catch (err) {
    logger.error(err);
    return res.status(500).json({ error: 'Failed to fetch quality ratios' });
  }
});

/* ── 2b. LEGACY route (unchanged) ─────────────────────────────────────────── */
router.get('/quality-ratios/:teamId/:period', async (req, res) => {
  const { teamId, period } = req.params;
  const versionId = Number(req.query.versionId);
  if (isNaN(teamId) || isNaN(versionId)) {
    return res.status(400).json({ error: 'Bad teamId or versionId' });
  }

  try {
    const periodDate = toDate(period);
    const [rows] = await req.app.locals.forecastPool.query(
      `SELECT ratio_type, ratio_value
         FROM incentive_quality_ratios
        WHERE team_id     = ?
          AND period_date = ?
          AND version_id  = ?`,
      [teamId, periodDate, versionId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'No ratios' });
    }

    return res.json({
      success: true,
      data: Object.fromEntries(rows.map(r => [r.ratio_type, +r.ratio_value]))
    });
  } catch (err) {
    logger.error(err);
    return res.status(500).json({ error: 'Failed to fetch quality ratios' });
  }
});

/* ── 2c. POST  (handles BOTH shapes) ────────────────────────────────────────
 *
 * Old shape from earlier code:
 *   {
 *     teamId, versionId, ratios:{ ... }, forecastStart:"YYYY-MM-01",
 *     forecastEnd:"YYYY-MM-01"
 *   }
 *
 * New shape from the simplified admin panel:
 *   {
 *     team_id,
 *     investment_accounts_ratio: 0.8,
 *     banking_accounts_ratio:    0.9,
 *     ...
 *   }
 */
router.post('/quality-ratios', async (req, res) => {
  const pool = req.app.locals.forecastPool;

  /* ------------------------------------------------------------------ */
  /* 2c-1  New body shape (no version / period)                          */
  /* ------------------------------------------------------------------ */
  if (req.body && req.body.team_id && !req.body.ratios) {
    const { team_id, version_id = null, ...ratioFields } = req.body;
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Store as version-specific (requested behavior). Use a sentinel period
      // so ratios are version-wide, not month-specific.
      const periodDate = '2099-12-01';
      const versionId  = version_id != null ? Number(version_id) : 0;

      for (const [typeKey, value] of Object.entries(ratioFields)) {
        if (!typeKey.endsWith('_ratio')) continue;              // skip junk
        const ratioType = typeKey.replace(/_ratio$/, '');       // strip suffix
        await conn.query(
          `INSERT INTO incentive_quality_ratios
             (team_id, period_date, version_id, ratio_type, ratio_value)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE ratio_value = VALUES(ratio_value)`,
          [team_id, periodDate, versionId, ratioType, parseFloat(value)]
        );
      }

      await conn.commit();
      return res.json({ success: true });
    } catch (err) {
      await conn.rollback();
      logger.error(err);
      return res.status(500).json({ error: 'Failed to save quality ratios' });
    } finally {
      conn.release();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 2c-2  Legacy body shape (with period range & ratios object)         */
  /* ------------------------------------------------------------------ */
  const { teamId, versionId, ratios, forecastStart, forecastEnd } = req.body;
  if (!teamId || !versionId || !ratios) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  // build list of first-of-month dates between start & end (inclusive)
  const dates = [];
  let cur = new Date(forecastStart);
  const end = new Date(forecastEnd);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const d of dates) {
      for (const [type, val] of Object.entries(ratios)) {
        await conn.query(
          `INSERT INTO incentive_quality_ratios
             (team_id, period_date, version_id, ratio_type, ratio_value)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE ratio_value = VALUES(ratio_value)`,
          [teamId, d, versionId, type, val]
        );
      }
    }
    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    logger.error(err);
    return res.status(500).json({ error: 'Failed to save quality ratios' });
  } finally {
    conn.release();
  }
});

/* ========================================================================== */
module.exports = router;
