// Se importa primero en cada prueba e2e: la configuración se lee al cargar AppModule.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.DEMO_OFFLINE = 'true';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.THROTTLE_LIMIT = '1000';
process.env.THROTTLE_LIMIT_COSTOSO = '1000';
