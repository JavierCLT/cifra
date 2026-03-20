// routes/nonSales.js - Non-Sales headcount routes (group/team level)
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');
const { rejectIfVersionLocked } = require('../utils/forecast-guards');

const DATA_PATH = path.join(__dirname, '..', 'data', 'non_sales_headcount.json');

const GROUP_CONFIG = {
  operations: {
    displayName: 'Operations',
    baselineGroupName: 'Operations',
    teams: [
      { teamId: 9201, teamName: 'Team 1' },
      { teamId: 9202, teamName: 'Team 2' },
      { teamId: 9203, teamName: 'Team 3' },
      { teamId: 9204, teamName: 'Team 4' }
    ]
  },
  management: {
    displayName: 'Management',
    baselineGroupName: 'Management',
    teams: [
      { teamId: 9211, teamName: 'Team 1' },
      { teamId: 9212, teamName: 'Team 2' },
      { teamId: 9213, teamName: 'Team 3' },
      { teamId: 9214, teamName: 'Team 4' }
    ]
  },
  'real-estate': {
    displayName: 'Real Estate',
    baselineGroupName: 'Real Estate',
    teams: [
      { teamId: 9231, teamName: 'Team 1' },
      { teamId: 9232, teamName: 'Team 2' },
      { teamId: 9233, teamName: 'Team 3' },
      { teamId: 9234, teamName: 'Team 4' }
    ]
  },
  hr: {
    displayName: 'HR',
    baselineGroupName: 'HR',
    teams: [
      { teamId: 9221, teamName: 'Team 1' },
      { teamId: 9222, teamName: 'Team 2' },
      { teamId: 9223, teamName: 'Team 3' },
      { teamId: 9224, teamName: 'Team 4' }
    ]
  }
};

let BASELINE_DATA = loadBaseline();

function loadBaseline() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const mapped = {};
    parsed.forEach(entry => {
      if (!mapped[entry.group]) {
        mapped[entry.group] = {};
      }
      mapped[entry.group][entry.team] = entry.data;
    });
    logger.info(`Loaded ${parsed.length} baseline non-sales records from ${DATA_PATH}`);
    return mapped;
  } catch (error) {
    logger.error('Failed to load non-sales baseline data:', error);
    return {};
  }
}

function formatMonthLabel(period) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [year, month] = period.split('-');
  const idx = parseInt(month, 10) - 1;
  return `${months[idx]}-${year.slice(-2)}`;
}

function findGroupByTeamId(teamId) {
  const entries = Object.entries(GROUP_CONFIG);
  for (const [key, group] of entries) {
    const team = group.teams.find(t => t.teamId === teamId);
    if (team) {
      return { groupKey: key, groupConfig: group, teamConfig: team };
    }
  }
  return null;
}

async function ensureNonSalesTable(pool) {
  const ddl = `CREATE TABLE IF NOT EXISTS forecast_non_sales_headcount (
    id INT NOT NULL AUTO_INCREMENT,
    team_id INT NOT NULL,
    period_date DATE NOT NULL,
    version_id INT NOT NULL,
    headcount INT DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY unique_team_period_version (team_id, period_date, version_id),
    KEY idx_period_date (period_date),
    CONSTRAINT forecast_non_sales_headcount_ibfk_1 FOREIGN KEY (version_id) REFERENCES forecast_versions (version_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`;
  await pool.query(ddl);
}

async function getForecastStartDate(pool, versionId) {
  const [rows] = await pool.query(
    'SELECT forecast_start_date FROM forecast_versions WHERE version_id = ?',
    [versionId]
  );
  return rows.length ? rows[0].forecast_start_date : null;
}

function buildBaselinePeriods(groupConfig) {
  const baselineGroup = BASELINE_DATA[groupConfig.baselineGroupName];
  if (!baselineGroup) {
    return [];
  }
  const firstTeam = groupConfig.teams[0]?.teamName;
  const firstTeamData = firstTeam ? baselineGroup[firstTeam] : null;
  if (!firstTeamData) {
    return [];
  }
  return Object.keys(firstTeamData).sort();
}

function getBaselineValue(groupConfig, teamConfig, period) {
  const baselineGroup = BASELINE_DATA[groupConfig.baselineGroupName] || {};
  const teamData = baselineGroup[teamConfig.teamName] || {};
  return teamData[period] ?? 0;
}

router.get('/group/:groupKey', async (req, res) => {
  const groupKey = req.params.groupKey;
  const { versionId } = req.query;

  const groupConfig = GROUP_CONFIG[groupKey];
  if (!groupConfig) {
    return res.status(404).json({ success: false, error: `Unknown group: ${groupKey}` });
  }

  const versionIdNum = parseInt(versionId, 10);
  if (!Number.isFinite(versionIdNum)) {
    return res.status(400).json({ success: false, error: 'versionId query parameter is required' });
  }

  const forecastPool = req.app.locals.forecastPool;
  if (!forecastPool) {
    return res.status(500).json({ success: false, error: 'Database connection not available' });
  }

  try {
    const forecastStartDate = await getForecastStartDate(forecastPool, versionIdNum);
    const periods = buildBaselinePeriods(groupConfig);

    if (!periods.length) {
      return res.json({ success: true, data: { groupKey, periods: [], teams: [], versionId: versionIdNum } });
    }

    const teamIds = groupConfig.teams.map(t => t.teamId);
    const placeholders = teamIds.map(() => '?').join(',');
    let overrides = {};

    if (teamIds.length) {
      try {
        const [rows] = await forecastPool.query(
          `SELECT team_id, period_date, headcount
           FROM forecast_non_sales_headcount
           WHERE version_id = ? AND team_id IN (${placeholders})`,
          [versionIdNum, ...teamIds]
        );
        overrides = rows.reduce((acc, row) => {
          const key = row.team_id;
          const period = row.period_date instanceof Date ? row.period_date.toISOString().slice(0, 10) : String(row.period_date).slice(0, 10);
          if (!acc[key]) acc[key] = {};
          acc[key][period] = typeof row.headcount === 'number' ? row.headcount : parseInt(row.headcount, 10) || 0;
          return acc;
        }, {});
      } catch (error) {
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
          await ensureNonSalesTable(forecastPool);
        } else {
          throw error;
        }
      }
    }

    const periodMeta = periods.map(period => {
      const status = forecastStartDate && new Date(period) >= new Date(forecastStartDate)
        ? 'Forecast'
        : 'Actual';
      return {
        period_date: period,
        label: formatMonthLabel(period),
        status
      };
    });

    const teams = groupConfig.teams.map(team => {
      const values = {};
      periods.forEach(period => {
        const override = overrides[team.teamId]?.[period];
        const baselineValue = getBaselineValue(groupConfig, team, period);
        values[period] = override != null ? override : baselineValue;
      });
      return {
        team_id: team.teamId,
        team_name: team.teamName,
        values
      };
    });

    res.json({
      success: true,
      data: {
        groupKey,
        groupName: groupConfig.displayName,
        forecastStartDate,
        versionId: versionIdNum,
        periods: periodMeta,
        teams
      }
    });
  } catch (error) {
    logger.error('Non-Sales group fetch failed:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch non-sales data' });
  }
});

// Legacy endpoint for actuals (now serves baseline data)
router.get('/actuals/team/:teamId', (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  if (!Number.isFinite(teamId)) {
    return res.status(400).json({ success: false, error: 'Invalid teamId' });
  }
  const mapping = findGroupByTeamId(teamId);
  if (!mapping) {
    return res.json({ success: true, data: [], count: 0 });
  }
  const { groupConfig, teamConfig } = mapping;
  const baselineGroup = BASELINE_DATA[groupConfig.baselineGroupName] || {};
  const teamData = baselineGroup[teamConfig.teamName] || {};
  const rows = Object.entries(teamData).map(([period, value]) => ({
    team_id: teamId,
    period_date: period,
    headcount: value
  }));
  res.json({ success: true, data: rows, count: rows.length });
});

// Legacy endpoint for forecast overrides (per team)
router.get('/team/:teamId', async (req, res) => {
  const teamId = parseInt(req.params.teamId, 10);
  const versionId = parseInt(req.query.versionId, 10);
  if (!Number.isFinite(teamId) || !Number.isFinite(versionId)) {
    return res.status(400).json({ success: false, error: 'teamId and versionId are required' });
  }

  const forecastPool = req.app.locals.forecastPool;
  if (!forecastPool) {
    return res.status(500).json({ success: false, error: 'Database connection not available' });
  }

  try {
    const [rows] = await forecastPool.query(
      `SELECT team_id, period_date, headcount
       FROM forecast_non_sales_headcount
       WHERE team_id = ? AND version_id = ?
       ORDER BY period_date`,
      [teamId, versionId]
    );
    res.json({ success: true, data: rows, count: rows.length });
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      try {
        await ensureNonSalesTable(forecastPool);
        const [rows] = await forecastPool.query(
          `SELECT team_id, period_date, headcount
           FROM forecast_non_sales_headcount
           WHERE team_id = ? AND version_id = ?
           ORDER BY period_date`,
          [teamId, versionId]
        );
        res.json({ success: true, data: rows, count: rows.length });
        return;
      } catch (err) {
        logger.error('Non-Sales forecast fetch failed after ensuring table:', err);
        return res.status(500).json({ success: false, error: 'Failed to fetch non-sales forecast data' });
      }
    }
    logger.error('Non-Sales forecast fetch failed:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch non-sales forecast data' });
  }
});

// Upsert non-sales headcount for a single team/month
router.put('/data', async (req, res) => {
  const pool = req.app.locals.forecastPool;
  if (!pool) return res.status(500).json({ success: false, error: 'Database connection not available' });

  const { teamId, periodDate, versionId, value, updatedBy } = req.body || {};
  if (!teamId || !periodDate || !versionId || value == null) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  const numericValue = parseInt(value, 10) || 0;
  const conn = await pool.getConnection();
  try {
    if (await rejectIfVersionLocked({ poolOrConnection: conn, res, versionId })) {
      return;
    }

    await ensureNonSalesTable(pool);
    const [existing] = await conn.execute(
      `SELECT id FROM forecast_non_sales_headcount WHERE team_id = ? AND period_date = ? AND version_id = ?`,
      [teamId, periodDate, versionId]
    );
    if (existing.length === 0) {
      await conn.execute(
        `INSERT INTO forecast_non_sales_headcount (team_id, period_date, version_id, headcount, updated_by)
         VALUES (?, ?, ?, ?, ?)`,
        [teamId, periodDate, versionId, numericValue, updatedBy || 'system']
      );
    } else {
      await conn.execute(
        `UPDATE forecast_non_sales_headcount
         SET headcount = ?, updated_at = NOW(), updated_by = ?
         WHERE team_id = ? AND period_date = ? AND version_id = ?`,
        [numericValue, updatedBy || 'system', teamId, periodDate, versionId]
      );
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error('Non-Sales update failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to update non-sales headcount' });
  } finally {
    conn.release();
  }
});

module.exports = router;
