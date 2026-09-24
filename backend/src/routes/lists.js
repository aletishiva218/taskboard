const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate, requireBoardAccess } = require('../middleware/auth');
const {
  getLists,
  createList,
  updateList,
  deleteList,
  reorderLists,
} = require('../controllers/listController');

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', requireBoardAccess('viewer'), getLists);

router.post(
  '/',
  requireBoardAccess('editor'),
  [body('name').trim().notEmpty().isLength({ max: 255 })],
  createList
);

router.patch(
  '/:listId',
  requireBoardAccess('editor'),
  [body('name').trim().notEmpty().isLength({ max: 255 })],
  updateList
);

router.delete('/:listId', requireBoardAccess('editor'), deleteList);

router.post('/reorder', requireBoardAccess('editor'), reorderLists);

module.exports = router;
