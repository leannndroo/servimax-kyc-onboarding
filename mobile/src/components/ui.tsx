import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  type TextInputProps, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space } from '../theme';

/** Componentes visuales reutilizables. Las pantallas solo componen estas piezas. */

const STEPS = ['Registro', 'Documento', 'Verificación', 'Consultas', 'Resultado'];

export function Screen({ title, subtitle, step, children, footer }: {
  title: string; subtitle?: string; step?: number; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Text style={s.brand}>SERVIMAX · ONBOARDING</Text>
          {step !== undefined && (
            <View style={s.progress} accessibilityLabel={`Paso ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}>
              {STEPS.map((label, i) => (
                <View key={label} style={[s.progressBar, i <= step && s.progressActive]} />
              ))}
            </View>
          )}
          <Text style={s.title}>{title}</Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ label, onPress, variant = 'primary', loading, disabled }: {
  label: string; onPress: () => void; variant?: Variant; loading?: boolean; disabled?: boolean;
}) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [s.btn, s[`btn_${variant}`], off && s.btnOff, pressed && { opacity: 0.85 }]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.navy} />
      ) : (
        <Text style={[s.btnText, (variant === 'secondary' || variant === 'ghost') && { color: colors.navy }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...input }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        style={[s.input, error ? { borderColor: colors.danger } : null]}
        {...input}
      />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const toneColors = {
  info: { bg: colors.infoBg, fg: colors.navy },
  success: { bg: colors.successBg, fg: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning },
  danger: { bg: colors.dangerBg, fg: colors.danger },
};
export type Tone = keyof typeof toneColors;

export function Banner({ tone = 'info', title, message, actions }: {
  tone?: Tone; title?: string; message: string; actions?: { label: string; onPress: () => void }[];
}) {
  const t = toneColors[tone];
  return (
    <View style={[s.banner, { backgroundColor: t.bg, borderLeftColor: t.fg }]} accessibilityLiveRegion="polite">
      {title ? <Text style={[s.bannerTitle, { color: t.fg }]}>{title}</Text> : null}
      <Text style={s.bannerText}>{message}</Text>
      {actions?.length ? (
        <View style={s.bannerActions}>
          {actions.map((a) => (
            <Pressable key={a.label} onPress={a.onPress} accessibilityRole="button" hitSlop={8}>
              <Text style={[s.bannerAction, { color: t.fg }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value?: string | number }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue}>{value === undefined || value === '' ? '—' : String(value)}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View style={s.segmented}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }} style={[s.segment, o.value === value && s.segmentOn]}>
          <Text style={[s.segmentText, o.value === value && { color: '#fff' }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Badge({ text, tone }: { text: string; tone: Tone }) {
  return <Text style={[s.badge, { backgroundColor: toneColors[tone].bg, color: toneColors[tone].fg }]}>{text}</Text>;
}

export const Gap = ({ size = space.md }: { size?: number }) => <View style={{ height: size }} />;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  brand: { fontSize: 11, letterSpacing: 1.5, color: colors.muted, fontWeight: '700' },
  progress: { flexDirection: 'row', gap: 4, marginTop: space.sm },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressActive: { backgroundColor: colors.gold },
  title: { fontSize: 24, fontWeight: '800', color: colors.navy, marginTop: space.md },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: space.xs, lineHeight: 21 },
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
  footer: { padding: space.lg, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card },
  btn: { minHeight: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  btn_primary: { backgroundColor: colors.navy },
  btn_secondary: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.navy },
  btn_ghost: { backgroundColor: 'transparent' },
  btn_danger: { backgroundColor: colors.danger },
  btnOff: { opacity: 0.45 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16, color: colors.text, backgroundColor: colors.card },
  error: { color: colors.danger, fontSize: 13, marginTop: space.xs },
  hint: { color: colors.muted, fontSize: 13, marginTop: space.xs },
  banner: { borderLeftWidth: 4, borderRadius: radius.sm, padding: space.md, marginBottom: space.md },
  bannerTitle: { fontWeight: '800', fontSize: 15, marginBottom: 2 },
  bannerText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  bannerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginTop: space.sm },
  bannerAction: { fontWeight: '800', fontSize: 14, textDecorationLine: 'underline' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  cardTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.muted, marginBottom: space.sm, textTransform: 'uppercase' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: space.md },
  kvLabel: { color: colors.muted, fontSize: 14, flexShrink: 0 },
  kvValue: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' },
  segmented: { flexDirection: 'row', backgroundColor: colors.sand, borderRadius: radius.md, padding: 3, marginBottom: space.md },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.navy },
  segmentText: { fontWeight: '700', color: colors.navy, fontSize: 14 },
  badge: { fontSize: 12, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
});
