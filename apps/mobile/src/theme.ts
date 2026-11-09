// Native equivalents of Rentral's semantic tokens in app/globals.css.
export const colors = {
  background: 'rgb(10, 10, 10)', surface: 'rgb(23, 23, 23)', border: 'rgb(38, 38, 38)',
  text: 'rgb(255, 255, 255)', secondary: 'rgb(212, 212, 216)', muted: 'rgb(161, 161, 170)',
  inverse: 'rgb(10, 10, 10)', accent: 'rgb(5, 150, 105)', accentBright: 'rgb(16, 185, 129)',
  accentMuted: 'rgba(5, 150, 105, 0.2)', glass: 'rgba(255, 255, 255, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.65)', warning: 'rgb(229, 155, 89)',
} as const
export const fonts = { regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold' } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, card: 32, pill: 9999 } as const
