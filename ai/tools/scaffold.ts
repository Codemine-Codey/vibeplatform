// Base scaffold files written to every sandbox immediately after creation.
// These 8 files are identical across all React+Vite projects — writing them
// once from a template means the AI skips them in generateFiles (token savings)
// and pnpm install runs in the background during AI generation (~25-35s saved).
export const SCAFFOLD_FILES: Array<{ path: string; content: string }> = [
  {
    path: '.npmrc',
    content: 'prefer-offline=true\nshamefully-hoist=true\n',
  },
  {
    path: 'package.json',
    content: JSON.stringify(
      {
        name: 'codemine-app',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite --port 3000',
          build: 'tsc -b && vite build',
          preview: 'vite preview',
        },
        dependencies: {
          'lucide-react': '^0.468.0',
          react: '^18.3.1',
          'react-dom': '^18.3.1',
          'react-router-dom': '^6.28.0',
        },
        devDependencies: {
          '@types/react': '^18.3.12',
          '@types/react-dom': '^18.3.1',
          '@vitejs/plugin-react': '^4.3.4',
          autoprefixer: '^10.4.20',
          postcss: '^8.4.49',
          tailwindcss: '^3.4.16',
          typescript: '^5.6.3',
          vite: '^6.0.5',
        },
      },
      null,
      2
    ),
  },
  {
    path: 'vite.config.ts',
    content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 3000,
  },
})
`,
  },
  {
    path: 'tailwind.config.js',
    content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
`,
  },
  {
    path: 'postcss.config.js',
    content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
  },
  {
    path: 'tsconfig.json',
    content: JSON.stringify(
      {
        files: [],
        references: [
          { path: './tsconfig.app.json' },
          { path: './tsconfig.node.json' },
        ],
      },
      null,
      2
    ),
  },
  {
    path: 'tsconfig.app.json',
    content: JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          noUncheckedSideEffectImports: true,
        },
        include: ['src'],
      },
      null,
      2
    ),
  },
  {
    path: 'tsconfig.node.json',
    content: JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2023'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          isolatedModules: true,
          moduleDetection: 'force',
          noEmit: true,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          noUncheckedSideEffectImports: true,
        },
        include: ['vite.config.ts'],
      },
      null,
      2
    ),
  },
]
