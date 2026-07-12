import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import { requireTreeRole } from '../middleware/authorizeTree.js';
import { isNonEmptyString } from '../utils/validation.js';
import {
  addComment,
  getComments,
  getCommentOwnerId,
  deleteComment,
  COMMENT_TARGET_TYPES,
} from '../models/commentModel.js';
import {
  toggleReaction,
  getReactions,
  getReactionSummary,
  REACTION_TARGET_TYPES,
} from '../models/reactionModel.js';

export const commentsRouter = express.Router({ mergeParams: true });

commentsRouter.use(requireAuth);
commentsRouter.use(requireTreeRole(['owner', 'editor', 'viewer']));

function parseTarget(query, validTypes) {
  const targetType = query.targetType;
  const targetId = Number(query.targetId);
  if (!validTypes.includes(targetType) || !Number.isInteger(targetId) || targetId <= 0) {
    return null;
  }
  return { targetType, targetId };
}

// GET /api/trees/:treeId/comments?targetType=media&targetId=123
commentsRouter.get('/', async (req, res, next) => {
  try {
    const target = parseTarget(req.query, COMMENT_TARGET_TYPES);
    if (!target) {
      return res.status(400).json({ error: 'A valid targetType and targetId are required' });
    }
    const comments = await getComments(target.targetType, target.targetId);
    return res.json({ comments });
  } catch (error) {
    return next(error);
  }
});

commentsRouter.post('/', async (req, res, next) => {
  try {
    const { targetType, targetId, body } = req.body || {};
    const target = parseTarget({ targetType, targetId }, COMMENT_TARGET_TYPES);
    if (!target) {
      return res.status(400).json({ error: 'A valid targetType and targetId are required' });
    }
    if (!isNonEmptyString(body, 2000)) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const comment = await addComment({
      userId: req.user.id,
      targetType: target.targetType,
      targetId: target.targetId,
      body: body.trim(),
    });
    return res.status(201).json({ comment });
  } catch (error) {
    return next(error);
  }
});

commentsRouter.delete('/:commentId', async (req, res, next) => {
  try {
    const commentId = Number(req.params.commentId);
    const ownerId = await getCommentOwnerId(commentId);
    if (!ownerId) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    // Author or a tree owner/editor may remove a comment; anyone else is denied.
    const isAuthor = ownerId === req.user.id;
    const canModerate = ['owner', 'editor'].includes(req.treePermission.role);
    if (!isAuthor && !canModerate) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await deleteComment(commentId);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

export const reactionsRouter = express.Router({ mergeParams: true });

reactionsRouter.use(requireAuth);
reactionsRouter.use(requireTreeRole(['owner', 'editor', 'viewer']));

reactionsRouter.get('/', async (req, res, next) => {
  try {
    const target = parseTarget(req.query, REACTION_TARGET_TYPES);
    if (!target) {
      return res.status(400).json({ error: 'A valid targetType and targetId are required' });
    }
    const [reactions, summary] = await Promise.all([
      getReactions(target.targetType, target.targetId),
      getReactionSummary(target.targetType, target.targetId),
    ]);
    return res.json({ reactions, summary });
  } catch (error) {
    return next(error);
  }
});

reactionsRouter.post('/toggle', async (req, res, next) => {
  try {
    const { targetType, targetId, emoji } = req.body || {};
    const target = parseTarget({ targetType, targetId }, REACTION_TARGET_TYPES);
    if (!target) {
      return res.status(400).json({ error: 'A valid targetType and targetId are required' });
    }
    if (!isNonEmptyString(emoji, 8)) {
      return res.status(400).json({ error: 'emoji is required' });
    }

    const result = await toggleReaction({
      userId: req.user.id,
      targetType: target.targetType,
      targetId: target.targetId,
      emoji,
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});
