const { Router } = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const { authenticate, requireBoardAccess } = require('../middleware/auth');
const {
  createCard,
  getCard,
  updateCard,
  deleteCard,
  moveCard,
  reorderCards,
  addAssignee,
  removeAssignee,
  addLabel,
  removeLabel,
  getCardActivity,
} = require('../controllers/cardController');
const { getComments, addComment, deleteComment } = require('../controllers/commentController');
const { getAttachments, addAttachment, deleteAttachment } = require('../controllers/attachmentController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post(
  '/',
  requireBoardAccess('editor'),
  [body('name').trim().notEmpty().isLength({ max: 500 }), body('listId').notEmpty()],
  createCard
);

router.get('/:cardId', requireBoardAccess('viewer'), getCard);

router.patch(
  '/:cardId',
  requireBoardAccess('editor'),
  [body('name').optional().trim().notEmpty().isLength({ max: 500 })],
  updateCard
);

router.delete('/:cardId', requireBoardAccess('editor'), deleteCard);

router.patch('/:cardId/move', requireBoardAccess('editor'), moveCard);

router.post('/reorder', requireBoardAccess('editor'), reorderCards);

router.post('/:cardId/assignees', requireBoardAccess('editor'), addAssignee);
router.delete('/:cardId/assignees/:userId', requireBoardAccess('editor'), removeAssignee);

router.post('/:cardId/labels', requireBoardAccess('editor'), [body('color').notEmpty()], addLabel);
router.delete('/:cardId/labels/:labelId', requireBoardAccess('editor'), removeLabel);

// Comments
router.get('/:cardId/comments', requireBoardAccess('viewer'), getComments);
router.post('/:cardId/comments', requireBoardAccess('editor'), [body('text').trim().notEmpty()], addComment);
router.delete('/:cardId/comments/:commentId', requireBoardAccess('editor'), deleteComment);

// Attachments
router.get('/:cardId/attachments', requireBoardAccess('viewer'), getAttachments);
router.post('/:cardId/attachments', requireBoardAccess('editor'), upload.single('file'), addAttachment);
router.delete('/:cardId/attachments/:attachmentId', requireBoardAccess('editor'), deleteAttachment);

// Card-level activity
router.get('/:cardId/activity', requireBoardAccess('viewer'), getCardActivity);

module.exports = router;
