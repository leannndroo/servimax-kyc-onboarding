import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCedulaText } from '../src/services/ocr/cedulaParser';
import { MockOcrProvider } from '../src/services/ocr/ocrProviders';
import { ageFromIsoDate, nameCoverage, normalizeName } from '../src/domain/text';

describe('parseCedulaText', () => {
  it('lee la cédula amarilla (etiqueta debajo del valor)', () => {
    const front = 'REPUBLICA DE COLOMBIA\nIDENTIFICACION PERSONAL\nCEDULA DE CIUDADANIA\nNUMERO 1.023.456.789\nPÉREZ GÓMEZ\nAPELLIDOS\nJUAN CARLOS\nNOMBRES\nFIRMA';
    const back = 'FECHA DE NACIMIENTO 15-MAR-1990\nBOGOTA D.C.\n(CUNDINAMARCA)\nLUGAR DE NACIMIENTO\n1.68 O+ M\nESTATURA G.S. RH SEXO\n22-MAR-2008 MEDELLIN\nFECHA Y LUGAR DE EXPEDICION';
    assert.deepEqual(parseCedulaText(front, back), {
      documentNumber: '1023456789',
      lastNames: 'PEREZ GOMEZ',
      firstNames: 'JUAN CARLOS',
      birthDate: '1990-03-15',
      birthPlace: 'BOGOTA D.C. (CUNDINAMARCA)',
      issueDate: '2008-03-22',
      issuePlace: 'MEDELLIN',
    });
  });

  it('lee la cédula digital (etiqueta encima del valor)', () => {
    const front = 'REPÚBLICA DE COLOMBIA\nCédula de Ciudadanía\nNUIP 1.023.456.789\nApellidos / Surnames\nPÉREZ GÓMEZ\nNombres / Given names\nJUAN CARLOS\nFecha de nacimiento / Date of birth\n15 MAR 1990\nLugar de nacimiento / Place of birth\nBOGOTÁ D.C.\nFecha y lugar de expedición\n22 MAR 2008 BOGOTÁ D.C.';
    const fields = parseCedulaText(front, '');
    assert.equal(fields.documentNumber, '1023456789');
    assert.equal(fields.lastNames, 'PEREZ GOMEZ');
    assert.equal(fields.firstNames, 'JUAN CARLOS');
    assert.equal(fields.birthDate, '1990-03-15');
    assert.equal(fields.issueDate, '2008-03-22');
    assert.equal(fields.issuePlace, 'BOGOTA D.C.');
  });

  it('el OCR simulado produce texto que el parser entiende (y el escenario 7 altera el número)', async () => {
    const ocr = new MockOcrProvider();
    const registration = { fullName: 'Ana María Ruiz Díaz', documentType: 'CC' as const, documentNumber: '52123458', phone: '3001234567', email: 'a@b.co', city: 'Cali' };
    const read = async (documentNumber: string) => {
      const reg = { ...registration, documentNumber };
      const [f, b] = await Promise.all([
        ocr.extractText(Buffer.alloc(0), 'image/jpeg', { side: 'front', registration: reg }),
        ocr.extractText(Buffer.alloc(0), 'image/jpeg', { side: 'back', registration: reg }),
      ]);
      return parseCedulaText(f, b);
    };
    const ok = await read('52123458');
    assert.equal(ok.documentNumber, '52123458');
    assert.equal(ok.firstNames, 'ANA MARIA');
    assert.equal(ok.lastNames, 'RUIZ DIAZ');
    assert.equal(ok.issuePlace, 'CALI');
    assert.notEqual((await read('52123457')).documentNumber, '52123457');
    assert.deepEqual(await read('52123456'), {});
  });

  it('devuelve objeto vacío cuando el OCR no encontró texto', () => {
    assert.deepEqual(parseCedulaText('', ''), {});
  });
});

describe('utilidades de texto', () => {
  it('normaliza tildes, mayúsculas y espacios', () => {
    assert.equal(normalizeName('  José   Peña  '), 'JOSE PENA');
  });

  it('nameCoverage tolera orden y nombres incompletos', () => {
    assert.equal(nameCoverage('Juan Pérez', 'JUAN CARLOS PEREZ GOMEZ'), 1);
    assert.equal(nameCoverage('Gomez Juan', 'JUAN GOMEZ'), 1);
    assert.equal(nameCoverage('Ana Ruiz', 'JUAN PEREZ'), 0);
  });

  it('calcula la edad cumplida', () => {
    assert.equal(ageFromIsoDate('2000-10-11', new Date('2026-10-10T12:00:00Z')), 25);
    assert.equal(ageFromIsoDate('2000-10-10', new Date('2026-10-10T12:00:00Z')), 26);
    assert.equal(ageFromIsoDate('fecha-mala'), null);
  });
});
