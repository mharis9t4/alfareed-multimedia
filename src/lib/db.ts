import mysql from 'mysql2/promise';

// This utility connects your app to the database using your .env.local variables
export const db = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'alfareed_portal',
  password: process.env.DB_PASS || 'alfareed_johar@21',
  database: process.env.DB_NAME || 'alfareed_portal',
  port: 3306, // Standard MySQL port for Domain.pk
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
