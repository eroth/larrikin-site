// Everything on the site you're likely to edit lives here.
export const site = {
  name: 'Larrikin Coffee Collective',
  // Contact buttons and mailto links only appear once this is set.
  contactEmail: 'info@larrikincoffeecollective.com.au',
  // "Member login" link in the header only appears once this is set.
  appUrl: '',
  legalUpdated: '12 October 2026',
};

// Map centres are approximate (suburb centres), not pickup addresses. Move them with each
// hub organiser's agreement; the circle only ever shows a general area.
export const hubs = [
  { name: 'Thornbury', lat: -37.757326, lng: 145.010195, radiusKm: 1 },
  { name: 'Northcote', lat: -37.767999, lng: 144.988416, radiusKm: 1 },
];

export const hubNames = hubs.map((h) => h.name);

// Roasters shown under "Community". Put each logo in public/roasters/ and list it here;
// the logos only appear once this has entries. `href` is optional.
export const roasters: { name: string; logo: string; href?: string }[] = [];

// Shown in the footer of every page. Not yet reviewed by the Wurundjeri Woi-wurrung Cultural Heritage Aboriginal Corporation.
export const acknowledgement =
  `${site.name} acknowledges the Wurundjeri Woi-wurrung people of the Kulin Nation as the Traditional Owners of the lands on which our hubs in ${hubNames.join(' and ')} sit. ` +
  'We pay our respects to Elders past and present.';
