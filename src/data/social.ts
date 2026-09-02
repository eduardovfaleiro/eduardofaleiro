export type SocialLink = {
  name: string;
  url: string;
};

// TODO(eduardo): substituir pelos perfis reais antes de apontar o domínio.
// A terceira entrada é um provisório — trocar por YouTube ou mailto: se preferir.
export const social: SocialLink[] = [
  { name: 'GitHub', url: 'https://github.com/CHANGE-ME' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/CHANGE-ME' },
  { name: 'Instagram', url: 'https://www.instagram.com/CHANGE-ME' },
];
