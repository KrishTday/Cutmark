import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'node_modules/**', '.turbo/**', 'public/ffmpeg/**', 'public/ffmpeg-mt/**'],
  },
];

export default eslintConfig;
