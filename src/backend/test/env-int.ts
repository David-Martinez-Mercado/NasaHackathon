// Se importa primero en cada prueba de integración: la configuración se lee al cargar AppModule.
import './env-test';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Falta TEST_DATABASE_URL: las pruebas de integración se corren con `npm run test:int` (jest-int.json).');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
