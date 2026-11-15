// Debe importarse primero: exportar el esquema no usa la base de datos, pero la configuración exige DATABASE_URL.
process.env.DATABASE_URL ??= 'postgresql://esquema:esquema@localhost:5432/esquema';
