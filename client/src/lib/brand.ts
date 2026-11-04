export interface Brand {
  name: string;
  logoLight: string;
  logoDark: string;
}

export const DEFAULT_BRAND: Brand = {
  name: 'EMT Service',
  logoLight: '/emt-logo-light-theme.png',
  logoDark: '/emt-logo-dark-theme.png',
};
