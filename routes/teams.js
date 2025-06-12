// routes/teams.js - Updated to use database
const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Get all teams from database
router.get('/', async (req, res) => {
    try {
        // Get teams from forecast database
        const [teams] = await req.app.locals.forecastPool.query(`
            SELECT 
                team_id,
                team_name,
                team_group as group_name,
                group_display_name
            FROM v_active_teams
            ORDER BY group_order, team_id
        `);
        
        res.json({
            success: true,
            data: teams,
            count: teams.length
        });
    } catch (error) {
        logger.error('Error fetching teams:', error);
        res.status(500).json({ error: 'Failed to fetch teams' });
    }
});

// Get specific team
router.get('/:teamId', async (req, res) => {
    try {
        const teamId = parseInt(req.params.teamId);
        const [teams] = await req.app.locals.forecastPool.query(
            `SELECT * FROM v_active_teams WHERE team_id = ?`,
            [teamId]
        );
        
        if (teams.length === 0) {
            return res.status(404).json({ error: 'Team not found' });
        }
        
        res.json({
            success: true,
            data: teams[0]
        });
    } catch (error) {
        logger.error('Error fetching team:', error);
        res.status(500).json({ error: 'Failed to fetch team' });
    }
});

// Get all groups from database
router.get('/groups/all', async (req, res) => {
    try {
        // Get groups with their teams
        const [groups] = await req.app.locals.forecastPool.query(`
            SELECT 
                tg.group_code,
                tg.display_name,
                tg.display_order
            FROM team_groups tg
            WHERE tg.is_active = TRUE
            ORDER BY tg.display_order
        `);
        
        const [teams] = await req.app.locals.forecastPool.query(`
            SELECT team_id, team_name, team_group
            FROM v_active_teams
        `);
        
        // Format like the frontend expects
        const groupsObject = {};
        groups.forEach(group => {
            groupsObject[group.group_code] = {
                name: group.group_code,
                displayName: group.display_name,
                teams: teams
                    .filter(t => t.team_group === group.group_code)
                    .map(t => ({ id: t.team_id, name: t.team_name }))
            };
        });
        
        res.json({
            success: true,
            data: groupsObject,
            count: Object.keys(groupsObject).length
        });
    } catch (error) {
        logger.error('Error fetching groups:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// Get teams in a specific group
router.get('/groups/:groupName', async (req, res) => {
    try {
        const groupName = req.params.groupName.toUpperCase();
        
        const [teams] = await req.app.locals.forecastPool.query(
            `SELECT * FROM v_active_teams WHERE team_group = ?`,
            [groupName]
        );
        
        if (teams.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }
        
        res.json({
            success: true,
            data: {
                group: groupName,
                teams: teams
            }
        });
    } catch (error) {
        logger.error('Error fetching group teams:', error);
        res.status(500).json({ error: 'Failed to fetch group teams' });
    }
});

// Keep your existing permissions endpoint
router.get('/:teamId/permissions/:userEmail', async (req, res) => {
    try {
        const { teamId, userEmail } = req.params;
        const forecastPool = req.app.locals.forecastPool;
        
        const [permissions] = await forecastPool.query(
            `SELECT * FROM forecast_permissions 
             WHERE user_email = ? 
             AND (team_id = ? OR team_id IS NULL)
             ORDER BY team_id DESC
             LIMIT 1`,
            [userEmail, teamId]
        );
        
        res.json({
            success: true,
            data: permissions[0] || { permission_type: 'read' }
        });
    } catch (error) {
        logger.error('Error fetching permissions:', error);
        res.status(500).json({ error: 'Failed to fetch permissions' });
    }
});

module.exports = router;