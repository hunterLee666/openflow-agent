import { getGlobalConfig } from '@utils/config'

export interface Theme {
  primary: string
  info: string

  secondary: string
  success: string
  error: string
  warning: string

  bashBorder: string
  openflow: string
  noting: string
  notingBorder: string
  permission: string
  autoAccept: string
  planMode: string
  inputBorder: string
  suggestion: string

  border: string
  secondaryBorder: string
  bgSurface: string
  bgSurfaceHighlight: string

  text: string
  textMuted: string
  textDim: string

  secondaryText: string

   diff: {
     added: string
     removed: string
     addedDimmed: string
     removedDimmed: string
   }
}

const lightTheme: Theme = {
  primary: '#8B5CF6',
  info: '#3B82F6',

  secondary: '#6B7280',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',

  bashBorder: '#F59E0B',
  openflow: '#8B5CF6',
  noting: '#374151',
  notingBorder: '#10B981',
  permission: '#8B5CF6',
  autoAccept: '#A855F7',
  planMode: '#06B6D4',
  inputBorder: '#8B5CF6',
  suggestion: '#6366F1',

  border: '#D1D5DB',
  secondaryBorder: '#E5E7EB',
  bgSurface: '#FFFFFF',
  bgSurfaceHighlight: '#F9FAFB',

  text: '#111827',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',

  secondaryText: '#6B7280',

  diff: {
    added: '#D1FAE5',
    removed: '#FEE2E2',
    addedDimmed: '#ECFDF5',
    removedDimmed: '#FEF2F2',
  },
}

const lightDaltonizedTheme: Theme = {
  primary: '#8B5CF6',
  info: '#3B82F6',

  secondary: '#6B7280',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',

  bashBorder: '#F59E0B',
  openflow: '#8B5CF6',
  noting: '#374151',
  notingBorder: '#10B981',
  permission: '#6366F1',
  autoAccept: '#A855F7',
  planMode: '#06B6D4',
  inputBorder: '#6366F1',
  suggestion: '#818CF8',

  border: '#D1D5DB',
  bgSurface: '#FFFFFF',
  bgSurfaceHighlight: '#F9FAFB',

  text: '#111827',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',

  secondaryText: '#6B7280',

  diff: {
    added: '#D1FAE5',
    removed: '#FEE2E2',
    addedDimmed: '#ECFDF5',
    removedDimmed: '#FEF2F2',
  },
}

const darkTheme: Theme = {
  primary: '#A78BFA',
  info: '#60A5FA',

  secondary: '#9CA3AF',
  success: '#34D399',
  error: '#F87171',
  warning: '#FBBF24',
  secondaryBorder: '#374151',

  bashBorder: '#FB923C',
  openflow: '#A78BFA',
  noting: '#1F2937',
  notingBorder: '#34D399',
  permission: '#A78BFA',
  autoAccept: '#C084FC',
  planMode: '#2DD4BF',
  inputBorder: '#818CF8',
  suggestion: '#A5B4FC',

  border: '#374151',
  bgSurface: '#0F172A',
  bgSurfaceHighlight: '#1E293B',

  text: '#F1F5F9',
  textMuted: '#94A3B8',
  textDim: '#64748B',

  secondaryText: '#94A3B8',

  diff: {
    added: '#064E3B',
    removed: '#7F1D1D',
    addedDimmed: '#065F46',
    removedDimmed: '#881337',
  },
}

const darkDaltonizedTheme: Theme = {
  primary: '#A78BFA',
  info: '#60A5FA',

  secondary: '#9CA3AF',
  success: '#34D399',
  error: '#F87171',
  warning: '#FBBF24',
  secondaryBorder: '#374151',

  bashBorder: '#FB923C',
  openflow: '#A78BFA',
  noting: '#1F2937',
  notingBorder: '#34D399',
  permission: '#818CF8',
  autoAccept: '#C084FC',
  planMode: '#2DD4BF',
  inputBorder: '#818CF8',
  suggestion: '#A5B4FC',

  border: '#374151',
  bgSurface: '#0F172A',
  bgSurfaceHighlight: '#1E293B',

  text: '#F1F5F9',
  textMuted: '#94A3B8',
  textDim: '#64748B',

  secondaryText: '#94A3B8',

  diff: {
    added: '#064E3B',
    removed: '#7F1D1D',
    addedDimmed: '#065F46',
    removedDimmed: '#881337',
  },
}

export type ThemeNames =
  | 'dark'
  | 'light'
  | 'light-daltonized'
  | 'dark-daltonized'

export function getTheme(overrideTheme?: ThemeNames): Theme {
  const config = getGlobalConfig()
  switch (overrideTheme ?? config.theme) {
    case 'light':
      return lightTheme
    case 'light-daltonized':
      return lightDaltonizedTheme
    case 'dark-daltonized':
      return darkDaltonizedTheme
    default:
      return darkTheme
  }
}
