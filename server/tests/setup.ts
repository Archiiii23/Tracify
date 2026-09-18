// Test environment: isolated database name, throwaway secret, test NODE_ENV.
process.env['NODE_ENV'] = "test";
process.env['MONGODB_URI'] =
  process.env['MONGODB_URI_TEST'] ?? "mongodb://127.0.0.1:27017/vasptrace_test";
process.env['JWT_SECRET'] =
  process.env['JWT_SECRET'] ?? "test-secret-value-that-is-long-enough-1234567890";
process.env['CLIENT_URL'] = "http://localhost:5173,http://localhost:8080";
