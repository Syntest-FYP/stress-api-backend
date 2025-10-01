const express = require('express');
const router = express.Router();
const { verifyAuth } = require('../middleware/auth');
const ctrl = require('../controllers/environment.controller');

// All environment routes require auth
router.post('/', verifyAuth, ctrl.create);
router.get('/', verifyAuth, ctrl.listMine);
router.get('/:id', verifyAuth, ctrl.getOne);
router.put('/:id', verifyAuth, ctrl.updateOne);
router.delete('/:id', verifyAuth, ctrl.remove);
router.post('/:id/default', verifyAuth, ctrl.setDefault);
router.post('/:id/clone', verifyAuth, ctrl.clone);

module.exports = router;


