import './env-test';
// Límites bajos a propósito para poder probarlos
process.env.GRAPHQL_MAX_DEPTH = '2';
process.env.GRAPHQL_MAX_COMPLEXITY = '10';
process.env.THROTTLE_LIMIT_COSTOSO = '2';
process.env.THROTTLE_LIMIT = '5';
