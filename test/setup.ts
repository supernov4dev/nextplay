// Force la base de TEST — écrase toute valeur venant de .env pour ne jamais
// écrire dans la base de dev pendant les tests.
process.env.DATABASE_URL =
  'postgresql://nextplay:nextplay@localhost:5432/nextplay_test'
process.env.IGDB_CLIENT_ID = 'test-client-id'
process.env.IGDB_CLIENT_SECRET = 'test-secret'
// Jamais d'appel réel à l'API Claude pendant les tests
delete process.env.ANTHROPIC_API_KEY
