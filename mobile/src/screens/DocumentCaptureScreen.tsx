import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { ApiError, errorMessage } from '../api/client';
import { uploadDocuments } from '../api/onboarding';
import { Banner, Button, Card, type Tone, Screen } from '../components/ui';
import { useOnboarding } from '../state/OnboardingContext';
import { colors, radius, space } from '../theme';
import { acquireDocumentImage } from '../utils/image';

type Side = 'front' | 'back';
const SIDE_LABEL: Record<Side, string> = { front: 'Frente', back: 'Reverso' };

export function DocumentCaptureScreen() {
  const { state, dispatch } = useOnboarding();
  const [busy, setBusy] = useState<Side | 'upload' | null>(null);
  const [notes, setNotes] = useState<Partial<Record<Side, { tone: Tone; message: string }>>>({});
  const [error, setError] = useState<string>();

  async function capture(side: Side, source: 'camera' | 'library') {
    setBusy(side);
    setError(undefined);
    const r = await acquireDocumentImage(source);
    setBusy(null);
    if (r.status === 'ok') {
      dispatch({ type: 'SET_IMAGE', side, image: r.image });
      setNotes((n) => ({ ...n, [side]: undefined }));
    } else if (r.status === 'cancelled') {
      setNotes((n) => ({ ...n, [side]: { tone: 'info', message: 'Cancelaste la captura. Inténtalo cuando estés listo.' } }));
    } else {
      setNotes((n) => ({ ...n, [side]: { tone: r.status === 'error' ? 'danger' : 'warning', message: r.message } }));
    }
  }

  async function next() {
    const missing = (['front', 'back'] as Side[]).filter((s) => !state.images[s]);
    if (missing.length) {
      setError(`Falta la foto del ${missing.map((m) => SIDE_LABEL[m].toLowerCase()).join(' y del ')} de la cédula.`);
      return;
    }
    if (state.documentsUploaded) {
      dispatch({ type: 'GO', step: 'ocr' });
      return;
    }
    setBusy('upload');
    setError(undefined);
    try {
      await uploadDocuments(state.sessionId!, state.images.front!, state.images.back!);
      dispatch({ type: 'DOCUMENTS_UPLOADED' });
    } catch (err) {
      // El servidor indica qué cara tiene problema (ilegible, baja calidad...).
      const side = err instanceof ApiError ? (err.details?.side as Side | undefined) : undefined;
      if (side) {
        dispatch({ type: 'SET_IMAGE', side, image: undefined });
        setNotes((n) => ({ ...n, [side]: { tone: 'warning', message: errorMessage(err) } }));
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      step={1}
      title="Foto de tu cédula"
      subtitle="Necesitamos el frente y el reverso."
      footer={
        <>
          <Button label="Continuar" onPress={next} loading={busy === 'upload'} disabled={busy !== null && busy !== 'upload'} />
          <Button label="Volver" variant="ghost" onPress={() => dispatch({ type: 'GO', step: 'register' })} disabled={busy !== null} />
        </>
      }
    >
      <Banner tone="info" title="Para que se lea bien" message="Pon la cédula sobre una superficie oscura, con buena luz, sin reflejos ni dedos encima, y que se vean las 4 esquinas." />
      {error ? <Banner tone="danger" message={error} actions={busy ? undefined : [{ label: 'Reintentar', onPress: next }]} /> : null}
      {(['front', 'back'] as Side[]).map((side) => {
        const image = state.images[side];
        const note = notes[side];
        return (
          <Card key={side} title={`${SIDE_LABEL[side]} de la cédula`}>
            {image ? (
              <Image source={{ uri: image.uri }} style={s.preview} resizeMode="cover" accessibilityLabel={`Foto del ${SIDE_LABEL[side]}`} />
            ) : (
              <View style={[s.preview, s.placeholder]}>
                <Text style={{ color: colors.muted }}>Sin foto</Text>
              </View>
            )}
            {note ? <Banner tone={note.tone} message={note.message} /> : null}
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Button label={image ? 'Repetir foto' : 'Tomar foto'} onPress={() => capture(side, 'camera')} loading={busy === side} disabled={busy !== null} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Galería" variant="secondary" onPress={() => capture(side, 'library')} disabled={busy !== null} />
              </View>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 1.58, borderRadius: radius.md, marginBottom: space.md, backgroundColor: colors.sand },
  placeholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border },
  row: { flexDirection: 'row', gap: space.sm },
});
