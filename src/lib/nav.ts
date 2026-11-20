// The site navigation, the same on every page: the top bar and the footer.
export interface NavItem {
  id: 'find' | 'events' | 'opportunities' | 'new' | 'about';
  label: string;
  href: string;
}
export type NavId = NavItem['id'];

export const NAV: readonly NavItem[] = [
  { id: 'find', label: 'Find', href: '/' },
  { id: 'events', label: 'Clusters and events', href: '/events' },
  { id: 'opportunities', label: 'Funding', href: '/opportunities' },
  { id: 'new', label: 'New companies', href: '/new' },
  { id: 'about', label: 'About', href: '/about' },
];

/** The navigation item a path belongs to, or null (company pages, 404). */
export function currentNav(pathname: string): NavId | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  return NAV.find((item) => item.href === path)?.id ?? null;
}
