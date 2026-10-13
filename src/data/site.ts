// Everything on the site you're likely to edit lives here.
export const site = {
  name: 'Larrikin Coffee Collective',
  // Contact buttons and mailto links only appear once this is set.
  contactEmail: '',
  // "Member login" link in the header only appears once this is set.
  appUrl: '',
  legalUpdated: '12 October 2026',
};

export const hubNames = ['Thornbury', 'Northcote'];

// Shown in the footer of every page. Not yet reviewed by the Wurundjeri Woi-wurrung Cultural Heritage Aboriginal Corporation.
export const acknowledgement =
  `${site.name} acknowledges the Wurundjeri Woi-wurrung people of the Kulin Nation as the Traditional Owners of the lands on which our hubs in ${hubNames.join(' and ')} sit. ` +
  'We pay our respects to Elders past and present.';
