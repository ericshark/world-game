import type { RouteRules } from '../../geo/graph'

export interface Expedition {
  id: string
  title: string
  blurb: string
  from: string
  to: string
  rules: RouteRules
  /** Shown during play, e.g. "Avoid Russia and China". */
  ruleText?: string
}

/** Curated journeys with a twist. Tests check every one can be completed. */
export const EXPEDITIONS: Expedition[] = [
  {
    id: 'cape-to-cairo',
    title: 'Cape to Cairo',
    blurb: 'The length of Africa, from the Cape of Good Hope to the Nile delta.',
    from: 'ZAF',
    to: 'EGY',
    rules: {},
  },
  {
    id: 'pan-american',
    title: 'Pan-American',
    blurb: 'From the Arctic north of Canada to the tip of South America.',
    from: 'CAN',
    to: 'ARG',
    rules: {},
  },
  {
    id: 'silk-road',
    title: 'The Silk Road',
    blurb: 'Istanbul to China, trading through Central Asia.',
    from: 'TUR',
    to: 'CHN',
    rules: { visit: { ids: ['KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'], count: 2 } },
    ruleText: 'Pass through at least 2 of the five “-stans”',
  },
  {
    id: 'coastal-route',
    title: 'Coastal Route',
    blurb: 'Portugal to Georgia without ever losing sight of the sea.',
    from: 'PRT',
    to: 'GEO',
    rules: { coastalOnly: true },
    ruleText: 'No landlocked countries',
  },
  {
    id: 'spice-route',
    title: 'Spice Route',
    blurb: 'Lisbon to Singapore the long way: the old powers are closed to you.',
    from: 'PRT',
    to: 'SGP',
    rules: { avoid: ['RUS', 'CHN'] },
    ruleText: 'Avoid Russia and China',
  },
  {
    id: 'balkan-bridge',
    title: 'Balkan Bridge',
    blurb: 'Vienna to Athens through the heart of the Balkans.',
    from: 'AUT',
    to: 'GRC',
    rules: {
      visit: { ids: ['SVN', 'HRV', 'BIH', 'SRB', 'MNE', 'MKD', 'ALB', 'KOS', 'BGR'], count: 4 },
    },
    ruleText: 'Pass through at least 4 Balkan countries',
  },
  {
    id: 'west-to-east-africa',
    title: 'Atlantic to Indian Ocean',
    blurb: 'Dakar to Mogadishu, straight across the continent.',
    from: 'SEN',
    to: 'SOM',
    rules: {},
  },
  {
    id: 'roof-of-the-world',
    title: 'Roof of the World',
    blurb: 'Pakistan to Myanmar along the Himalaya.',
    from: 'PAK',
    to: 'MMR',
    rules: { visit: { ids: ['NPL', 'BTN'], count: 1 } },
    ruleText: 'Pass through Nepal or Bhutan',
  },
  {
    id: 'andes',
    title: 'Spine of the Andes',
    blurb: 'Caracas to the far south of Chile, following the mountains.',
    from: 'VEN',
    to: 'CHL',
    rules: { visit: { ids: ['ECU', 'BOL'], count: 2 } },
    ruleText: 'Pass through Ecuador and Bolivia',
  },
  {
    id: 'danube',
    title: 'Down the Danube',
    blurb: 'From the Black Forest to the Black Sea, along Europe’s great river.',
    from: 'DEU',
    to: 'ROU',
    rules: { visit: { ids: ['AUT', 'SVK', 'HUN', 'HRV', 'SRB', 'BGR'], count: 4 } },
    ruleText: 'Pass through at least 4 Danube countries',
  },
  {
    id: 'island-hopper',
    title: 'Island Hopper',
    blurb: 'Bangkok to Australia across the islands of Southeast Asia.',
    from: 'THA',
    to: 'AUS',
    rules: {},
    ruleText: 'Most of the way is by sea (2 steps a crossing)',
  },
]
