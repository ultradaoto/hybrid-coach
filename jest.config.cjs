/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/Archive/'],
  modulePathIgnorePatterns: ['<rootDir>/Archive/'],
  watchPathIgnorePatterns: ['<rootDir>/Archive/'],
};
