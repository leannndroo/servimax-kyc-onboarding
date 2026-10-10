import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { API_URL, request } from '../api/client';
import { Banner, Button, Card, Gap, Screen } from '../components/ui';
import { useOnboarding } from '../state/OnboardingContext';
import { colors } from '../theme';

const STEPS = [
  ['1', 'Tus datos', 'Nombre, documento y contacto.'],
  ['2', 'Tu cédula', 'Foto del frente y del reverso.'],
  ['3', 'Revisión', 'Confirmas lo que leímos.'],
  ['4', 'Resultado', 'Validamos y te mostramos por qué.'],
];

export function WelcomeScreen() {
  const { dispatch } = useOnboarding();
  const [server, setServer] = useState<{ ok: boolean; ocr?: string } | null>(null);

  const check = useCallback(async () => {
    setServer(null);
    try {
      const h = await request<{ ocrProvider: string; ocrEnabled: boolean }>('/health', { timeoutMs: 6000 });
      setServer({ ok: true, ocr: h.ocrEnabled ? h.ocrProvider : 'desactivado' });
    } catch {
      setServer({ ok: false });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return (
    <Screen
      title="Registra tu tienda en 4 pasos"
      subtitle="Validamos tu identidad para proteger tu cuenta. Toma unos 3 minutos."
      footer={
        <>
          <Button label="Empezar registro" onPress={() => dispatch({ type: 'GO', step: 'register' })} />
          <Button label="Ver métricas" variant="ghost" onPress={() => dispatch({ type: 'GO', step: 'metrics' })} />
        </>
      }
    >
      <Card>
        {STEPS.map(([n, title, text]) => (
          <View key={n} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
            <Text style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.navy, color: '#fff', textAlign: 'center', lineHeight: 28, fontWeight: '800' }}>{n}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>{title}</Text>
              <Text style={{ color: colors.muted }}>{text}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
        Tus fotos se usan solo para leer el documento y se eliminan al confirmar tus datos. No guardamos nada en este teléfono.
      </Text>
      <Gap />
      {server === null ? null : server.ok ? (
        <Banner tone="success" message={`Conectado al servidor · OCR: ${server.ocr}`} />
      ) : (
        <Banner
          tone="danger"
          title="Sin conexión con el servidor"
          message={`No pudimos contactar ${API_URL}. Verifica que el backend esté encendido y que el celular esté en la misma red Wi-Fi.`}
          actions={[{ label: 'Reintentar', onPress: check }]}
        />
      )}
    </Screen>
  );
}
