const fs = require('fs');
const path = 'public/js/main.js';
let text = fs.readFileSync(path, 'utf8');
const marker = "        transformed.pgLevels.PG7[period] = parseInt(row.pg7_headcount) || 0;\r\n        \r\n        // ENSURE PRODUCTIVITY IS ALWAYS 2 DECIMALS";
const insertion = "        transformed.pgLevels.PG7[period] = parseInt(row.pg7_headcount) || 0;\r\n        \r\n        const startingFlow = Number(row.starting_headcount ?? 0);\r\n        transformed.headcountFlows.starting_headcount[period] = Number.isFinite(startingFlow) ? startingFlow : 0;\r\n\r\n        const flowKeys = ['flow_1', 'flow_2', 'flow_3', 'flow_4', 'flow_5'];\r\n        let flowSum = 0;\r\n        flowKeys.forEach(key => {\r\n            const numeric = Number(row[key] ?? 0);\r\n            const safeValue = Number.isFinite(numeric) ? numeric : 0;\r\n            transformed.headcountFlows[key][period] = safeValue;\r\n            flowSum += safeValue;\r\n        });\r\n\r\n        const endingCandidate = row.ending_headcount != null ? Number(row.ending_headcount) : startingFlow + flowSum;\r\n        const endingValue = Number.isFinite(endingCandidate) ? endingCandidate : startingFlow + flowSum;\r\n        transformed.headcountFlows.ending_headcount[period] = endingValue;\r\n        \r\n        // ENSURE PRODUCTIVITY IS ALWAYS 2 DECIMALS";
if (!text.includes(marker)) {
    throw new Error('marker not found');
}
text = text.replace(marker, insertion);
fs.writeFileSync(path, text);
