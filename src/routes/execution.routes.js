const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/execution.controller');
const { verifyAuth } = require('../middleware/auth');

router.post('/', verifyAuth, ctrl.create);
router.get('/test/:test_id', verifyAuth, ctrl.getByTest);
router.get('/:id', verifyAuth, ctrl.getById);
router.put('/:id', verifyAuth, ctrl.update);
router.delete('/:id', verifyAuth, ctrl.delete);

module.exports = router;



