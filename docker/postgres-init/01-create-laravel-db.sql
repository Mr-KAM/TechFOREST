-- Crée une base supplémentaire pour l'application Laravel.
-- Le script est exécuté automatiquement par l'image postgres au premier démarrage
-- (uniquement si le volume de données est vide).
SELECT 'CREATE DATABASE techforest_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'techforest_app')\gexec

-- Active PostGIS dans la base Laravel (pour les colonnes geometry).
\connect techforest_app
CREATE EXTENSION IF NOT EXISTS postgis;
