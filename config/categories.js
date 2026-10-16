/**
 * config/categories.js
 * Canonical expense/income categories – SINGLE source of truth.
 * Backend (agent tool enum), frontend pills and manual form all derive from here.
 * New categories are free-text but require user confirmation first (agent rule).
 */

export const EXPENSE_CATEGORIES = [
  { name: 'أكل', emoji: '🍔' },
  { name: 'مواصلات', emoji: '🚗' },
  { name: 'فواتير', emoji: '📃' },
  { name: 'تسوق', emoji: '🛍️' },
  { name: 'صحة', emoji: '💊' },
  { name: 'تعليم', emoji: '📚' },
  { name: 'إيجار', emoji: '🏠' },
  { name: 'راتب', emoji: '💰' },
  { name: 'أخرى', emoji: '📦' },
];

export const CATEGORY_NAMES = EXPENSE_CATEGORIES.map((c) => c.name);

export default EXPENSE_CATEGORIES;
