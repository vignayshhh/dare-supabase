const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files
  dir: "./",
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you based on your tsconfig.json paths)
    "^@/services/auth\\.service$": "<rootDir>/src/middleware/services/auth.service.ts",
    "^@/services/(feed|dare|messaging|user|friends|presence)\\.service$": "<rootDir>/src/middleware/services/$1.service.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testEnvironment: "jest-environment-jsdom",
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/**", // Exclude Next.js app directory
    "!src/components/**", // Exclude UI components for service tests
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  testMatch: [
    "**/__tests__/**/*.(js|jsx|ts|tsx)",
    "**/*.(test|spec).(js|jsx|ts|tsx)",
  ],
  // Playwright QA specs run through `npm run qa:e2e`, not Jest.
  testPathIgnorePatterns: ["<rootDir>/tests/qa/"],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);
