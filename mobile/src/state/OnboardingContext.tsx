import React, { createContext, useContext, useMemo, useReducer } from 'react';
import type { CapturedImage, Confirmation, OcrResult, Registration, Session } from '../types';

/**
 * Estado global del recorrido (useReducer + Context).
 * Todo lo que el usuario ya hizo vive aquí: si un paso falla (OCR, red,
 * consultas), volvemos a la pantalla sin perder el trabajo realizado.
 * Se guarda SOLO en memoria: al cerrar la app no quedan datos personales
 * en el teléfono.
 */

export type Step = 'welcome' | 'register' | 'capture' | 'ocr' | 'verify' | 'result' | 'metrics';

export interface OnboardingState {
  step: Step;
  sessionId?: string;
  registration: Registration;
  images: { front?: CapturedImage; back?: CapturedImage };
  documentsUploaded: boolean;
  useOcr: boolean;
  ocr?: OcrResult;
  confirmation?: Confirmation;
  manualReview: boolean;
  session?: Session;
}

const emptyRegistration: Registration = { fullName: '', documentType: 'CC', documentNumber: '', phone: '', email: '', city: '' };

const initialState: OnboardingState = {
  step: 'welcome',
  registration: emptyRegistration,
  images: {},
  documentsUploaded: false,
  useOcr: true,
  manualReview: false,
};

type Action =
  | { type: 'GO'; step: Step }
  | { type: 'REGISTERED'; sessionId: string; registration: Registration }
  | { type: 'SET_IMAGE'; side: 'front' | 'back'; image?: CapturedImage }
  | { type: 'DOCUMENTS_UPLOADED' }
  | { type: 'SET_USE_OCR'; value: boolean }
  | { type: 'OCR_DONE'; ocr: OcrResult }
  | { type: 'CONFIRMED'; confirmation: Confirmation }
  | { type: 'MANUAL_REVIEW' }
  | { type: 'SESSION'; session: Session }
  | { type: 'RESET' };

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'GO':
      return { ...state, step: action.step };
    case 'REGISTERED':
      // Nueva sesión en el backend: lo que dependía de la anterior se debe volver a enviar.
      return { ...state, sessionId: action.sessionId, registration: action.registration, documentsUploaded: false,
        ocr: undefined, confirmation: undefined, manualReview: false, session: undefined, step: 'capture' };
    case 'SET_IMAGE':
      return { ...state, images: { ...state.images, [action.side]: action.image }, documentsUploaded: false, ocr: undefined };
    case 'DOCUMENTS_UPLOADED':
      return { ...state, documentsUploaded: true, step: 'ocr' };
    case 'SET_USE_OCR':
      return { ...state, useOcr: action.value };
    case 'OCR_DONE':
      return { ...state, ocr: action.ocr };
    case 'CONFIRMED':
      // Las fotos ya no hacen falta: se sueltan de memoria (minimización de datos).
      return { ...state, confirmation: action.confirmation, images: {}, step: 'verify' };
    case 'MANUAL_REVIEW':
      return { ...state, manualReview: true };
    case 'SESSION':
      return { ...state, session: action.session, step: action.session.result ? 'result' : state.step };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

const Ctx = createContext<{ state: OnboardingState; dispatch: React.Dispatch<Action> } | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOnboarding debe usarse dentro de OnboardingProvider');
  return ctx;
}

/** Paso anterior para el botón "atrás" (Android) y los botones de volver. */
export const PREVIOUS_STEP: Partial<Record<Step, Step>> = {
  register: 'welcome',
  capture: 'register',
  ocr: 'capture',
  metrics: 'welcome',
};
