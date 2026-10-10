import React, { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { errorMessage } from '../api/client';
import { confirmData, requestManualReview, runOcr } from '../api/onboarding';
import { Banner, Button, Card, Field, Screen, type Tone } from '../components/ui';
import { useOnboarding } from '../state/OnboardingContext';
import { colors } from '../theme';
import type { Confirmation, OcrFields, OcrResult, Registration } from '../types';
import { type Errors, hasErrors, validateConfirmation } from '../validation';

const STATUS_TONE: Record<OcrResult['status'], Tone> = {
  SUCCESS: 'success', PARTIAL: 'warning', NO_RESULTS: 'danger', FAILED: 'danger', SKIPPED: 'info',
};

/** Prellenado: lo que leyó el OCR y, si falta, lo que el usuario ya escribió en el registro. */
function initialForm(reg: Registration, fields: OcrFields = {}): Confirmation {
  const words = reg.fullName.toUpperCase().split(/\s+/);
  const nNames = words.length >= 4 ? 2 : 1;
  return {
    firstNames: fields.firstNames ?? words.slice(0, nNames).join(' '),
    lastNames: fields.lastNames ?? words.slice(nNames).join(' '),
    documentNumber: fields.documentNumber ?? reg.documentNumber,
    birthDate: fields.birthDate ?? '',
    issuePlace: fields.issuePlace ?? '',
    issueDate: fields.issueDate,
  };
}

/** Inserta los guiones mientras se escribe la fecha: 19900315 → 1990-03-15. */
const formatDate = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join('-');
};

export function OcrReviewScreen() {
  const { state, dispatch } = useOnboarding();
  const { ocr, registration } = state;
  const [form, setForm] = useState<Confirmation>(() => state.confirmation ?? initialForm(registration, ocr?.fields));
  const [errors, setErrors] = useState<Errors<Confirmation>>({});
  const [busy, setBusy] = useState<'ocr' | 'confirm' | 'review' | null>(null);
  const [error, setError] = useState<string>();

  async function read() {
    setBusy('ocr');
    setError(undefined);
    try {
      const result = await runOcr(state.sessionId!, state.useOcr);
      dispatch({ type: 'OCR_DONE', ocr: result });
      setForm(initialForm(registration, result.fields));
    } catch (err) {
      // Si falla, el usuario no pierde nada: puede reintentar o digitar.
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function escalate() {
    setBusy('review');
    try {
      await requestManualReview(state.sessionId!, `OCR ${ocr?.status ?? 'no ejecutado'}: el usuario pidió revisión manual`);
      dispatch({ type: 'MANUAL_REVIEW' });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    const clean: Confirmation = {
      ...form, firstNames: form.firstNames.trim(), lastNames: form.lastNames.trim(), issuePlace: form.issuePlace.trim(),
      issueDate: form.issueDate || undefined,
    };
    const found = validateConfirmation(clean);
    setErrors(found);
    if (hasErrors(found)) return;
    setBusy('confirm');
    setError(undefined);
    try {
      await confirmData(state.sessionId!, clean);
      dispatch({ type: 'CONFIRMED', confirmation: clean });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const hint = (key: keyof OcrFields) => {
    if (!ocr || ocr.status === 'SKIPPED') return undefined;
    return ocr.fields[key] ? 'Leído del documento · revísalo' : 'No se pudo leer · complétalo';
  };
  const numberMismatch = form.documentNumber && form.documentNumber !== registration.documentNumber
    ? `No coincide con el número que registraste (${registration.documentNumber}). Corrige si es un error de lectura.`
    : undefined;
  const failed = ocr && ['NO_RESULTS', 'FAILED'].includes(ocr.status);
  const set = (key: keyof Confirmation, transform?: (v: string) => string) => (v: string) =>
    setForm((f) => ({ ...f, [key]: transform ? transform(v) : v }));

  return (
    <Screen
      step={2}
      title={ocr ? 'Revisa tus datos' : 'Lectura del documento'}
      subtitle={ocr ? 'Corrige lo que no coincida con tu cédula y confirma.' : 'Podemos leer tu cédula automáticamente o puedes digitar los datos.'}
      footer={
        ocr ? (
          <>
            <Button label="Confirmar datos" onPress={confirm} loading={busy === 'confirm'} disabled={busy !== null && busy !== 'confirm'} />
            <Button label="Repetir fotos" variant="ghost" onPress={() => dispatch({ type: 'GO', step: 'capture' })} disabled={busy !== null} />
          </>
        ) : (
          <>
            <Button label={state.useOcr ? 'Leer documento' : 'Digitar datos'} onPress={read} loading={busy === 'ocr'} />
            <Button label="Volver" variant="ghost" onPress={() => dispatch({ type: 'GO', step: 'capture' })} disabled={busy !== null} />
          </>
        )
      }
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.text, fontSize: 15 }}>Lectura automática (OCR)</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{state.useOcr ? 'Activada' : 'Desactivada: digitarás los datos'}</Text>
          </View>
          <Switch value={state.useOcr} onValueChange={(v) => dispatch({ type: 'SET_USE_OCR', value: v })} disabled={busy !== null}
            accessibilityLabel="Activar lectura automática" trackColor={{ true: colors.navy }} />
        </View>
        {ocr ? <View style={{ marginTop: 12 }}><Button label={state.useOcr ? 'Volver a leer' : 'Aplicar'} variant="secondary" onPress={read} loading={busy === 'ocr'} disabled={busy !== null} /></View> : null}
      </Card>

      {error ? <Banner tone="danger" message={error} /> : null}
      {ocr ? (
        <Banner
          tone={STATUS_TONE[ocr.status]}
          title={failed ? 'No pudimos leer el documento' : undefined}
          message={`${ocr.message} (${ocr.provider}, intento ${ocr.attempts})`}
          actions={failed ? [
            { label: 'Reintentar lectura', onPress: read },
            { label: 'Repetir fotos', onPress: () => dispatch({ type: 'GO', step: 'capture' }) },
            ...(state.manualReview ? [] : [{ label: 'Pasar a revisión manual', onPress: escalate }]),
          ] : undefined}
        />
      ) : null}
      {state.manualReview ? (
        <Banner tone="warning" message="Tu caso irá a revisión manual por un asesor. Completa los datos para terminar el registro." />
      ) : null}

      {ocr ? (
        <Card title="Datos del documento">
          <Field label="Nombres" value={form.firstNames} onChangeText={set('firstNames')} error={errors.firstNames} hint={hint('firstNames')} autoCapitalize="characters" />
          <Field label="Apellidos" value={form.lastNames} onChangeText={set('lastNames')} error={errors.lastNames} hint={hint('lastNames')} autoCapitalize="characters" />
          <Field label="Número de documento" value={form.documentNumber} onChangeText={set('documentNumber', (v) => v.replace(/\D/g, ''))}
            error={errors.documentNumber ?? numberMismatch} hint={hint('documentNumber')} keyboardType="number-pad" maxLength={10} />
          <Field label="Fecha de nacimiento" value={form.birthDate} onChangeText={set('birthDate', formatDate)} error={errors.birthDate}
            hint={hint('birthDate') ?? 'AAAA-MM-DD'} keyboardType="number-pad" placeholder="1990-03-15" />
          <Field label="Lugar de expedición" value={form.issuePlace} onChangeText={set('issuePlace')} error={errors.issuePlace}
            hint={hint('issuePlace')} autoCapitalize="characters" />
          <Field label="Fecha de expedición (opcional)" value={form.issueDate ?? ''} onChangeText={set('issueDate', formatDate)}
            error={errors.issueDate} keyboardType="number-pad" placeholder="2008-03-22" />
        </Card>
      ) : null}
    </Screen>
  );
}
