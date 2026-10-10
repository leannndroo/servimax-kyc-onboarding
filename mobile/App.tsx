import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Alert, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DocumentCaptureScreen } from './src/screens/DocumentCaptureScreen';
import { MetricsScreen } from './src/screens/MetricsScreen';
import { OcrReviewScreen } from './src/screens/OcrReviewScreen';
import { RegistrationScreen } from './src/screens/RegistrationScreen';
import { ResultScreen } from './src/screens/ResultScreen';
import { VerificationScreen } from './src/screens/VerificationScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { OnboardingProvider, PREVIOUS_STEP, useOnboarding } from './src/state/OnboardingContext';

/**
 * Navegación tipo "asistente": el paso actual vive en el estado global.
 * Elegimos esto en lugar de una librería de navegación porque el flujo es
 * lineal y así el estado del recorrido y la pantalla nunca se desincronizan.
 */
function StepRouter() {
  const { state, dispatch } = useOnboarding();

  // Botón "atrás" de Android: retrocede un paso en vez de cerrar la app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const previous = PREVIOUS_STEP[state.step];
      if (previous) {
        dispatch({ type: 'GO', step: previous });
        return true;
      }
      if (state.step === 'verify') return true; // no interrumpir las consultas
      if (state.step === 'result') {
        Alert.alert('¿Terminar?', 'Volverás al inicio. Descarga el informe antes si lo necesitas.', [
          { text: 'Quedarme', style: 'cancel' },
          { text: 'Ir al inicio', onPress: () => dispatch({ type: 'RESET' }) },
        ]);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [state.step, dispatch]);

  switch (state.step) {
    case 'register':
      return <RegistrationScreen />;
    case 'capture':
      return <DocumentCaptureScreen />;
    case 'ocr':
      return <OcrReviewScreen />;
    case 'verify':
      return <VerificationScreen />;
    case 'result':
      return state.session?.result ? <ResultScreen /> : <VerificationScreen />;
    case 'metrics':
      return <MetricsScreen />;
    default:
      return <WelcomeScreen />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <OnboardingProvider>
        <ErrorBoundary>
          <StatusBar style="dark" />
          <StepRouter />
        </ErrorBoundary>
      </OnboardingProvider>
    </SafeAreaProvider>
  );
}
