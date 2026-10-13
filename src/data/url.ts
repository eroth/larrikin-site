// Prefix a site-relative path with Astro's base, so links work whether the site is
// served from a custom domain (base "/") or a GitHub Pages project path.
export const url = (path: string) => import.meta.env.BASE_URL.replace(/\/$/, '') + path;
