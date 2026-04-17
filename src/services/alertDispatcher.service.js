const axios = require('axios');
require('dotenv').config();

const dispatchSlack = async (alertMessage) => {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn('[Alert Dispatcher] Slack integration skipped: SLACK_WEBHOOK_URL is missing in .env');
        return false;
    }
    try {
        await axios.post(webhookUrl, {
            text: alertMessage
        });
        console.log('[Alert Dispatcher] Slacked successful alert notification.');
        return true;
    } catch (err) {
        console.error('[Alert Dispatcher] Failed to dispatch Slack alert:', err.message);
        return false;
    }
};

const dispatchEmail = async (alertMessage) => {
    // MOCK implementation 
    console.log('[Alert Dispatcher] (MOCK) Email Sent!');
    console.log(`-- Email Body --\n${alertMessage}\n------------------`);
    return true;
};

const dispatchAlert = async (alertRecord) => {
    const { message, dispatched_channels } = alertRecord;
    
    // Resolve channels if valid array
    let channels = [];
    if (typeof dispatched_channels === 'string') {
        try { channels = JSON.parse(dispatched_channels); } catch (e) { channels = []; }
    } else if (Array.isArray(dispatched_channels)) {
        channels = dispatched_channels;
    } else {
        channels = ['email'];
    }

    if (channels.includes('slack')) {
        await dispatchSlack(`🚨 *Monitoring Alert*\n${message}`);
    }
    
    if (channels.includes('email')) {
        await dispatchEmail(`CRITICAL: Monitoring Alert Triggered\n\n${message}`);
    }
};

module.exports = {
    dispatchAlert
};
