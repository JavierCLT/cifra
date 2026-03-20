// public/js/referral-constants.js
// Centralized definitions for referral flows and default ratios
(function () {
    if (typeof window === 'undefined') {
        return;
    }

    const OUTBOUND_FLOWS = [
        { key: 'fsa_mlwm', label: 'FSA to MLWM' },
        { key: 'mfsa_hl', label: 'MFSA to HL' },
        { key: 'mfsa_sb', label: 'MFSA to SB' },
        { key: 'fsa_bsa', label: 'FSA to BSA' },
        { key: 'fsa_cvl', label: 'FSA to CVL' },
        { key: 'fsa_hl', label: 'FSA to HL' },
        { key: 'fsa_sb', label: 'FSA to SB' }
    ];

    const INBOUND_FLOWS = [
        { key: 'merrill_ci', label: 'Merrill to CI' },
        { key: 'privatebank_ci', label: 'Private Bank to CI' },
        { key: 'centralized', label: 'Centralized' },
        { key: 'hl_ci', label: 'HL to CI' },
        { key: 'csa_ci', label: 'CSA to CI' },
        { key: 'preferred_ci', label: 'Preferred Banking to CI' },
        { key: 'bsa_ci', label: 'BSA to CI' }
    ];

    const DEFAULT_TOTAL_RATIO = 1.2;
    const DEFAULT_WINS_RATIO = 0.3;
    const DEFAULT_PRODUCTIVITY_GROWTH = 0.01;

    if (!Array.isArray(window.REFERRAL_OUTBOUND_FLOWS) || !window.REFERRAL_OUTBOUND_FLOWS.length) {
        window.REFERRAL_OUTBOUND_FLOWS = OUTBOUND_FLOWS;
    }
    if (!Array.isArray(window.REFERRAL_INBOUND_FLOWS) || !window.REFERRAL_INBOUND_FLOWS.length) {
        window.REFERRAL_INBOUND_FLOWS = INBOUND_FLOWS;
    }
    if (typeof window.REFERRAL_DEFAULT_TOTAL_RATIO !== 'number') {
        window.REFERRAL_DEFAULT_TOTAL_RATIO = DEFAULT_TOTAL_RATIO;
    }
    if (typeof window.REFERRAL_DEFAULT_WINS_RATIO !== 'number') {
        window.REFERRAL_DEFAULT_WINS_RATIO = DEFAULT_WINS_RATIO;
    }
    if (typeof window.REFERRAL_DEFAULT_PRODUCTIVITY_GROWTH !== 'number') {
        window.REFERRAL_DEFAULT_PRODUCTIVITY_GROWTH = DEFAULT_PRODUCTIVITY_GROWTH;
    }
})();
