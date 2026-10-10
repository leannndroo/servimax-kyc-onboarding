import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, space } from '../theme';
import { Button } from './ui';

/**
 * Red de seguridad: si una pantalla falla al dibujarse, mostramos un mensaje
 * y un botón para reintentar en lugar de cerrar la app. Como el estado del
 * onboarding vive FUERA de este componente, no se pierde nada de lo capturado.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Solo el nombre del error: nunca datos del usuario en logs.
    console.warn('UI error capturado:', error.name);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={s.box}>
        <Text style={s.title}>Algo no salió como esperábamos</Text>
        <Text style={s.text}>Tus datos siguen guardados en esta sesión. Puedes volver a intentarlo.</Text>
        <Button label="Volver a intentar" onPress={() => this.setState({ failed: false })} />
      </View>
    );
  }
}

const s = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: colors.bg, gap: space.md },
  title: { fontSize: 22, fontWeight: '800', color: colors.navy },
  text: { fontSize: 15, color: colors.muted, lineHeight: 21 },
});
