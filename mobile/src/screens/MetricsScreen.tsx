import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { errorMessage } from '../api/client';
import { getMetrics } from '../api/onboarding';
import { Banner, Button, Card, Screen } from '../components/ui';
import { useOnboarding } from '../state/OnboardingContext';
import { colors, radius, space } from '../theme';
import type { Metrics } from '../types';

const TILES: [string, string][] = [
  ['registrations', 'Registros'], ['completed', 'Validaciones'], ['validated', 'Validados'],
  ['requiresReview', 'En revisión'], ['notValidated', 'No validados'], ['manualReviews', 'Revisión manual'],
  ['queries', 'Consultas'], ['queryErrors', 'Errores de consulta'], ['ocrFailures', 'Fallos OCR'],
  ['averageScore', 'Score promedio'], ['averageDurationSeconds', 'Duración prom. (s)'], ['ocrAttempts', 'Intentos OCR'],
];

/** Tablero sencillo con las métricas agregadas del backend. */
export function MetricsScreen() {
  const { state, dispatch } = useOnboarding();
  const [metrics, setMetrics] = useState<Metrics>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setMetrics(await getMetrics());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen
      title="Métricas"
      subtitle="Resumen de todos los registros procesados por el servidor."
      footer={
        <>
          <Button label="Actualizar" variant="secondary" onPress={load} />
          <Button label="Volver" variant="ghost" onPress={() => dispatch({ type: 'GO', step: state.session?.result ? 'result' : 'welcome' })} />
        </>
      }
    >
      {error ? <Banner tone="danger" message={error} actions={[{ label: 'Reintentar', onPress: load }]} /> : null}
      {!metrics && !error ? <ActivityIndicator color={colors.navy} /> : null}
      {metrics ? (
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {TILES.map(([key, label]) => (
              <View key={key} style={{ width: '48%', backgroundColor: colors.sand, borderRadius: radius.md, padding: space.md }}>
                <Text style={{ fontSize: 26, fontWeight: '900', color: colors.navy }}>{String(metrics[key] ?? 0)}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}
