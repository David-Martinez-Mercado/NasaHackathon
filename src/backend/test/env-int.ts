// Se importa primero en cada prueba de integración: la configuración se lee al cargar AppModule.
import './env-test';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is missing: integration tests are run with `npm run test:int` (jest-int.json).');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
