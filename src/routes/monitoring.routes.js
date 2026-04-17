const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoring.controller');
const { verifyAuth } = require('../middleware/auth');

// Protect all monitoring routes
router.use(verifyAuth);

// Suite-level routes
router.post('/suites/:suite_id/sync', monitoringController.syncSuiteJobs);
router.post('/suites/:suite_id/jobs', monitoringController.createJob);
router.get('/suites/:suite_id/jobs', monitoringController.getJobs);
router.get('/suites/:suite_id/results', monitoringController.getSuiteResults);
router.get('/suites/:suite_id/alerts', monitoringController.getSuiteAlerts);

// Job-level routes
router.get('/jobs/:job_id/results', monitoringController.getJobResults);
router.get('/jobs/:job_id/alerts', monitoringController.getJobAlerts);
router.patch('/jobs/:job_id/toggle', monitoringController.toggleJob);
router.post('/jobs/:job_id/run', monitoringController.runJobNow);
router.delete('/jobs/:job_id', monitoringController.deleteJob);

// Alert actions
router.patch('/alerts/:alert_id/acknowledge', monitoringController.acknowledgeAlert);

// Monitoring Suites (job groups)
router.post('/suites/:suite_id/monitoring-suites', monitoringController.createMonitoringSuite);
router.get('/suites/:suite_id/monitoring-suites', monitoringController.getMonitoringSuites);
router.patch('/monitoring-suites/:ms_id', monitoringController.updateMonitoringSuite);
router.delete('/monitoring-suites/:ms_id', monitoringController.deleteMonitoringSuite);

module.exports = router;
