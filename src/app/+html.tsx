import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

import { brand } from '@/lib/ui/design-system';

/**
 * Web-only root HTML, rendered in Node during static export.
 * Brand typeface: Noto Sans, the open twin of the LAKAD wordmark's Segoe UI Black.
 * The id-scoped rule outranks React Native Web's system-font class, while icon
 * fonts keep working because they are set as inline styles.
 */
const brandCss = `
:root { --lakad-font: ${brand.font}; }
html, body { font-family: var(--lakad-font); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
#root, #root * { font-family: var(--lakad-font); }
#root [role="button"], #root [role="link"], #root [role="radio"], #root [role="tab"], #root [tabindex="0"] {
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}
#root input, #root textarea, #root select { transition: border-color 160ms ease, box-shadow 160ms ease; }
:focus-visible { outline: 2px solid ${brand.sky}; outline-offset: 2px; }
::selection { background: rgba(24, 80, 224, 0.22); }
@media (prefers-reduced-motion: reduce) { #root * { transition: none !important; animation: none !important; } }
`;

export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content={brand.navy} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500;600;700;800;900&display=swap" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: brandCss }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
