import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { errorMessage } from '../api/client';
import { verify } from '../api/onboarding';
import { Banner, Button, Card, Screen } from '../components/ui';
import { useOnboarding } from '../state/OnboardingContext';
import { colors } from '../theme';

const CHECKS = ['Registro de identidad', 'Listas restrictivas', 'Datos de contacto', 'Cálculo del score'];

/**
 * Ejecuta las consultas externas. El backend ya convierte las caídas de los
 * proveedores en resultados "Requiere revisión"; aquí solo manejamos que
 * NUESTRO servidor no responda (red, timeout), con opción de reintentar.
 */
export function VerificationScreen() {
  const { state, dispatch } = useOnboarding();
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string>();

  const run = useCallback(async () => {
    setRunning(true);
    setError(undefined);
    try {
      const session = await verify(state.sessionId!);
      dispatch({ type: 'SESSION', session });
    } catch (err) {
      setError(errorMessage(err));
      setRunning(false);
    }
  }, [state.sessionId, dispatch]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <Screen
      step={3}
      title="Validando tu identidad"
      subtitle="Consultamos fuentes externas. Puede tardar unos segundos."
      footer={
        error ? (
          <>
            <Button label="Reintentar consultas" onPress={run} />
            <Button label="Revisar mis datos" variant="ghost" onPress={() => dispatch({ type: 'GO', step: 'ocr' })} />
          </>
        ) : undefined
      }
    >
      {error ? (
        <Banner tone="danger" title="No pudimos completar las consultas" message={`${error} Tus datos confirmados están guardados.`} />
      ) : null}
      <Card>
        {CHECKS.map((label) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
            {running ? <ActivityIndicator color={colors.navy} /> : <Text style={{ color: colors.danger, fontWeight: '800' }}>!</Text>}
            <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
