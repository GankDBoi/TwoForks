/* Single source of truth for pricing. Used by the checkout route and the UI. */
export const PRICING = {
  pair: {
    label: 'Pair',
    blurb: 'Unlimited dishes and places for the two of you.',
    perks: [
      'Unlimited dishes and places',
      'Both of you, one payment',
      'Export the whole book',
      'Everything stays if you stop paying',
    ],
    monthly: 399,
    yearly: 2900,
    lifetime: 5900,
  },
  table: {
    label: 'Table',
    blurb: 'Family and Crew modes, up to 12 people, more than one book.',
    perks: [
      'Everything in Pair',
      'Family and Crew modes',
      'Up to 12 people in a book',
      'As many books as you like',
    ],
    monthly: 699,
    yearly: 5900,
    lifetime: 9900,
  },
}

export const money = (cents) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
