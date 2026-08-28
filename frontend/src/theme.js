/**
 * Single source of truth for the SautiLedger palette.
 *
 * Roles:
 * - paper / card / line / ink / dust: Neutral canvas, surfaces, borders, and typography
 * - grove: Money in & primary actions (cash sales, repayments, collected, profit, buttons, send)
 * - warn: Money owed & stock alerts (credit sales, customer balances, outstanding total, low stock)
 * - danger: Failures & destructive actions only (errors, out of stock at zero, remove item, negative profit)
 * - clay: Voice active state only (listening mic, active mic pill, active voice tab)
 */
export const colors = {
  paper: '#F4EFE4',
  card: '#FFFDF8',
  ink: '#1C1915',
  grove: {
    DEFAULT: '#1F6B45',
    dark: '#175134',
    light: '#E7F1EB',
  },
  clay: {
    DEFAULT: '#C45C26',
    light: '#FBEDE4',
  },
  dust: '#8A7A64',
  line: '#E6DCC9',
  danger: {
    DEFAULT: '#B3261E',
    light: '#FBE9E7',
  },
  warn: {
    DEFAULT: '#B26B00',
    light: '#FDF1DC',
  },
};

export const themeColor = colors.grove.DEFAULT;
export const backgroundColor = colors.paper;
