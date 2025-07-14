/**
 * Convert a forecast-period string into canonical
 * "YYYY-MM-01" (ISO-date) for SQL queries.
 *
 * Accepted inputs: "Jan-24", "Jan-2024", "2024-01", "2024-01-15"
 */
const monthMap = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function periodToDate(periodStr) {
  let y, m;

  const m1 = periodStr.match(/^([A-Za-z]{3})-(\d{2,4})$/);       // Jan-24
  const m2 = periodStr.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);    // 2024-01-…

  if (m1) {
    m = monthMap[m1[1]];
    y = m1[2].length === 2 ? `20${m1[2]}` : m1[2];
  } else if (m2) {
    y = m2[1];
    m = m2[2];
  } else {
    throw new Error('Invalid period format');           // handled by caller
  }

  return `${y}-${m}-01`;
}

module.exports = periodToDate;
