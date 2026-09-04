import db from '../db/schema.js';

/**
 * What each tier is allowed to do.
 *
 * These limits are derived from the marketing copy in public/js/pricing.js.
 * The free-tier caps (dishes, places) are NOT stated anywhere in that copy —
 * they are a starting point and should be confirmed before launch.
 */
export const ENTITLEMENTS = {
  free: {
    maxBooks: 1,
    maxMembersPerBook: 2,
    maxDishesPerBook: 25, // assumption — confirm
    maxPlacesPerBook: 15, // assumption — confirm
    modes: ['couple'],
  },
  pair: {
    maxBooks: 1,
    maxMembersPerBook: 2,
    maxDishesPerBook: Infinity,
    maxPlacesPerBook: Infinity,
    modes: ['couple'],
  },
  table: {
    maxBooks: Infinity,
    maxMembersPerBook: 12,
    maxDishesPerBook: Infinity,
    maxPlacesPerBook: Infinity,
    modes: ['couple', 'family', 'crew'],
  },
};

/** Statuses that still grant paid access; anything else falls back to free. */
const PAYING_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function entitlementsFor(user) {
  const tier = user?.subscription_tier || 'free';
  const paying =
    user?.is_lifetime || PAYING_STATUSES.has(user?.subscription_status);
  return ENTITLEMENTS[paying ? tier : 'free'] || ENTITLEMENTS.free;
}

/** 402 tells the client to route the user to the upgrade screen. */
function upgradeRequired(res, message, requiredTier) {
  return res.status(402).json({ error: message, upgrade: true, requiredTier });
}

const VALID_MODES = ['couple', 'family', 'crew'];

/**
 * Reject a book mode the user's tier doesn't include.
 * Unrecognised values fall through — the route normalises those to 'couple'.
 */
export function requireMode(req, res, next) {
  const mode = req.body?.mode;
  if (!mode || !VALID_MODES.includes(mode)) return next();

  const limits = entitlementsFor(req.user);
  if (!limits.modes.includes(mode)) {
    return upgradeRequired(res, `${mode} books need the Table plan`, 'table');
  }
  next();
}

/** Reject a new book once the tier's book allowance is used up. */
export async function enforceBookLimit(req, res, next) {
  const limits = entitlementsFor(req.user);
  if (limits.maxBooks === Infinity) return next();

  try {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS count FROM members WHERE user_id = $1 AND role = $2',
      [req.user.id, 'owner']
    );
    if (rows[0].count >= limits.maxBooks) {
      return upgradeRequired(
        res,
        `Your plan includes ${limits.maxBooks} book. Upgrade to Table for more.`,
        'table'
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Reject a join that would push a book past its owner's member cap.
 * The cap follows the book OWNER's plan, not the joiner's — the owner is who paid.
 */
export async function enforceMemberLimit(req, res, next) {
  const { invite_code } = req.body;
  if (!invite_code) return next();

  try {
    const { rows } = await db.query(
      `SELECT b.id,
              owner.subscription_tier,
              owner.subscription_status,
              owner.is_lifetime,
              (SELECT COUNT(*)::int FROM members WHERE book_id = b.id) AS member_count
       FROM books b
       JOIN users owner ON owner.id = b.created_by
       WHERE b.invite_code = $1`,
      [invite_code]
    );
    const book = rows[0];
    if (!book) return next(); // the route itself returns the 404

    const limits = entitlementsFor(book);
    if (book.member_count >= limits.maxMembersPerBook) {
      return upgradeRequired(
        res,
        `This book is full (${limits.maxMembersPerBook} people). The owner can upgrade to Table for up to 12.`,
        'table'
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Reject a new dish or restaurant once the book hits its cap.
 * `resolveBookId` differs per resource: restaurants carry book_id directly,
 * dishes only carry restaurant_id.
 */
export function enforceContentLimit(table, limitKey, label, resolveBookId) {
  return async (req, res, next) => {
    const limits = entitlementsFor(req.user);
    if (limits[limitKey] === Infinity) return next();

    try {
      const bookId = await resolveBookId(req);
      if (!bookId) return next(); // the route validates this and 400s/404s

      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS count FROM ${table} WHERE book_id = $1`,
        [bookId]
      );
      if (rows[0].count >= limits[limitKey]) {
        return upgradeRequired(
          res,
          `Free books hold ${limits[limitKey]} ${label}. Upgrade to Pair for unlimited.`,
          'pair'
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const enforcePlaceLimit = enforceContentLimit(
  'restaurants',
  'maxPlacesPerBook',
  'places',
  (req) => req.body?.book_id
);

export const enforceDishLimit = enforceContentLimit(
  'dishes',
  'maxDishesPerBook',
  'dishes',
  async (req) => {
    if (!req.body?.restaurant_id) return null;
    const { rows } = await db.query(
      'SELECT book_id FROM restaurants WHERE id = $1',
      [req.body.restaurant_id]
    );
    return rows[0]?.book_id ?? null;
  }
);
