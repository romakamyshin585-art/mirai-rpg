/**
 * Font loading for Nunito (local, pre-splash-hide)
 */

import { useFonts } from 'expo-font';
import { Nunito_200ExtraLight, Nunito_300Light, Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';

export function useNunitoFonts() {
  return useFonts({
    'Nunito-ExtraLight': Nunito_200ExtraLight,
    'Nunito-Light': Nunito_300Light,
    'Nunito-Regular': Nunito_400Regular,
    'Nunito-Medium': Nunito_500Medium,
    'Nunito-SemiBold': Nunito_600SemiBold,
    'Nunito-Bold': Nunito_700Bold,
    'Nunito-ExtraBold': Nunito_800ExtraBold,
    // Aliases for weight strings
    Nunito: Nunito_400Regular,
  });
}