/** Paleta tomada de la identidad visual del documento de Servimax. */
export const colors = {
  navy: '#0f2a44',
  navySoft: '#2b4a66',
  gold: '#d4a052',
  sand: '#f1edeb',
  bg: '#faf8f7',
  card: '#ffffff',
  text: '#1d2733',
  muted: '#5f6b78',
  border: '#ddd6d2',
  success: '#1b7f3b',
  successBg: '#e5f4ea',
  warning: '#9a5b00',
  warningBg: '#fbf0d9',
  danger: '#b3261e',
  dangerBg: '#fbe4e2',
  infoBg: '#e8eef5',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 6, md: 10, lg: 16 };

export const decisionStyle = {
  VALIDATED: { label: 'Validado', color: colors.success, bg: colors.successBg },
  REQUIRES_REVIEW: { label: 'Requiere revisión', color: colors.warning, bg: colors.warningBg },
  NOT_VALIDATED: { label: 'No validado', color: colors.danger, bg: colors.dangerBg },
} as const;
