export interface TourStep {
  id: string;
  title: string;
  body: string;
  anchorSelector: string | (() => HTMLElement | null);
  placement?: 'top' | 'bottom' | 'left' | 'right';
  route?: string; // Optional: route where this step should be shown
  conditional?: () => boolean; // Optional: only show if condition returns true
  order: number; // Order in which steps appear
  optional?: boolean; // Optional: can be skipped
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'find-connections',
    title: 'Find Your Connections',
    body: 'Use these filters to search for specific people. You can filter by organizations, roles, locations, and more to find exactly who you\'re looking for.',
    anchorSelector: '[data-tour-anchor="filters"]',
    placement: 'bottom',
    route: '/home',
    order: 1
  },
  {
    id: 'search-results',
    title: 'Search Results',
    body: 'When you run a search, contacts are automatically saved to your Contact Library. You can view them anytime from the sidebar or Contact Directory.',
    anchorSelector: '[data-tour-anchor="results"]',
    placement: 'bottom',
    route: '/home',
    order: 2,
    conditional: () => {
      // Only show if user has contacts or has run a search
      // This will be checked dynamically in the component
      return true;
    }
  },
  {
    id: 'manage-contacts',
    title: 'Manage Your Contacts',
    body: 'Your selected contacts appear here. You can select contacts and assign templates to them.',
    anchorSelector: '[data-tour-anchor="contacts-list"]',
    placement: 'right',
    route: '/contact-directory',
    order: 3
  },
  {
    id: 'apply-templates',
    title: 'Apply Templates',
    body: 'After selecting templates, click "Apply Template" to assign them. Then use "Personalize All" to let our AI customize each email.',
    anchorSelector: '[data-tour-anchor="templates"]',
    placement: 'bottom',
    route: '/contact-directory', // TBD: Update when template page is located
    order: 4,
    conditional: () => {
      // Only show if templates section exists
      return true;
    }
  },
  {
    id: 'personalize-all',
    title: 'Personalize Your Emails',
    body: 'Click "Personalize All" to let our AI customize each email based on your resume, the contact\'s background, and commonalities. This makes your outreach much more personal and effective.',
    anchorSelector: '[data-tour-anchor="personalize-button"]',
    placement: 'top',
    route: '/contact-directory', // TBD: Update when template page is located
    order: 5,
    conditional: () => {
      // Only show if templates have been assigned
      return true;
    }
  },
  {
    id: 'follow-up-emails',
    title: 'Follow-up Emails',
    body: 'Switch to the Follow-up Email tab to choose a follow-up template. Follow-ups are optional but can improve response rates.',
    anchorSelector: '[data-tour-anchor="follow-up-tab"]',
    placement: 'bottom',
    route: '/contact-directory', // TBD: Update when template page is located
    order: 6,
    conditional: () => {
      // Only show if follow-up tab exists
      return true;
    }
  },
  {
    id: 'credits-upgrade',
    title: 'Credits & Upgrades',
    body: 'You earn credits with each search. Free tier includes 150 credits (10 searches). Upgrade to Pro for 1800 credits and advanced features like resume matching.',
    anchorSelector: '[data-tour-anchor="credits"]',
    placement: 'bottom',
    route: '/home',
    order: 7,
    optional: true // Can be skipped
  }
];

