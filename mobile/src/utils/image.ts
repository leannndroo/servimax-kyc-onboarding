import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { CapturedImage } from '../types';

/**
 * Captura o carga una foto del documento y la prepara para el OCR:
 *  - pide permisos y maneja el rechazo,
 *  - detecta cancelación del usuario,
 *  - rechaza imágenes con muy baja resolución,
 *  - reduce y comprime (OCR.space gratis acepta hasta 1 MB; además ahorra datos móviles).
 */

export type AcquireResult =
  | { status: 'ok'; image: CapturedImage }
  | { status: 'cancelled' }
  | { status: 'denied'; message: string }
  | { status: 'low_quality'; message: string }
  | { status: 'error'; message: string };

const MIN_SIDE = 800; // px del lado mayor: por debajo, el texto de la cédula no se lee
const TARGET_SIDE = 1600;

export async function acquireDocumentImage(source: 'camera' | 'library'): Promise<AcquireResult> {
  try {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return {
        status: 'denied',
        message: source === 'camera'
          ? 'Necesitamos permiso de cámara para tomar la foto. Actívalo en Ajustes o carga la foto desde la galería.'
          : 'Necesitamos permiso para ver tus fotos. Actívalo en Ajustes o usa la cámara.',
      };
    }

    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };
    const asset = result.assets[0];

    if (Math.max(asset.width, asset.height) < MIN_SIDE) {
      return { status: 'low_quality', message: 'La foto tiene muy baja resolución. Acércate a la cédula, con buena luz, y vuelve a intentarlo.' };
    }

    // Reducimos manteniendo la proporción y comprimimos a JPEG.
    const landscape = asset.width >= asset.height;
    const context = ImageManipulator.manipulate(asset.uri);
    if (Math.max(asset.width, asset.height) > TARGET_SIDE) {
      context.resize(landscape ? { width: TARGET_SIDE } : { height: TARGET_SIDE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    return { status: 'ok', image: { uri: saved.uri, width: saved.width, height: saved.height } };
  } catch {
    return { status: 'error', message: 'No pudimos procesar la foto. Intenta de nuevo.' };
  }
}
