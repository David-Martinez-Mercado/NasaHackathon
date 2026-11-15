// La validación de Env se evalúa al importar AppModule: las variables con valor por defecto deben fijarse ANTES de importarlo.
process.env.ML_SERVICE_TOKEN = 'secreto-de-prueba';
process.env.ML_SERVICE_TIMEOUT_MS = '600';
process.env.ML_SERVICE_BREAKER_FAILURES = '2';
process.env.ML_SERVICE_BREAKER_RESET_MS = '500';
