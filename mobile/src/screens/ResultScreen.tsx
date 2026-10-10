import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '../api/client';
import { verify } from '../api/onboarding';
import { Badge, Banner, Button, Card, KeyValue, Screen, type Tone } from '../components/ui';
import { useOnboarding } from '../state/OnboardingContext';
import { colors, decisionStyle, radius, space } from '../theme';
import type { Alert, OcrFields, QueryResult } from '../types';
import { downloadAndShareReport, type ReportFormat } from '../utils/report';

const SEVERITY_TONE: Record<Alert['severity'], Tone> = { LOW: 'info', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' };
const QUERY_TONE: Record<QueryResult['status'], Tone> = { OK: 'success', ALERT: 'warning', NOT_FOUND: 'warning', ERROR: 'danger', TIMEOUT: 'danger' };
const FIELDS: [keyof OcrFields, string][] = [
  ['firstNames', 'Nombres'], ['lastNames', 'Apellidos'], ['documentNumber', 'Número'],
  ['birthDate', 'Nacimiento'], ['issuePlace', 'Expedición'], ['issueDate', 'F. expedición'],
];

/** Pantalla final AUDITABLE: muestra el estado y TODO lo que llevó a él. */
export function ResultScreen() {
  const { state, dispatch } = useOnboarding();
  const session = state.session!;
  const result = session.result!;
  const look = decisionStyle[result.decision];
  const [busy, setBusy] = useState<ReportFormat | 'retry' | null>(null);
  const [notice, setNotice] = useState<{ tone: Tone; message: string; retry?: () => void }>();

  const failedQueries = session.queries.some((q) => q.status === 'ERROR' || q.status === 'TIMEOUT');

  async function report(format: ReportFormat) {
    setBusy(format);
    setNotice(undefined);
    try {
      await downloadAndShareReport(session.id, format);
    } catch (err) {
      const message = err instanceof Error && err.message === 'SHARING_UNAVAILABLE'
        ? 'Este dispositivo no permite compartir archivos. Prueba otro formato o descárgalo desde el backend.'
        : `No se pudo generar el informe ${format.toUpperCase()}. ${errorMessage(err)}`;
      setNotice({ tone: 'danger', message, retry: () => report(format) });
    } finally {
      setBusy(null);
    }
  }

  async function retryQueries() {
    setBusy('retry');
    setNotice(undefined);
    try {
      dispatch({ type: 'SESSION', session: await verify(session.id) });
    } catch (err) {
      setNotice({ tone: 'danger', message: errorMessage(err), retry: retryQueries });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      step={4}
      title="Resultado de la validación"
      footer={
        <>
          <Button label="Nuevo registro" onPress={() => dispatch({ type: 'RESET' })} />
          <Button label="Ver métricas" variant="ghost" onPress={() => dispatch({ type: 'GO', step: 'metrics' })} />
        </>
      }
    >
      <View style={[st.hero, { backgroundColor: look.bg, borderColor: look.color }]}>
        <Text style={[st.heroLabel, { color: look.color }]}>{look.label}</Text>
        <Text style={[st.heroScore, { color: look.color }]}>{result.score}<Text style={st.heroMax}>/100</Text></Text>
        <View style={st.track}><View style={[st.fill, { width: `${result.score}%` as const, backgroundColor: look.color }]} /></View>
        <Text style={st.heroSummary}>{result.summary}</Text>
      </View>

      {notice ? <Banner tone={notice.tone} message={notice.message} actions={notice.retry ? [{ label: 'Reintentar', onPress: notice.retry }] : undefined} /> : null}
      {failedQueries ? (
        <Banner tone="warning" title="Algunas consultas no respondieron" message="El resultado quedó en revisión. Puedes reintentar las consultas ahora."
          actions={busy ? undefined : [{ label: 'Reintentar consultas', onPress: retryQueries }]} />
      ) : null}

      <Card title="¿Cómo se calculó?">
        {result.factors.map((f) => (
          <View key={f.key} style={{ paddingVertical: 6 }}>
            <View style={st.between}>
              <Text style={st.strong}>{f.label}</Text>
              <Text style={st.strong}>{f.points}/{f.max}</Text>
            </View>
            <View style={st.trackSmall}><View style={[st.fill, { width: `${(f.points / f.max) * 100}%` as const, backgroundColor: colors.navySoft }]} /></View>
            <Text style={st.muted}>{f.reason}</Text>
          </View>
        ))}
        {result.rawScore !== undefined ? (
          <Text style={[st.body, { marginTop: space.sm }]}>
            <Text style={st.strong}>Puntos sumados: {result.rawScore}/100</Text>
            {result.cappedBy ? ` → limitado a ${result.score} por ${result.cappedBy}.` : ' = score final.'}
          </Text>
        ) : null}
        <View style={st.rule}>
          <Text style={st.strong}>Regla de decisión</Text>
          <Text style={st.muted}>80 o más: Validado · 50–79: Requiere revisión manual · menos de 50: No validado.</Text>
          <Text style={st.muted}>Una alerta crítica deja el caso en No validado; una alerta alta, como máximo en revisión.</Text>
        </View>
      </Card>

      <Card title={`Alertas (${result.alerts.length})`}>
        {result.alerts.length === 0 ? <Text style={st.muted}>Sin alertas.</Text> : result.alerts.map((a) => (
          <View key={a.code} style={st.item}>
            <Badge text={a.severity} tone={SEVERITY_TONE[a.severity]} />
            <Text style={st.body}>{a.message}</Text>
          </View>
        ))}
      </Card>

      <Card title="Consultas realizadas">
        {session.queries.map((q) => (
          <View key={q.name} style={st.item}>
            <View style={st.between}>
              <Text style={st.strong}>{q.label}</Text>
              <Badge text={q.status} tone={QUERY_TONE[q.status]} />
            </View>
            <Text style={st.body}>{q.detail}</Text>
            <Text style={st.muted}>{q.provider} · {q.durationMs} ms · {q.attempts} intento(s)</Text>
          </View>
        ))}
      </Card>

      <Card title="Usuario y documento">
        <KeyValue label="Nombre registrado" value={session.registration.fullName} />
        <KeyValue label="Documento" value={`${session.registration.documentType} ${session.registration.documentNumber}`} />
        <KeyValue label="Celular" value={session.registration.phone} />
        <KeyValue label="Correo" value={session.registration.email} />
        <KeyValue label="Ciudad" value={session.registration.city} />
        <KeyValue label="Revisión manual" value={session.manualReview?.requested ? 'Solicitada' : 'No'} />
      </Card>

      <Card title={`OCR vs. confirmado · ${session.ocr?.status ?? 'sin OCR'}`}>
        <View style={st.between}><Text style={[st.muted, st.col]}>Campo</Text><Text style={[st.muted, st.col]}>OCR</Text><Text style={[st.muted, st.col]}>Confirmado</Text></View>
        {FIELDS.map(([key, label]) => {
          const corrected = session.confirmed?.correctedFields.includes(key);
          return (
            <View key={key} style={[st.between, { paddingVertical: 4 }]}>
              <Text style={[st.body, st.col]}>{label}</Text>
              <Text style={[st.body, st.col]}>{session.ocr?.fields[key] ?? '—'}</Text>
              <Text style={[st.body, st.col, corrected && { color: colors.warning, fontWeight: '800' }]}>
                {(session.confirmed?.[key as keyof typeof session.confirmed] as string | undefined) ?? '—'}{corrected ? ' ✎' : ''}
              </Text>
            </View>
          );
        })}
        <Text style={[st.muted, { marginTop: 6 }]}>✎ = corregido por el usuario</Text>
      </Card>

      <Card title="Bitácora de decisión">
        {session.log.map((l, i) => (
          <View key={`${l.at}-${i}`} style={st.logRow}>
            <Text style={st.logTime}>{new Date(l.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</Text>
            <Text style={[st.body, { flex: 1 }, l.level !== 'INFO' && { color: l.level === 'ERROR' ? colors.danger : colors.warning }]}>
              <Text style={st.strong}>{l.step} · </Text>{l.message}
            </Text>
          </View>
        ))}
      </Card>

      <Card title="Informe descargable">
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(['pdf', 'json', 'csv'] as ReportFormat[]).map((f) => (
            <View key={f} style={{ flex: 1 }}>
              <Button label={f.toUpperCase()} variant="secondary" onPress={() => report(f)} loading={busy === f} disabled={busy !== null} />
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { borderWidth: 1.5, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md },
  heroLabel: { fontSize: 15, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  heroScore: { fontSize: 52, fontWeight: '900' },
  heroMax: { fontSize: 20, fontWeight: '700' },
  heroSummary: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: space.sm },
  track: { height: 10, borderRadius: 5, backgroundColor: '#ffffffaa', overflow: 'hidden' },
  trackSmall: { height: 6, borderRadius: 3, backgroundColor: colors.sand, overflow: 'hidden', marginVertical: 4 },
  fill: { height: '100%', borderRadius: 5 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  strong: { fontWeight: '700', color: colors.text, fontSize: 14 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  item: { paddingVertical: space.sm, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  col: { flex: 1 },
  rule: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 2 },
  logRow: { flexDirection: 'row', gap: space.sm, paddingVertical: 5 },
  logTime: { color: colors.muted, fontSize: 12, width: 64, paddingTop: 2 },
});
