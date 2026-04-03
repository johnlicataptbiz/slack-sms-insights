{
  "name": "ptbizsms-dashboard",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "format": "biome format src --write"
  },
  "dependencies": {
    "@radix-ui/react-icons": "^1.3.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "react": "^19.0.0-beta-26f2416093-20240202",
    "react-dom": "^19.0.0-beta-26f2416093-20240202",
    "tailwind-merge": "^2.2.2"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.6.3",
    "@testing-library/jest-dom": "^6.3.0",
    "@testing-library/react": "^14.2.1",
    "@testing-library/react-hooks": "^8.0.1",
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react-swc": "^3.6.0",
    "@vitest/coverage-v8": "^1.4.0",
    "autoprefixer": "^10.4.19",
    "jsdom": "^24.0.0",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.3",
    "typescript": "^5.4.2",
    "vite": "^5.2.8",
    "vitest": "^1.4.0"
  }
}