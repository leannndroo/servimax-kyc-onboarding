import React, { useState } from 'react';
import { Text } from 'react-native';
import { ApiError, errorMessage } from '../api/client';
import { createSession } from '../api/onboarding';
import { Banner, Button, Field, Screen, Segmented } from '../components/ui';
import { useOnboarding } from '../state/OnboardingContext';
import { colors } from '../theme';
import type { DocumentType, Registration } from '../types';
import { type Errors, hasErrors, normalizePhone, validateRegistration } from '../validation';

export function RegistrationScreen() {
  const { state, dispatch } = useOnboarding();
  const [form, setForm] = useState<Registration>(state.registration);
  const [errors, setErrors] = useState<Errors<Registration>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof Registration, boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const set = (key: keyof Registration) => (value: string) => {
    const next = { ...form, [key]: key === 'documentNumber' ? value.replace(/\D/g, '') : value };
    setForm(next);
    if (touched[key]) setErrors(validateRegistration(next)); // corrige el error mientras escribe
  };
  const blur = (key: keyof Registration) => () => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors(validateRegistration(form));
  };
  const shown = (key: keyof Registration) => (touched[key] ? errors[key] : undefined);

  async function submit() {
    const found = validateRegistration(form);
    setErrors(found);
    setTouched({ fullName: true, documentNumber: true, phone: true, email: true, city: true });
    if (hasErrors(found)) return;

    setLoading(true);
    setServerError(undefined);
    try {
      const clean: Registration = {
        ...form, fullName: form.fullName.trim().replace(/\s+/g, ' '), phone: normalizePhone(form.phone),
        email: form.email.trim().toLowerCase(), city: form.city.trim(),
      };
      const session = await createSession(clean);
      dispatch({ type: 'REGISTERED', sessionId: session.id, registration: clean });
    } catch (err) {
      // Errores de validación del servidor se muestran bajo cada campo.
      if (err instanceof ApiError && err.details?.fields) setErrors(err.details.fields as Errors<Registration>);
      setServerError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      step={0}
      title="Tus datos"
      subtitle="Escríbelos tal como aparecen en tu documento."
      footer={
        <>
          <Button label="Continuar" onPress={submit} loading={loading} />
          <Button label="Volver" variant="ghost" onPress={() => dispatch({ type: 'GO', step: 'welcome' })} disabled={loading} />
        </>
      }
    >
      {serverError ? <Banner tone="danger" message={serverError} actions={[{ label: 'Reintentar', onPress: submit }]} /> : null}
      <Field label="Nombre completo" value={form.fullName} onChangeText={set('fullName')} onBlur={blur('fullName')}
        error={shown('fullName')} placeholder="Ej: Juan Carlos Pérez Gómez" autoCapitalize="words" autoComplete="name" />
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 }}>Tipo de documento</Text>
      <Segmented<DocumentType>
        options={[{ value: 'CC', label: 'Cédula de ciudadanía' }, { value: 'CE', label: 'Cédula de extranjería' }]}
        value={form.documentType}
        onChange={(v) => setForm({ ...form, documentType: v })}
      />
      <Field label="Número de documento" value={form.documentNumber} onChangeText={set('documentNumber')} onBlur={blur('documentNumber')}
        error={shown('documentNumber')} keyboardType="number-pad" maxLength={10} placeholder="Sin puntos ni espacios" />
      <Field label="Celular" value={form.phone} onChangeText={set('phone')} onBlur={blur('phone')}
        error={shown('phone')} keyboardType="phone-pad" placeholder="3001234567" autoComplete="tel" />
      <Field label="Correo electrónico" value={form.email} onChangeText={set('email')} onBlur={blur('email')}
        error={shown('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="tu@correo.com" />
      <Field label="Ciudad o municipio" value={form.city} onChangeText={set('city')} onBlur={blur('city')}
        error={shown('city')} placeholder="Ej: Bogotá" autoCapitalize="words" />
    </Screen>
  );
}
