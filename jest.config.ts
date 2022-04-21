const config = {
  transform: {
    '^.+\\.[tj]s?$': 'ts-jest',
  },
  collectCoverage: true,
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/lib/'],
  transformIgnorePatterns: ['/node_modules/'],
};

export default config;
